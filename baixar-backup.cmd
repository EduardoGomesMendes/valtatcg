@echo off
chcp 65001 >nul
rem Baixa o ultimo backup do servidor para este computador: uma copia FORA da VPS.
rem Duplo clique. Usa a mesma chave ssh do omvazap (%USERPROFILE%\.ssh\omvazap_vps), pois e o mesmo servidor.
set DESTINO=C:\omva\backups\valtatcg
if not exist "%DESTINO%" mkdir "%DESTINO%"
for /f "tokens=1-3 delims=/ " %%a in ("%date%") do set HOJE=%%c-%%b-%%a
echo Baixando o ultimo backup do valtatcg para %DESTINO% ...
scp -i "%USERPROFILE%\.ssh\omvazap_vps" root@91.108.121.35:/opt/valtatcg/backups/ULTIMO.json "%DESTINO%\ULTIMO-%HOJE%.json"
scp -i "%USERPROFILE%\.ssh\omvazap_vps" root@91.108.121.35:/opt/valtatcg/backups/ULTIMO-banco.db.gz "%DESTINO%\valtatcg-banco-%HOJE%.db.gz"
scp -i "%USERPROFILE%\.ssh\omvazap_vps" root@91.108.121.35:/opt/valtatcg/backups/ULTIMO-arquivos.tar.gz "%DESTINO%\valtatcg-arquivos-%HOJE%.tar.gz"
echo.
if errorlevel 1 (echo ALGO FALHOU. Confira a chave ssh e a internet.) else (echo Pronto. Os arquivos ficaram em %DESTINO%)
pause
