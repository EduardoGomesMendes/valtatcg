@echo off
chcp 65001 >nul
cd /d "%~dp0"
title valtatcg - testes
echo.
echo  Rodando os testes do valtatcg...
echo.
echo  --- acesso ---
node testes/acesso.teste.js
echo.
echo  --- colecao ---
node testes/colecao.teste.js
echo.
echo  --- precos ---
node testes/precos.teste.js
echo.
echo  --- admin ---
node testes/admin.teste.js
echo.
pause
