#!/usr/bin/env bash
#
# Liga o backup diário do valtatcg no servidor (uma vez só).
#
# O que ele faz:
#   1. descobre com qual usuário o serviço "valtatcg" roda (o backup roda com o mesmo, para ler o banco);
#   2. cria /opt/valtatcg/backups, só desse usuário;
#   3. instala a unidade e o timer do systemd (todo dia às 03:30 de Brasília);
#   4. roda um backup agora e mostra o resultado, para você ver funcionando.
#
# Uso, como root:  bash /opt/valtatcg/app/scripts/instalar-backup.sh
# Roda de novo sem problema: só reescreve as duas unidades e o timer.

set -u

APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV="$APP/.env"
SERVICO="valtatcg"
DESTINO="/opt/valtatcg/backups"

vermelho() { printf '\033[31m%s\033[0m\n' "$*"; }
verde()    { printf '\033[32m%s\033[0m\n' "$*"; }
titulo()   { printf '\n\033[1m%s\033[0m\n' "$*"; }

abortar() {
  vermelho "$*"
  vermelho "NADA foi instalado. Rode o comando de novo quando quiser."
  exit 1
}

[ "$(id -u)" = "0" ] || abortar "Este script precisa rodar como root (entre com: ssh root@...)."
[ -f "$ENV" ] || abortar "Não encontrei o arquivo de configuração em $ENV."
NODE="$(command -v node)" || abortar "Não encontrei o node neste servidor."
systemctl cat "$SERVICO" >/dev/null 2>&1 || abortar "Não encontrei o serviço $SERVICO no systemd."

titulo "Backup diário do valtatcg"

USUARIO="$(systemctl show "$SERVICO" -p User --value)"
GRUPO="$(systemctl show "$SERVICO" -p Group --value)"
[ -n "$USUARIO" ] || USUARIO="root"
[ -n "$GRUPO" ] || GRUPO="$USUARIO"

# Onde está o banco: DATA_DIR do .env, ou a pasta data/ do aplicativo (o padrão do sistema).
DADOS="$(sed -n 's/^DATA_DIR=//p' "$ENV" | tr -d "'\"" | head -1)"
DADOS="${DADOS:-$APP/data}"
[ -f "$DADOS/valtatcg.db" ] || abortar "Não encontrei o banco em $DADOS/valtatcg.db."

echo "Aplicativo:  $APP"
echo "Banco:       $DADOS/valtatcg.db"
echo "Backups em:  $DESTINO"
echo "Usuário:     $USUARIO:$GRUPO"
echo "Node:        $NODE"

mkdir -p "$DESTINO"
chown "$USUARIO:$GRUPO" "$DESTINO"
chmod 700 "$DESTINO"

cat > /etc/systemd/system/valtatcg-backup.service <<UNIDADE
[Unit]
Description=valtatcg - backup diário do banco e dos arquivos (logos, fotos de perfil)
After=valtatcg.service

[Service]
Type=oneshot
User=$USUARIO
Group=$GRUPO
WorkingDirectory=$APP
Environment=DATA_DIR=$DADOS
Environment=BACKUP_DIR=$DESTINO
# --env-file só para o e-mail de aviso, se o backup falhar; o backup em si não lê segredo nenhum.
ExecStart=$NODE --env-file=$ENV scripts/backup.mjs
# Não atrapalha o site: prioridade baixa de CPU e de disco.
Nice=10
IOSchedulingClass=idle
StandardOutput=journal
StandardError=journal
SyslogIdentifier=valtatcg-backup
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=$DESTINO $DADOS
UNIDADE

cat > /etc/systemd/system/valtatcg-backup.timer <<UNIDADE
[Unit]
Description=valtatcg - backup diário às 03:30 (Brasília)

[Timer]
# 06:30 UTC = 03:30 em Brasília (sem horário de verão desde 2019): hora de menos movimento.
OnCalendar=*-*-* 06:30:00 UTC
# Se o servidor estava desligado na hora, faz o backup assim que voltar.
Persistent=true
RandomizedDelaySec=10min

[Install]
WantedBy=timers.target
UNIDADE

systemctl daemon-reload
systemctl enable --now valtatcg-backup.timer >/dev/null 2>&1

titulo "Rodando um backup agora, para conferir"
if systemctl start valtatcg-backup.service; then
  verde "✔ Backup feito."
  echo
  cat "$DESTINO/ULTIMO.json" 2>/dev/null
  echo
  ls -lh "$DESTINO" | sed -n '1,12p'
else
  vermelho "O backup de teste FALHOU. Veja o motivo com:"
  echo "  journalctl -u valtatcg-backup -n 30 --no-pager"
  exit 1
fi

titulo "Próximo backup automático"
systemctl list-timers valtatcg-backup.timer --no-pager | sed -n '1,3p'
echo
echo "Guia de restauração e da cópia fora do servidor: docs/backup-e-restauracao.md"
echo
