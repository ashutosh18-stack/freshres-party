@echo off
setlocal enabledelayedexpansion
title Fresher Party All-In-One Automated Live Launcher
cd /d "%~dp0"

echo ================================================================
echo  🎉 Fresher Party System - Automated Launcher
echo ================================================================
echo.

:: 1. Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [Setup] Node.js was not found on this computer.
    echo [Setup] Starting automatic silent installation of Node.js LTS...
    echo [Setup] Please wait 1-2 minutes while Node.js is being downloaded and configured...
    echo.

    :: Try via winget first
    where winget >nul 2>nul
    if %errorlevel% equ 0 (
        echo [Setup] Installing Node.js via Windows Package Manager (winget)...
        winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    ) else (
        echo [Setup] Downloading official Node.js installer from nodejs.org...
        powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi', '%TEMP%\node_setup.msi')"
        echo [Setup] Running silent installer...
        msiexec.exe /i "%TEMP%\node_setup.msi" /qn /norestart
        del "%TEMP%\node_setup.msi" >nul 2>nul
    )

    :: Refresh PATH for current session
    set "PATH=%PATH%;C:\Program Files\nodejs;%APPDATA%\npm"
    
    where node >nul 2>nul
    if %errorlevel% neq 0 (
        echo.
        echo [Notice] Node.js has been installed! 
        echo Please close this window and double-click start_live.bat one more time to complete.
        pause
        exit /b 0
    )
    echo [Setup] Node.js successfully installed!
)

:: 2. Check if npm dependencies exist
if not exist "node_modules\" (
    echo.
    echo [Setup] First time setup on this PC detected.
    echo [Setup] Installing required libraries (npm install)...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo [Error] Failed to install packages. Please check internet connection.
        pause
        exit /b 1
    )
    echo [Setup] All packages installed successfully.
)

:: 3. Launch automated live orchestrator
echo.
echo [Setup] Starting system components...
node launch_live.js
pause
