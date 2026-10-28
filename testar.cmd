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
echo  --- cadastro ---
node testes/cadastro.teste.js
echo.
echo  --- moderacao ---
node testes/moderacao.teste.js
echo.
echo  --- paginas ---
node testes/paginas.teste.js
echo.
echo  --- cambio ---
node testes/cambio.teste.js
echo.
echo  --- foto ---
node testes/foto.teste.js
echo.
echo  --- lojas-marca ---
node testes/lojas-marca.teste.js
echo.
echo  --- confirmacao-email ---
node testes/confirmacao-email.teste.js
echo.
echo  --- redefinir-senha ---
node testes/redefinir-senha.teste.js
echo.
echo  --- webhook-asaas ---
node testes/webhook-asaas.teste.js
echo.
echo  --- revisao-geral ---
node testes/revisao-geral.teste.js
echo.
pause
