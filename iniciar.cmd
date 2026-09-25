@echo off
chcp 65001 >nul
cd /d "%~dp0"
title valtatcg
echo.
echo  Iniciando o valtatcg...
echo  Painel: http://localhost:3300
echo  Para parar: feche esta janela ou aperte Ctrl+C
echo.
node src/index.js
echo.
echo  O valtatcg parou. Aperte uma tecla para fechar.
pause >nul
