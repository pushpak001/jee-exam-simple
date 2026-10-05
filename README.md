# JEE Mock Test - simple version
One page (index.html) + questions.json + MySQL on AWS RDS. Login uses the MySQL `users` table; marks are saved in the MySQL `score` table.
Switching tabs/windows is counted; after MAX_TAB_SWITCHES (default 3) the test is auto-submitted.

    jee-exam-simple/
    ├─ index.html       the exam page (login > instructions > test > result > auto logout)
    ├─ questions.json   your 90 questions
    ├─ server.js        API + creates DB/tables automatically
    ├─ db.js            reads RDS settings from .env
    ├─ add-user.js      add a student
    ├─ .env             your settings (RDS host, user, password)
    ├─ package.json
    ├─ ecosystem.config.cjs   pm2 process settings (deployment)
    ├─ deploy/                setup-ec2.sh, check-questions.mjs
    ├─ .github/workflows/deploy.yml   GitHub Actions deployment
    └─ DEPLOY.md              step-by-step EC2 deployment guide

## 1. AWS RDS (once)
1. RDS > Create database > MySQL. Note the master username and password.
2. Connectivity: Public access = Yes (for testing from your computer).
3. VPC security group: add inbound rule  MySQL/Aurora  port 3306  source = My IP.
4. Copy the endpoint (e.g. mydb.abc123.ap-south-1.rds.amazonaws.com).

## 2. Configure
Edit .env: DB_HOST (endpoint), DB_USER, DB_PASS. The database (DB_NAME) is created automatically.

## 3. Run
    npm install
    npm start
Open http://localhost:5000   (first start creates tables and the demo user student1 / pass123)

## Database: only two tables (created automatically)
    users  (login_id, password)     - login uses this table only
    score  (login_id, marks)        - one row per student after submitting

## Add students / see marks
    npm run add-user -- rahul rahul@123          (password is stored as plain text)

    SELECT login_id, marks FROM score ORDER BY marks DESC;
    DELETE FROM score WHERE login_id = 'rahul';  -- lets that student retake the test
You can also add users directly in MySQL:  INSERT INTO users (login_id, password) VALUES ('rahul','rahul@123');

## questions.json
    { "id": 1, "subject": "Physics", "question": "text", "options": ["a","b","c","d"], "answer": "C" }
subject = Physics | Chemistry | Mathematics; answer = A | B | C | D. Restart the server after editing.

## Notes
- A browser cannot talk to MySQL directly, so server.js sits in between (it also keeps correct answers private).
- Tab-switch detection records and penalises; it cannot physically stop a student from switching.
- For real exams: use HTTPS, a strong JWT_SECRET, and run server.js on an EC2 instance in the same VPC as RDS (then turn Public access off).
