#!/usr/bin/env bash
#
# Liga a cobrança do valtatcg na conta do Asaas da Omva, no servidor.
#
# Existe para que ligar a cobrança seja UM comando, e não um bloco de shell colado à mão — colar chave secreta
# em terminal é onde erro acontece (chave colada em dobro, 401 em toda resposta; token do webhook que não bate
# com o do painel, e ninguém é liberado ao pagar).
#
# O que ele faz:
#   1. pergunta o ambiente (sandbox ou produção);
#   2. lê a chave da API sem mostrar na tela e confere o formato ANTES de salvar;
#   3. pergunta ao próprio Asaas de quem é a chave, e só segue em produção se for a conta da Omva;
#   4. gera o token do webhook (ou reaproveita o que já existe);
#   5. grava no .env e reinicia o serviço;
#   6. cadastra (ou atualiza) o webhook no Asaas pela API, com o token certo — sem copiar e colar token.
#
# Os outros produtos da Omva (omvazap, omvalic) usam a MESMA conta do Asaas, cada um com o seu webhook. O Asaas
# manda todo evento para todos os webhooks; o valtatcg ignora o que não é dele (referência "usuario:ID" ou "loja:ID").
#
# Uso, como root:  bash /opt/valtatcg/app/scripts/configurar-asaas.sh

set -u

APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV="$APP/.env"
SERVICO="valtatcg"
URL_WEBHOOK="https://valtatcg.com.br/api/pagamento/asaas"
CNPJ_OMVA="69724570000120"
EMAIL_AVISO_PADRAO="financeiro@omva.com.br"

vermelho() { printf '\033[31m%s\033[0m\n' "$*"; }
verde()    { printf '\033[32m%s\033[0m\n' "$*"; }
titulo()   { printf '\n\033[1m%s\033[0m\n' "$*"; }

abortar() {
  vermelho "$*"
  vermelho "NADA foi alterado. Rode o comando de novo quando quiser."
  exit 1
}

# Lê um campo de um JSON que está num arquivo (sem depender de jq no servidor).
campo_json() { # arquivo, campo
  node -e 'try{const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=j[process.argv[2]];console.log(v===undefined||v===null?"":v)}catch{console.log("")}' "$1" "$2"
}

[ -f "$ENV" ] || abortar "Não encontrei o arquivo de configuração em $ENV."
[ "$(id -u)" = "0" ] || abortar "Este script precisa rodar como root (entre com: ssh root@...)."
command -v node >/dev/null 2>&1 || abortar "Não encontrei o node neste servidor."

titulo "Cobrança do valtatcg no Asaas da Omva"
echo "Arquivo de configuração: $ENV"

# ------------------------------------------------------------------
# 1. Ambiente
# ------------------------------------------------------------------
titulo "1 de 4 — Qual ambiente?"
echo "  [1] sandbox  — testes, dinheiro de mentira (conta de testes separada da real)"
echo "  [2] produção — cobra de verdade, na conta da Omva"
echo
read -rp "Digite 1 ou 2: " escolha

case "$escolha" in
  1) AMBIENTE="sandbox" ;;
  2)
    echo
    vermelho "Produção cobra dinheiro de verdade dos usuários e das lojas."
    read -rp 'Para confirmar, digite a palavra PRODUCAO: ' confirma
    [ "$confirma" = "PRODUCAO" ] || abortar "Confirmação não bateu."
    AMBIENTE="producao"
    ;;
  *) abortar "Opção inválida: digite 1 ou 2." ;;
esac

verde "Ambiente escolhido: $AMBIENTE"

# ------------------------------------------------------------------
# 2. Chave da API
# ------------------------------------------------------------------
titulo "2 de 4 — Chave da API"
echo "Pegue em: painel do Asaas da Omva → Integrações → Chaves de API"
echo "Ela começa com \$aact_ e é longa (~160 caracteres)."
echo
echo "Cole a chave e tecle Enter. Ela NÃO aparece na tela enquanto você cola —"
echo "isso é de propósito; o script confere o formato e te avisa se vier errada."
echo
read -rsp "Chave: " CHAVE
echo

