@echo off
cd /d %~dp0

IF NOT EXIST "node_modules" call npm i

call npm run start
pause
