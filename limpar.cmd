@echo off
chcp 65001 >nul
cd /d "%~dp0"
title valtatcg - comecar do zero
echo.
echo  ============================================
echo    COMECAR DO ZERO
echo  ============================================
echo.
echo  Isso apaga toda a colecao e os usuarios
echo  cadastrados no valtatcg.
echo.
echo  IMPORTANTE: feche a janela do valtatcg antes.
echo.
set /p resposta="Digite SIM para confirmar: "
if /i not "%resposta%"=="SIM" goto cancelado

del /q data\valtatcg.db data\valtatcg.db-wal data\valtatcg.db-shm 1>nul 2>nul

if exist data\valtatcg.db goto emuso

echo.
echo  Pronto! Tudo apagado.
echo.
echo  Agora abra o iniciar.cmd e acesse:
echo     http://localhost:3300
echo.
pause
exit /b

:emuso
echo.
echo  NAO deu certo: o valtatcg ainda esta aberto.
echo.
echo  Feche a janela preta do valtatcg (ou aperte
echo  Ctrl+C nela) e rode este limpar.cmd de novo.
echo.
pause
exit /b

:cancelado
echo.
echo  Cancelado. Nada foi apagado.
echo.
pause
