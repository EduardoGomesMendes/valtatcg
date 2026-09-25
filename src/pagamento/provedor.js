/**
 * Contrato que qualquer gateway de pagamento precisa cumprir.
 *
 * Trocar o Asaas por outro gateway deve ser criar um arquivo novo que
 * estende esta classe, sem mexer nas rotas nem no resto do sistema — o
 * resto só conhece estes métodos.
 *
 * Todo método que fala com a rede devolve Promise e lança ErroDePagamento
 * quando o gateway recusa — a rota traduz isso em mensagem para o cliente.
 */

export class ErroDePagamento extends Error {
  constructor(mensagem, { codigo = null, status = null } = {}) {
    super(mensagem);
    this.name = 'ErroDePagamento';
    this.codigo = codigo;
    this.status = status;
  }
}

export class ProvedorPagamento {
  /** Nome curto, para log e para o painel dizer quem cobrou. */
  get nome() {
    return 'nenhum';
  }

  /** false quando falta chave: o sistema segue funcionando no modo manual. */
  get configurado() {
    return false;
  }

  /**
   * Garante que o usuário existe como cliente no gateway e devolve o id dele.
   * @param {{nome: string, documento: string, email: string, usuarioId: number, clienteExistente?: string|null}} _dados
   * @returns {Promise<string>}
   */
  async garantirCliente() {
    throw new Error('não implementado');
  }

  /**
   * Cria (ou substitui) a assinatura mensal recorrente do usuário.
   * @returns {Promise<{id: string, status: string, url: string|null, vencimento: string|null}>}
   */
  async criarAssinatura() {
    throw new Error('não implementado');
  }

  /** Cancela a recorrência no gateway. Não estorna nada já pago. */
  async cancelarAssinatura() {
    throw new Error('não implementado');
  }

  /**
   * Link da cobrança em aberto, para a pessoa voltar e pagar depois.
   * @returns {Promise<{url: string|null, vencimento: string|null, status: string|null}>}
   */
  async cobrancaPendente() {
    throw new Error('não implementado');
  }

  /**
   * Confere se a requisição veio mesmo do gateway.
   * Síncrono de propósito: é a primeira coisa que a rota do webhook faz.
   * @returns {boolean}
   */
  autenticarWebhook() {
    return false;
  }

  /**
   * Traduz o corpo bruto do webhook para o vocabulário do valtatcg.
   * @returns {{acao: 'pagou'|'atrasou'|'estornou'|'ignorar', referencia: string|null,
   *            assinaturaExterna: string|null, usuarioId: number|null,
   *            valor: number|null, descricao: string}}
   */
  interpretarWebhook() {
    throw new Error('não implementado');
  }
}
