@echo off
setlocal

cd /d "%~dp0"

set "SERVER_SCRIPT=%~dp0tools\local-server.ps1"

if not exist "%SERVER_SCRIPT%" (
  echo [ERROR] Server script was not found: "%SERVER_SCRIPT%"
  goto end_error
)

where powershell.exe >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Windows PowerShell was not found.
  goto end_error
)

echo Starting MVTGO2 local website...
echo URL: http://localhost:8080/
echo Press Ctrl+C to stop the server.
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SERVER_SCRIPT%" -RootPath "%CD%" -Port 8080
set "SERVER_EXIT=%ERRORLEVEL%"

echo.
if not "%SERVER_EXIT%"=="0" echo [ERROR] Local server exited with code %SERVER_EXIT%.
if "%SERVER_EXIT%"=="0" echo Local server stopped.
echo Press any key to close this window.
pause >nul
exit /b %SERVER_EXIT%

:end_error
echo Press any key to close this window.
pause >nul
exit /b 1
