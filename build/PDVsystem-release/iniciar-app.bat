@echo off
cd /d %~dp0
npx pm2 start server/dist/index.js --name PDVsystem --env production --node-args="--env-file=.env"
npx pm2 save >nul 2>&1
exit