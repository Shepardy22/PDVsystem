@echo off
setlocal
set ROOT_DIR=%~dp0
set UPDATE_DIR=%ROOT_DIR%update

echo [ATUALIZADOR] Extraindo e aplicando arquivos da pasta 'update'...

if not exist "%UPDATE_DIR%" (
    echo [ERRO] Pasta 'update' NAO encontrada na raiz do projeto!
    pause
    exit /b 1
)

REM Copia todos os arquivos e subpastas da pasta update para a raiz do projeto
xcopy /e /i /y /c "%UPDATE_DIR%\*" "%ROOT_DIR%"

REM Limpa a pasta de atualização após aplicar (opcional)
rmdir /s /q "%UPDATE_DIR%"

echo [ATUALIZADOR] Atualização concluída!
pause
exit