TAMANHO=${#CHAVE}
echo "Recebi $TAMANHO caracteres."

[ "$TAMANHO" -gt 0 ] || abortar "Você não colou nada."

case "$CHAVE" in
  '$aact_'*) : ;;
  *) abortar "Isso não parece uma chave do Asaas — ela começa com \$aact_ e esta não começa." ;;
esac

# O erro clássico é colar DUAS vezes sem perceber, já que a tela não mostra nada: tudo parece certo e toda resposta
# volta 401. Conferir por tamanho não pega; contar o prefixo pega (uma chave tem UM \$aact_).
REPETICOES="$(printf '%s' "$CHAVE" | grep -o '\$aact_' | wc -l | tr -d ' ')"
[ "$REPETICOES" -le 1 ] || abortar "A chave aparece $REPETICOES vezes — você colou mais de uma vez. Copie de novo e cole UMA vez só."

[ "$TAMANHO" -ge 100 ] || abortar "Curta demais para uma chave do Asaas — a colagem veio incompleta."

case "$CHAVE" in
  *[![:print:]]*) abortar "A chave tem caractere invisível (quebra de linha ou tab). Copie de novo, só a chave." ;;
esac

verde "Formato conferido: ${CHAVE:0:12}...${CHAVE: -4}"

BASE_API="https://api.asaas.com/v3"
[ "$AMBIENTE" = "sandbox" ] && BASE_API="https://api-sandbox.asaas.com/v3"

# A chave vai para o curl por arquivo de cabeçalho, nunca na linha de comando (que aparece em "ps" para outros usuários).
CABECALHO="$(mktemp)"
RESP_ARQ="$(mktemp)"
trap 'rm -f "$CABECALHO" "$RESP_ARQ"' EXIT
chmod 600 "$CABECALHO" "$RESP_ARQ"
printf 'access_token: %s\n' "$CHAVE" > "$CABECALHO"

# Chamada à API do Asaas: resposta no arquivo $RESP_ARQ, código HTTP na saída.
asaas() { # metodo, caminho, [corpo-json]
  if [ "$#" -ge 3 ]; then
    curl -s --max-time 20 -o "$RESP_ARQ" -w "%{http_code}" -X "$1" "$BASE_API$2" -H @"$CABECALHO" \
      -H "User-Agent: valtatcg" -H "Content-Type: application/json" --data-binary "$3" 2>/dev/null
  else
    curl -s --max-time 20 -o "$RESP_ARQ" -w "%{http_code}" -X "$1" "$BASE_API$2" -H @"$CABECALHO" \
      -H "User-Agent: valtatcg" 2>/dev/null
  fi
}

# ------------------------------------------------------------------
# 3. De quem é esta chave?
# ------------------------------------------------------------------
titulo "3 de 4 — Conferindo a conta no Asaas"

CODIGO="$(asaas GET /myAccount/status)"
case "$CODIGO" in
  200)
    verde "O Asaas aceitou a chave no ambiente $AMBIENTE."
    GERAL="$(campo_json "$RESP_ARQ" general)"
    BANCO="$(campo_json "$RESP_ARQ" bankAccountInfo)"
    echo "Situação do cadastro: general=${GERAL:-?}  bankAccountInfo=${BANCO:-?}"
    if [ "$AMBIENTE" = "producao" ] && [ "$GERAL" != "APPROVED" ]; then
      vermelho "A conta ainda não está APROVADA no Asaas: em produção ela só recebe depois da aprovação."
    fi
    ;;
  401|403) abortar "O Asaas RECUSOU esta chave no ambiente $AMBIENTE (HTTP $CODIGO). Confira se ela é da conta da Omva e do ambiente certo: chave de sandbox não vale em produção, nem o contrário." ;;
  *) vermelho "Não consegui conferir a chave com o Asaas agora (HTTP ${CODIGO:-sem resposta}). Vou seguir só com a conferência de formato." ;;
esac

