#!/usr/bin/env bash
# One-time EC2 setup for Ubuntu 22.04 / 24.04.   Run on the server:  bash setup-ec2.sh
set -euo pipefail

echo ">> Installing packages (nginx, rsync, Node.js 20, pm2)"
sudo apt-get update -y
sudo apt-get install -y nginx rsync curl ca-certificates
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2

echo ">> Creating app folder"
mkdir -p "$HOME/jee-exam-simple"

echo ">> Configuring nginx (port 80 -> app on port 5000)"
sudo tee /etc/nginx/sites-available/jee >/dev/null <<'NGINX'
server {
    listen 80 default_server;
    server_name _;
    client_max_body_size 1m;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/jee /etc/nginx/sites-enabled/jee
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx

echo ">> Making pm2 start on reboot"
sudo env PATH="$PATH" pm2 startup systemd -u "$USER" --hp "$HOME"

echo
echo "Done. Next: create $HOME/jee-exam-simple/.env  (see DEPLOY.md, step 5)"
