@echo off
setlocal
cd /d "%~dp0"
taskkill /F /IM LocalDock.exe >nul 2>nul
taskkill /F /IM LocalDock.Helper.exe >nul 2>nul
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000 " ^| findstr LISTENING') do taskkill /PID %%p /F >nul 2>nul
timeout /t 2 /nobreak >nul
call "%~dp0..\server\build-helper.bat"
if errorlevel 1 (
  echo Helper build FAILED. See server\helper\build.log
  pause
  exit /b 1
)
dotnet build LocalDock.Desktop.csproj -c Release -o bin > build.log 2>&1
if errorlevel 1 (
  echo Build FAILED. See desktop\build.log
  pause
  exit /b 1
)
echo Build OK: desktop\bin\LocalDock.exe
start "" "%~dp0bin\LocalDock.exe"
exit /b 0
