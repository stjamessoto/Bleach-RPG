@echo off
setlocal
cd /d "%~dp0"

start "Bleach RPG - GM Server" /min cmd /c "npm run server"
start "Bleach RPG - Dev Server" /min cmd /c "npm run dev"

timeout /t 5 /nobreak >nul

start "" msedge.exe --app=http://localhost:5173 --window-size=1400,900

endlocal
