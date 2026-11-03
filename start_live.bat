@echo off
title Fresher Party All-In-One Automated Live Launcher
cd /d "%~dp0"

echo ================================================================
echo   Fresher Party System - Automated Launcher
echo ================================================================
echo.

REM 1. Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 goto install_node

goto check_modules

:install_node
echo [Setup] Node.js was not found on this computer.
echo [Setup] Starting automatic silent installation of Node.js LTS...
echo.

where winget >nul 2>nul
if %errorlevel% equ 0 (
    winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
) else (
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi', '$env:TEMP\node_setup.msi')"
    msiexec.exe /i "%TEMP%\node_setup.msi" /qn /norestart
    del "%TEMP%\node_setup.msi" >nul 2>nul
)

set "PATH=%PATH%;C:\Program Files\nodejs;%APPDATA%\npm"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [Notice] Node.js has been installed!
    echo Please close this window and double-click start_live.bat one more time.
    pause
    exit /b 0
)

:check_modules
REM 2. Check dependencies
if not exist "node_modules\" (
    echo [Setup] First time setup detected. Installing packages...
    call npm install
)

REM 3. Run launcher
echo.
echo [Setup] Starting system components...
node launch_live.js
pause
