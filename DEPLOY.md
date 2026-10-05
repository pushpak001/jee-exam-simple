# Deploy to AWS EC2 with GitHub Actions (SSH)

Flow: you push to GitHub (main) -> GitHub Actions checks the code -> copies files to EC2 over SSH
-> installs packages -> restarts the app with pm2 -> nginx serves it on port 80.
The database is your AWS RDS MySQL. Secrets stay on the server (.env), never in GitHub.

## 1. Put the project on GitHub
    cd jee-exam-simple
    git init
    git add .
    git status                  # make sure .env is NOT listed
    git commit -m "first commit"
    git branch -M main
    git remote add origin https://github.com/YOUR-USER/YOUR-REPO.git
    git push -u origin main
(The first push will fail the deploy job because the server is not ready yet. That is fine.)

## 2. Launch the EC2 server
- AMI: Ubuntu Server 22.04 or 24.04, type t3.micro (or bigger)
- Key pair: create one and download the .pem file (keep it safe)
- Security group inbound rules:
    SSH   22   (see note below)
    HTTP  80   anywhere
    HTTPS 443  anywhere
- Allocate an Elastic IP and attach it, so the address never changes.
- Use the same region/VPC as your RDS database.
Note on port 22: GitHub's servers have changing IP addresses, so SSH must be open to the internet.
This is acceptable because only your key can log in. Never enable password login.

## 3. Let EC2 reach RDS
RDS > your database > VPC security group > Inbound rules > add
    Type MySQL/Aurora, port 3306, Source = the EC2 instance's security group
You can now turn "Public access" off on RDS.

## 4. One-time server setup
From your computer:
    chmod 400 your-key.pem
    scp -i your-key.pem deploy/setup-ec2.sh ubuntu@YOUR_EC2_IP:~
    ssh -i your-key.pem ubuntu@YOUR_EC2_IP
    bash setup-ec2.sh
This installs Node 20, nginx, pm2 and sets nginx to forward port 80 to the app.

## 5. Create the .env on the server
Still on the server:
    nano ~/jee-exam-simple/.env
Paste and edit:
    DB_HOST=your-db.xxxxxxxxxxxx.ap-south-1.rds.amazonaws.com
    DB_PORT=3306
    DB_USER=admin
    DB_PASS=your-rds-password
    DB_NAME=jee_exam
    DB_SSL=true
    DB_CA_FILE=
    JWT_SECRET=paste-output-of: openssl rand -hex 32
    PORT=5000
    TEST_MINUTES=120
    MAX_TAB_SWITCHES=3
Save with Ctrl+O, Enter, Ctrl+X. Then:  chmod 600 ~/jee-exam-simple/.env

## 6. Add GitHub secrets
GitHub repo > Settings > Secrets and variables > Actions > New repository secret
    EC2_HOST      your Elastic IP (or domain)
    EC2_USER      ubuntu
    EC2_SSH_KEY   the FULL contents of your .pem file, including the BEGIN and END lines
    EC2_PORT      (optional) only if SSH is not on port 22

## 7. Deploy
- Push any change to main, or open the repo's Actions tab > "Deploy to EC2" > Run workflow.
- Watch the three stages: Check code, Deploy, Health check. All should be green.
- Open http://YOUR_EC2_IP . First start creates the tables and the demo user student1 / pass123.

## 8. Everyday use
- Change questions: edit questions.json, commit, push. It deploys itself (the check stops bad JSON).
- Add a student (on the server):
      cd ~/jee-exam-simple && npm run add-user -- rahul secret123
- Logs:    pm2 logs jee-exam          Status: pm2 status          Restart: pm2 restart jee-exam
- Change a setting (e.g. TEST_MINUTES): edit ~/jee-exam-simple/.env, then pm2 restart jee-exam --update-env
- Delete the demo user before a real exam (run in MySQL):  DELETE FROM users WHERE login_id='student1';
- Let a student retake the test (run in MySQL):  DELETE FROM score WHERE login_id='rahul';

## 9. HTTPS (strongly recommended: passwords travel over this connection)
You need a domain pointing to the Elastic IP (A record). On the server:
    sudo apt-get install -y certbot python3-certbot-nginx
    sudo certbot --nginx -d exam.yourdomain.com
Then set EC2_HOST to the domain if you like.

## Troubleshooting
| Problem | Fix |
|---|---|
| Permission denied (publickey) | EC2_SSH_KEY is wrong or incomplete; paste the whole .pem; EC2_USER must be ubuntu |
| ssh-keyscan / connection timed out | Security group does not allow port 22, or EC2_HOST is wrong |
| ".env is missing on the server" | Do step 5 |
| Health check fails | On the server run: pm2 logs jee-exam   (usually a wrong .env value) |
| ETIMEDOUT to the database | RDS security group must allow 3306 from the EC2 security group (step 3) |
| ER_ACCESS_DENIED_ERROR | DB_USER / DB_PASS in the server .env are wrong |
| 502 Bad Gateway | App is not running: pm2 status, pm2 logs jee-exam |
| rsync: command not found | Re-run setup-ec2.sh (it installs rsync) |
