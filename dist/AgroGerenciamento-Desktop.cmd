@echo off
setlocal
cd /d C:\agro

echo Iniciando Agro Gerenciamento para desktop...
docker compose up -d

set "APP_URL=http://localhost:3000/?v=20260530b&desktop=1"
set "EDGE_EXE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
set "CHROME_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"

if exist "%EDGE_EXE%" (
  start "" "%EDGE_EXE%" --app="%APP_URL%"
  exit /b 0
)

if exist "%CHROME_EXE%" (
  start "" "%CHROME_EXE%" --app="%APP_URL%"
  exit /b 0
)

start "" "%APP_URL%"
