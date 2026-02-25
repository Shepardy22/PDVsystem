REM Instala PM2 globalmente e configura inicialização automática no Windows
echo [1/5] Instalando PM2 globalmente...
call npm install -g pm2 --silent >pm2-global.log 2>&1
if %errorlevel% neq 0 (
  call powershell -Command "Write-Host 'Falha ao instalar PM2 global. Veja pm2-global.log para detalhes.' -ForegroundColor Red"
  pause
  exit /b 1
)
call powershell -Command "Write-Host 'PM2 instalado globalmente.' -ForegroundColor Green"

echo [2/5] Instalando utilitário pm2-windows-startup...
call npm install -g pm2-windows-startup --silent >pm2-windows-startup.log 2>&1
if %errorlevel% neq 0 (
  call powershell -Command "Write-Host 'Falha ao instalar pm2-windows-startup. Veja pm2-windows-startup.log para detalhes.' -ForegroundColor Yellow"
  REM Não interrompe a instalação, apenas alerta
)
echo [2/5] Configurando PM2 para iniciar com o Windows...
call pm2-startup install >pm2-startup.log 2>&1
if %errorlevel% neq 0 (
  call powershell -Command "Write-Host 'Falha ao configurar PM2 startup. Veja pm2-startup.log para detalhes.' -ForegroundColor Yellow"
  REM Não interrompe a instalação, apenas alerta
)
call powershell -Command "Write-Host 'PM2 configurado para iniciar com o Windows.' -ForegroundColor Green"
@echo off
setlocal
cd /d %~dp0

REM Exibe título com cor
call powershell -Command "Write-Host '==== INSTALACAO PDVsystem ====' -ForegroundColor Cyan"

echo [3/5] Instalando dependencias de producao...
call npm ci --production --silent >install.log 2>&1
if %errorlevel% neq 0 (
  call powershell -Command "Write-Host 'Falha ao instalar dependencias. Veja install.log para detalhes.' -ForegroundColor Red"
  pause
  exit /b 1
)

call powershell -Command "Write-Host 'Dependencias instaladas com sucesso.' -ForegroundColor Green"

echo [4/5] Aplicando migrations do banco de dados...
call npm run migrate >migrate.log 2>&1
if %errorlevel% neq 0 (
  call powershell -Command "Write-Host 'Falha ao aplicar migrations. Veja migrate.log para detalhes.' -ForegroundColor Red"
  pause
  exit /b 1
)
call powershell -Command "Write-Host 'Migrations aplicadas com sucesso.' -ForegroundColor Green"

REM Ajusta numeração dos passos seguintes
echo [5/6] Iniciando backend em modo producao (PM2)...

REM ...existing code...
call pm2 delete PDVsystem >nul 2>&1
call pm2 start server/dist/index.js --name PDVsystem --env production --node-args="--env-file=.env" >start.log 2>&1
if %errorlevel% neq 0 (
  call powershell -Command "Write-Host 'Falha ao iniciar o backend com PM2. Veja start.log para detalhes.' -ForegroundColor Red"
  pause
  exit /b 1
)
call pm2 save >nul 2>&1
call powershell -Command "Write-Host 'Backend iniciado com sucesso via PM2.' -ForegroundColor Green"

echo [6/6] Criando atalho do app (modo Chrome app)...
set SHORTCUT_NAME=PDVsystem.lnk
set APP_URL=http://localhost:8787
set CHROME_PATH=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME_PATH%" set CHROME_PATH=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME_PATH%" set CHROME_PATH=%LocalAppData%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME_PATH%" (
  powershell -Command "Write-Host 'Chrome nao encontrado! Instale o Google Chrome para usar o modo app.' -ForegroundColor Red"
  pause
  exit /b 1
)

set SHORTCUT_PATH=%~dp0%SHORTCUT_NAME%
call powershell $s=(New-Object -COM WScript.Shell).CreateShortcut('%SHORTCUT_PATH%');$s.TargetPath='%CHROME_PATH%';$s.Arguments='--app=%APP_URL%';$s.Save()
call powershell -Command "Write-Host 'Atalho criado com sucesso.' -ForegroundColor Green"

call powershell -Command "Write-Host 'Pronto! Backend rodando e atalho criado.' -ForegroundColor Cyan"
echo Veja install.log para detalhes em caso de erro.
endlocal
