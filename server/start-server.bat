@echo off
title LocalDock Server
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 18 or newer from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing dependencies...
  powershell -NoProfile -Command "npm install --omit=dev 2>&1 | Tee-Object -FilePath install.log"
)
if not exist "helper\bin\LocalDock.Helper.exe" call "%~dp0build-helper.bat"
powershell -NoProfile -Command "node src/index.js 2>&1 | Tee-Object -FilePath server.log"
echo.
echo Server stopped. See server.log
pause
