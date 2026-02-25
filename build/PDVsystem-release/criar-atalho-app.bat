@echo off
REM Cria um atalho PDVsystem.lnk na mesma pasta deste script para abrir o app em modo Chrome app

set SHORTCUT_NAME=PDVsystem.lnk
set APP_URL=http://localhost:8787
set CHROME_PATH=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME_PATH%" set CHROME_PATH=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME_PATH%" set CHROME_PATH=%LocalAppData%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME_PATH%" (
  echo Chrome não encontrado! Instale o Google Chrome para usar o modo app.
  pause
  exit /b 1
)
set SHORTCUT_PATH=%~dp0%SHORTCUT_NAME%
call powershell $s=(New-Object -COM WScript.Shell).CreateShortcut('%SHORTCUT_PATH%');$s.TargetPath='%CHROME_PATH%';$s.Arguments='--app=%APP_URL%';$s.Save()

echo Atalho criado em %SHORTCUT_PATH%
pause
