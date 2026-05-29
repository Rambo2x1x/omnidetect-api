@echo off
:: Temporarily add Node.js and NPM folder to PATH for this terminal window
set PATH=C:\Program Files\nodejs;C:\Users\avell\AppData\Roaming\npm;%PATH%

:: Navigate to this batch file's folder
cd /d "%~dp0"

echo ==========================================
echo Starting OmniDetect API Backend Server...
echo ==========================================

npm run dev

pause
