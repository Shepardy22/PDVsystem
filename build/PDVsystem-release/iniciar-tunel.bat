@echo off
echo ====================================
echo INICIANDO TUNEL NGROK - PDVsystem
echo ====================================

REM 1. Verificar se o ngrok está instalado
where ngrok >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] Ngrok não encontrado no PATH!
    echo Instale o ngrok ou adicione-o às variáveis de ambiente.
    pause
    exit /b 1
)

REM 2. Iniciar o túnel usando o script node
pause
echo [INFO] O túnel ngrok não será mais iniciado automaticamente por este script.
REM Para iniciar manualmente, execute: npm run tunnel
pause
