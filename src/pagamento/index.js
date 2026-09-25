import { config } from '../config.js';
import { criarLog } from '../logger.js';
import { ProvedorPagamento } from './provedor.js';
import { ProvedorAsaas } from './asaas.provedor.js';

const log = criarLog('pagamento');

/**
 * Escolhe o gateway pela configuração.
 *
 * Sem chave, devolve o provedor base — que responde `configurado: false`. O
 * sistema continua funcionando nesse modo: a pessoa clica em assinar, a
 * escolha fica registrada e você libera na mão pela tela de admin. É a rede
 * de segurança para quando a chave vencer ou o Asaas ficar fora do ar.
 */
let provedor = null;

export function pagamento() {
  if (provedor) return provedor;

  const { provedor: qual, chave, ambiente, tokenWebhook } = config.pagamento;

  if (qual === 'asaas' && chave) {
    provedor = new ProvedorAsaas({ chave, ambiente, tokenWebhook });
    log.info(`gateway Asaas ativo no ambiente ${ambiente}`);
    if (!tokenWebhook) {
      log.warn('ASAAS_WEBHOOK_TOKEN não definido — o webhook fica fechado e nenhum pagamento libera assinatura sozinho');
    }
  } else {
    provedor = new ProvedorPagamento();
    log.info('nenhum gateway configurado — assinaturas são liberadas manualmente');
  }

  return provedor;
}

export { ProvedorPagamento, ErroDePagamento } from './provedor.js';
export { ProvedorAsaas } from './asaas.provedor.js';
