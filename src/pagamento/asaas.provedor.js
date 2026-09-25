import { timingSafeEqual } from 'node:crypto';
import { ProvedorPagamento, ErroDePagamento } from './provedor.js';
import { apenasDigitos } from '../documento.js';
import { criarLog } from '../logger.js';

const log = criarLog('asaas');

const ENDERECOS = {
  sandbox: 'https://api-sandbox.asaas.com/v3',
  producao: 'https://api.asaas.com/v3',
};

/*
  Eventos que mudam a vida da assinatura. O Asaas manda dezenas de tipos
  (visualização de boleto, análise de risco, split); só estes importam aqui.

  CONFIRMED  = o pagamento caiu, o dinheiro ainda não compensou (cartão, boleto)
  RECEIVED   = o dinheiro está na conta
  Os dois liberam o cliente: segurar o acesso até compensar seria puni-lo pela
  velocidade do banco.
*/
const EVENTOS = {
  PAYMENT_CONFIRMED: 'pagou',
  PAYMENT_RECEIVED: 'pagou',
  PAYMENT_OVERDUE: 'atrasou',
  PAYMENT_REFUNDED: 'estornou',
  PAYMENT_CHARGEBACK_REQUESTED: 'estornou',
  PAYMENT_RECEIVED_IN_CASH_UNDONE: 'estornou',
};

export class ProvedorAsaas extends ProvedorPagamento {
  /**
   * @param {{chave: string, ambiente: 'sandbox'|'producao', tokenWebhook: string}} opcoes
   */
  constructor({ chave, ambiente = 'sandbox', tokenWebhook = '' } = {}) {
    super();
    this.chave = chave ?? '';
    this.ambiente = ENDERECOS[ambiente] ? ambiente : 'sandbox';
    this.base = ENDERECOS[this.ambiente];
    this.tokenWebhook = tokenWebhook ?? '';
  }

  get nome() {
    return 'Asaas';
  }

  get configurado() {
    return Boolean(this.chave);
  }

  /* ---------------------------------------------------------------- */
  /* Conversa com a API                                                */
  /* ---------------------------------------------------------------- */

  async #chamar(caminho, { metodo = 'GET', corpo = null } = {}) {
    if (!this.configurado) {
      throw new ErroDePagamento('Gateway de pagamento não configurado.');
    }

    let resposta;
    try {
      resposta = await fetch(this.base + caminho, {
        method: metodo,
        headers: {
          access_token: this.chave,
          'Content-Type': 'application/json',
          // Obrigatório para contas criadas a partir de 13/06/2024.
          'User-Agent': 'valtatcg',
        },
        body: corpo ? JSON.stringify(corpo) : undefined,
        // Sem teto, uma indisponibilidade do gateway travaria a requisição
        // do cliente até o navegador desistir.
        signal: AbortSignal.timeout(20000),
      });
    } catch (erro) {
      log.error(`falha de rede em ${metodo} ${caminho}: ${erro.message}`);
      throw new ErroDePagamento('Não consegui falar com o Asaas agora. Tente de novo em alguns minutos.');
    }

    const texto = await resposta.text();
    let dados = null;
    try {
      dados = texto ? JSON.parse(texto) : null;
    } catch {
      dados = null;
    }

    if (!resposta.ok) {
      // O Asaas devolve { errors: [{ code, description }] }.
      const primeiro = dados?.errors?.[0];
      const mensagem = primeiro?.description || `Asaas respondeu ${resposta.status}.`;
      log.warn(`${metodo} ${caminho} -> ${resposta.status}: ${mensagem}`);
      throw new ErroDePagamento(mensagem, { codigo: primeiro?.code ?? null, status: resposta.status });
    }

