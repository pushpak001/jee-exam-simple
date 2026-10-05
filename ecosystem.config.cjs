// pm2 process definition (keeps the app running and restarts it on crash/reboot)
module.exports = {
  apps: [{
    name: "jee-exam",
    script: "server.js",
    cwd: __dirname,                 // .env is read from this folder
    env: { NODE_ENV: "production" },
    max_restarts: 10,
  }],
};
