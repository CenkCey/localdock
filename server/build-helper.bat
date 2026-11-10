@echo off
setlocal
cd /d "%~dp0"
rem Output goes to helper\bin via -o; log is helper\build.log
dotnet build helper\LocalDock.Helper.csproj -c Release -o helper\bin > helper\build.log 2>&1
if errorlevel 1 (
  echo [helper] build FAILED, see helper\build.log
  exit /b 1
)
echo [helper] build OK: helper\bin\LocalDock.Helper.exe
exit /b 0
