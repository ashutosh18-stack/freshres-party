@echo off
title Fresher Party 1-Click Live Launcher
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo ================================================================
    echo  ERROR: Node.js is NOT installed on this computer!
    echo ================================================================
    echo  Please download and install Node.js (LTS version) from:
    echo  https://nodejs.org
    echo.
    echo  After installing Node.js, run this file again.
    echo ================================================================
    echo.
    pause
    exit /b 1
)

node launch_live.js
pause