    return dados;
  }

  /* ---------------------------------------------------------------- */
  /* Cliente                                                           */
  /* ---------------------------------------------------------------- */

  async garantirCliente({ nome, documento, email, usuarioId, clienteExistente = null }) {
    const corpo = {
      name: nome,
      cpfCnpj: apenasDigitos(documento),
      email: email || undefined,
      // Amarra o cliente do Asaas ao usuário daqui: se um dia for preciso
      // conferir no painel do Asaas de quem é a cobrança, o número está lá.
      externalReference: String(usuarioId),
      notificationDisabled: false,
    };

    if (clienteExistente) {
      try {
        const atualizado = await this.#chamar(`/customers/${clienteExistente}`, { metodo: 'POST', corpo });
        return atualizado.id;
      } catch (erro) {
        // Cliente apagado no painel do Asaas, ou id de outro ambiente
        // (sandbox x produção): cria de novo em vez de travar o pagamento.
        if (erro.status !== 404) throw erro;
        log.warn(`cliente ${clienteExistente} não existe mais no Asaas; criando outro`);
      }
    }

    const criado = await this.#chamar('/customers', { metodo: 'POST', corpo });
    log.info(`cliente ${criado.id} criado para o usuário ${usuarioId}`);
    return criado.id;
  }

  /* ---------------------------------------------------------------- */
  /* Assinatura                                                        */
  /* ---------------------------------------------------------------- */

  async criarAssinatura({ clienteId, preco, usuarioId, assinaturaExistente = null }) {
    // Reabrir não pode deixar duas recorrências ativas cobrando a mesma pessoa.
    if (assinaturaExistente) {
      await this.cancelarAssinatura(assinaturaExistente).catch((erro) => {
        log.warn(`não consegui cancelar a assinatura anterior ${assinaturaExistente}: ${erro.message}`);
      });
    }

    const nova = await this.#chamar('/subscriptions', {
      metodo: 'POST',
      corpo: {
        customer: clienteId,
        // UNDEFINED deixa a pessoa escolher PIX, boleto ou cartão na tela do
        // Asaas. Fixar um meio de pagamento só perderia venda.
        billingType: 'UNDEFINED',
        value: preco,
        nextDueDate: hoje(),
        cycle: 'MONTHLY',
        description: 'valtatcg — assinatura mensal',
        // É por aqui que o webhook descobre de quem é o pagamento.
        externalReference: `usuario:${usuarioId}`,
      },
    });

    log.info(`assinatura ${nova.id} criada para o usuário ${usuarioId}`);

    const cobranca = await this.cobrancaPendente(nova.id);

    return {
      id: nova.id,
      status: nova.status ?? 'ACTIVE',
      url: cobranca.url ?? nova.paymentLink ?? null,
      vencimento: cobranca.vencimento,
    };
  }

  async cancelarAssinatura(assinaturaId) {
    if (!assinaturaId) return;
    try {
      await this.#chamar(`/subscriptions/${assinaturaId}`, { metodo: 'DELETE' });
      log.info(`assinatura ${assinaturaId} cancelada no Asaas`);
    } catch (erro) {
      // Já removida no painel: o resultado desejado já é o atual.
      if (erro.status === 404) return;
      throw erro;
    }
  }

  async cobrancaPendente(assinaturaId) {
    const vazio = { url: null, vencimento: null, status: null };
    if (!assinaturaId) return vazio;

    let lista;
    try {
      lista = await this.#chamar(`/subscriptions/${assinaturaId}/payments`);
    } catch (erro) {
      log.warn(`não consegui listar as cobranças de ${assinaturaId}: ${erro.message}`);
      return vazio;
    }

    const cobrancas = lista?.data ?? [];
    const emAberto = cobrancas.find((c) => ['PENDING', 'OVERDUE', 'AWAITING_RISK_ANALYSIS'].includes(c.status))
      ?? cobrancas[0];
    if (!emAberto) return vazio;

    return {
      url: emAberto.invoiceUrl ?? emAberto.bankSlipUrl ?? null,
      vencimento: emAberto.dueDate ?? null,
      status: emAberto.status ?? null,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Webhook                                                           */
  /* ---------------------------------------------------------------- */

  /**
   * O Asaas manda em toda notificação o token configurado no painel dele,
   * no header `asaas-access-token`. Sem token configurado aqui, o webhook
   * fica fechado: um endpoint que libera assinatura não pode aceitar
   * qualquer POST da internet.
   */
  autenticarWebhook(headers = {}) {
    if (!this.tokenWebhook) return false;

    const recebido = headers['asaas-access-token'] ?? '';
    const esperado = this.tokenWebhook;

    // Comparação de tempo constante: comparar com === vaza o tamanho do
    // prefixo certo e permite descobrir o token tentativa a tentativa.
    const a = Buffer.from(String(recebido));
    const b = Buffer.from(esperado);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  interpretarWebhook(corpo) {
    const evento = corpo?.event ?? '';
    const cobranca = corpo?.payment ?? null;
    const acao = EVENTOS[evento] ?? 'ignorar';

    const referencia = cobranca?.externalReference ?? corpo?.subscription?.externalReference ?? null;
    const partes = /^usuario:(\d+)$/.exec(String(referencia ?? ''));

    return {
      acao,
      evento,
      referencia: cobranca?.id ?? null,
      assinaturaExterna: cobranca?.subscription ?? null,
      usuarioId: partes ? Number(partes[1]) : null,
      valor: typeof cobranca?.value === 'number' ? cobranca.value : null,
      descricao: descreverEvento(evento, cobranca),
    };
  }
}

/** Data de hoje em AAAA-MM-DD, que é o formato que o Asaas espera. */
function hoje() {
  const agora = new Date();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

function descreverEvento(evento, cobranca) {
  const meio = {
    PIX: 'PIX', BOLETO: 'boleto', CREDIT_CARD: 'cartão de crédito', DEBIT_CARD: 'cartão de débito',
  }[cobranca?.billingType] ?? 'pagamento';

  switch (evento) {
    case 'PAYMENT_CONFIRMED':
      return `Pagamento confirmado por ${meio}.`;
    case 'PAYMENT_RECEIVED':
      return `Pagamento recebido por ${meio}.`;
    case 'PAYMENT_OVERDUE':
      return 'Cobrança venceu sem pagamento.';
    case 'PAYMENT_REFUNDED':
      return 'Pagamento estornado.';
    case 'PAYMENT_CHARGEBACK_REQUESTED':
      return 'Chargeback solicitado pelo cliente.';
    case 'PAYMENT_RECEIVED_IN_CASH_UNDONE':
      return 'Recebimento em dinheiro desfeito.';
    default:
      return `Evento ${evento}.`;
  }
}
