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
echo  --- assinaturas ---
node testes/assinaturas.teste.js
echo.
echo  --- avatar ---
node testes/avatar.teste.js
echo.
echo  --- seguranca ---
node testes/seguranca.teste.js
echo.
echo  --- lojas ---
node testes/lojas.teste.js
echo.
echo  --- forum ---
node testes/forum.teste.js
echo.
echo  --- eventos ---
node testes/eventos.teste.js
echo.
pause
