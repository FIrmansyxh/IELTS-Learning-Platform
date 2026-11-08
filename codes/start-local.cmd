@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto nonode
if exist node_modules goto run
call npm ci
if errorlevel 1 goto cifail
:run
call npm run start:local -- %*
set CODE=%ERRORLEVEL%
if not "%CODE%"=="0" pause
exit /b %CODE%
:nonode
echo Node.js belum terpasang. Pasang Node.js 22.20 atau lebih baru dari https://nodejs.org
pause
exit /b 1
:cifail
set CODE=%ERRORLEVEL%
pause
exit /b %CODE%