if [ "$AMBIENTE" = "producao" ]; then
  CODIGO="$(asaas GET /myAccount/commercialInfo)"
  if [ "$CODIGO" = "200" ]; then
    DOCUMENTO="$(campo_json "$RESP_ARQ" cpfCnpj | tr -cd '0-9')"
    if [ "$DOCUMENTO" = "$CNPJ_OMVA" ]; then
      verde "✔ Esta chave é da conta da OMVA (CNPJ 69.724.570/0001-20)."
    elif [ -n "$DOCUMENTO" ]; then
      vermelho "ATENÇÃO: esta chave é de OUTRO documento (termina em ...${DOCUMENTO: -4}), não do CNPJ da Omva."
      vermelho "Com ela, o dinheiro das assinaturas cairia nessa outra conta."
      read -rp 'Se é isso mesmo que você quer, digite OUTRA CONTA: ' ok_outra
      [ "$ok_outra" = "OUTRA CONTA" ] || abortar "Confirmação não bateu."
    else
      vermelho "Não consegui ler de quem é a chave (o Asaas não devolveu o documento)."
      read -rp 'Tem certeza de que é a chave da conta da Omva? [s/N]: ' certeza
      case "$certeza" in s|S) : ;; *) abortar "Pegue a chave na conta da Omva e rode de novo." ;; esac
    fi
  else
    vermelho "Não consegui consultar os dados da conta (HTTP ${CODIGO:-sem resposta})."
    read -rp 'Tem certeza de que é a chave da conta da Omva? [s/N]: ' certeza
    case "$certeza" in s|S) : ;; *) abortar "Pegue a chave na conta da Omva e rode de novo." ;; esac
  fi
fi

# ------------------------------------------------------------------
# 4. Token do webhook
# ------------------------------------------------------------------
titulo "4 de 4 — Token do webhook"

# Este token é SÓ do valtatcg: omvazap e omvalic têm o deles. Nunca é a chave da API (ele trafega a cada evento).
TOKEN_ATUAL="$(sed -n 's/^ASAAS_WEBHOOK_TOKEN=//p' "$ENV" | tr -d "'\"" | head -1)"

if [ -n "$TOKEN_ATUAL" ]; then
  echo "Já existe um token cadastrado aqui."
  read -rp "Gerar um token NOVO? (o webhook no Asaas é atualizado junto, por este script) [s/N]: " trocar
  case "$trocar" in
    s|S) TOKEN="$(openssl rand -hex 32)" ;;
    *)   TOKEN="$TOKEN_ATUAL" ;;
  esac
else
  TOKEN="$(openssl rand -hex 32)"
fi

[ -n "$TOKEN" ] || abortar "Não consegui gerar o token (openssl falhou)."

# ------------------------------------------------------------------
# Gravar
# ------------------------------------------------------------------
DONO="$(stat -c '%U:%G' "$ENV")"
cp "$ENV" "$ENV.antes-do-asaas"

sed -i '/^ASAAS_/d' "$ENV"
{
  printf '\n# Gateway de pagamento (conta da Omva) — configurado em %s\n' "$(date '+%d/%m/%Y %H:%M')"
  printf 'ASAAS_AMBIENTE=%s\n' "$AMBIENTE"
  printf "ASAAS_API_KEY='%s'\n" "$CHAVE"
  printf 'ASAAS_WEBHOOK_TOKEN=%s\n' "$TOKEN"
} >> "$ENV"

chown "$DONO" "$ENV"
chmod 600 "$ENV"
unset CHAVE

systemctl restart "$SERVICO"
sleep 3

# ------------------------------------------------------------------
# Conferir o sistema
# ------------------------------------------------------------------
titulo "Resultado"

PORTA="$(sed -n 's/^PORT=//p' "$ENV" | tr -d "'\" " | head -1)"
PORTA="${PORTA:-3300}"

# Sem token, a resposta certa da rota do webhook é "não autorizado": prova de que a porta existe e está trancada.
RESPOSTA="$(curl -s --max-time 10 -X POST "http://localhost:$PORTA/api/pagamento/asaas" \
  -H 'Content-Type: application/json' -d '{"event":"PING"}' 2>/dev/null)"

case "$RESPOSTA" in
  *"não autorizado"*)
    verde "✔ Gateway Asaas ativo no ambiente $AMBIENTE."
    verde "✔ Webhook de pé e exigindo o token, como deve ser."
    ;;
  *"gateway não configurado"*)
    vermelho "O sistema subiu, mas NÃO enxergou a chave."
    echo "Confira se a linha ASAAS_API_KEY ficou certa em $ENV."
    echo "A configuração anterior está guardada em $ENV.antes-do-asaas"
    ;;
  *)
    vermelho "Não consegui confirmar o estado do gateway."
    echo "Resposta recebida: ${RESPOSTA:-(vazia — o sistema pode não ter subido)}"
    echo "Veja o que aconteceu com:  journalctl -u $SERVICO -n 30 --no-pager"
    echo "A configuração anterior está guardada em $ENV.antes-do-asaas"
    ;;
