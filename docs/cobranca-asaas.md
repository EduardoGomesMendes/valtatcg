# Cobrança do valtatcg no Asaas da Omva

O valtatcg cobra pela **conta do Asaas da Omva** (CNPJ 69.724.570/0001-20), a mesma do omvazap e do omvalic.
Cada produto tem a **sua** chave de integração e o **seu** webhook (com token próprio). O Asaas manda todo
evento para todos os webhooks da conta; o valtatcg só age no que tem referência `usuario:ID` ou `loja:ID`
(ou assinatura dele) e ignora o resto **sem gravar**.

O que é cobrado: plano do usuário (`PRECO_MENSAL`, hoje R$ 9,97/mês, depois dos 7 dias de teste) e mensalidade
da loja (`PRECO_LOJA_MENSAL`, R$ 49,77/mês). O cliente escolhe Pix, boleto ou cartão na página do Asaas.

## Ligar (uma vez)

1. Publicar a versão que traz `scripts/configurar-asaas.sh` e esperar o servidor atualizar (~2 min).
2. No painel do Asaas **da Omva**: Integrações → Chaves de API → gerar uma chave nova para o valtatcg
   (nome sugerido: `valtatcg`). Não use a chave do omvazap: assim dá para revogar uma sem derrubar a outra.
3. No servidor, como root:
   ```
   bash /opt/valtatcg/app/scripts/configurar-asaas.sh
   ```
   O script pede a chave **sem mostrá-la**, confere no Asaas **de quem ela é** (só segue se for o CNPJ da Omva),
   grava no `.env`, reinicia o serviço e **cadastra o webhook pela API** (sem copiar token à mão).
4. A chave nunca passa por chat, e-mail ou commit.

## Conferir

- `curl -s -X POST https://valtatcg.com.br/api/pagamento/asaas -d '{}' -H 'Content-Type: application/json'`
  deve responder `{"erro":"não autorizado"}` (rota viva e trancada).
- No Asaas → Integrações → Webhooks: o webhook `valtatcg` aparece **ativo**, apontando para a URL acima.
- Teste de ponta a ponta com dinheiro de verdade: assine você mesmo no site, pague o Pix e veja a conta virar
  "ativa"; depois, se quiser, estorne a cobrança no painel (o webhook de estorno suspende a assinatura).
  Se a conta não liberar, `journalctl -u valtatcg -n 50 --no-pager` mostra se a notificação chegou
  ("notificação recusada: token ausente ou errado" = token do painel diferente do `.env`; rode o script de novo).

## Sandbox

A opção 1 do script usa o sandbox do Asaas (conta de testes **separada**, com chave própria). Serve para ensaiar
sem mexer em dinheiro. Em produção, qualquer cobrança cai na conta real da Omva.

## Taxas da conta (lidas da API em 21–22/10/2026)

Pix R$ 1,99 (100 por mês sem taxa), boleto R$ 1,99, cartão à vista 2,99% + R$ 0,49, mensageria R$ 0,99 por cobrança
com notificações ligadas. Na assinatura de R$ 9,97 a taxa pesa: reveja o preço do plano quando houver volume.