esac

# ------------------------------------------------------------------
# Webhook no Asaas (pela API)
# ------------------------------------------------------------------
titulo "Webhook no Asaas"

read -rp "E-mail que o Asaas avisa se o webhook parar de funcionar [$EMAIL_AVISO_PADRAO]: " EMAIL_AVISO
EMAIL_AVISO="${EMAIL_AVISO:-$EMAIL_AVISO_PADRAO}"

# O corpo é montado pelo node (que cuida das aspas); o token entra por variável de ambiente, nunca como argumento.
CORPO="$(WH_TOKEN="$TOKEN" WH_URL="$URL_WEBHOOK" WH_EMAIL="$EMAIL_AVISO" node -e '
console.log(JSON.stringify({
  name: "valtatcg",
  url: process.env.WH_URL,
  email: process.env.WH_EMAIL,
  enabled: true,
  interrupted: false,
  apiVersion: 3,
  authToken: process.env.WH_TOKEN,
  sendType: "SEQUENTIALLY",
  events: ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_OVERDUE", "PAYMENT_REFUNDED", "PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_RECEIVED_IN_CASH_UNDONE"],
}));
')"

# Já existe um webhook com esta URL (rodada anterior)? Então atualiza, em vez de criar um segundo.
ID_EXISTENTE=""
CODIGO="$(asaas GET "/webhooks?limit=100")"
if [ "$CODIGO" = "200" ]; then
  ID_EXISTENTE="$(WH_URL="$URL_WEBHOOK" node -e 'try{const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const w=(j.data||[]).find((x)=>x.url===process.env.WH_URL);console.log(w?w.id:"")}catch{console.log("")}' "$RESP_ARQ")"
fi

WEBHOOK_OK=nao
if [ -n "$ID_EXISTENTE" ]; then
  CODIGO="$(asaas PUT "/webhooks/$ID_EXISTENTE" "$CORPO")"
  [ "$CODIGO" = "200" ] && { WEBHOOK_OK=sim; verde "✔ Webhook do valtatcg ATUALIZADO no Asaas (já existia para $URL_WEBHOOK)."; }
else
  CODIGO="$(asaas POST /webhooks "$CORPO")"
  case "$CODIGO" in 200|201) WEBHOOK_OK=sim; verde "✔ Webhook do valtatcg CRIADO no Asaas ($URL_WEBHOOK)." ;; esac
fi

if [ "$WEBHOOK_OK" != "sim" ]; then
  vermelho "Não consegui cadastrar o webhook pela API (HTTP ${CODIGO:-sem resposta})."
  echo "Cadastre à mão: painel do Asaas → Integrações → Webhooks → Adicionar"
  echo
  echo "  Nome:   valtatcg"
  echo "  URL:    $URL_WEBHOOK"
  echo "  Token:  $TOKEN"
  echo "  Eventos: PAYMENT_CONFIRMED, PAYMENT_RECEIVED, PAYMENT_OVERDUE, PAYMENT_REFUNDED,"
  echo "           PAYMENT_CHARGEBACK_REQUESTED, PAYMENT_RECEIVED_IN_CASH_UNDONE"
  echo
  vermelho "Sem esse cadastro, ninguém é liberado ao pagar: o Asaas não tem como avisar o sistema de que o dinheiro entrou."
fi

echo
echo "Para conferir de fora que a porta está de pé:"
echo "  curl -s -X POST $URL_WEBHOOK -d '{}' -H 'Content-Type: application/json'"
echo "  (resposta esperada: {\"erro\":\"não autorizado\"} — a rota está viva e exigindo o token.)"
echo
echo "Próximo passo: faça uma assinatura de teste de verdade (você mesmo, no site) e confira que o"
echo "pagamento libera a conta. Detalhes em docs/cobranca-asaas.md"
echo
