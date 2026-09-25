import { Router } from 'express';
import * as assinaturas from '../../assinaturas/assinaturas.repo.js';
import { pagamento } from '../../pagamento/index.js';
import { criarLog } from '../../logger.js';

const log = criarLog('webhook');

/* Dias liberados por pagamento confirmado. Um ciclo mensal do gateway. */
const DIAS_POR_PAGAMENTO = 30;

/**
 * Notificações do gateway de pagamento.
 *
 * Rota PÚBLICA: quem chama é o Asaas, que não tem sessão aqui. Quem autentica
 * é o token combinado no header — por isso ela precisa ficar montada ANTES do
 * exigirLogin, e por isso o token nunca pode ser a chave da API.
 *
 * Regra de ouro do desenho: o Asaas interrompe a fila de notificações depois
 * de 15 respostas sem sucesso seguidas, e joga fora o que não foi entregue em
 * 14 dias. Uma fila parada significa cliente que pagou e continua bloqueado.
 * Então:
 *
 *   1. grava o evento cru ANTES de interpretar — se isso falhar, devolve 500
 *      e deixa o Asaas reenviar, porque aí realmente perdemos o dado;
 *   2. depois de gravado, qualquer erro devolve 200, porque o dado está
 *      salvo e pode ser reprocessado daqui — reenviar não ajudaria.
 */
export function rotasPagamento() {
  const rotas = Router();

  rotas.post('/pagamento/asaas', (req, res) => {
    const gateway = pagamento();

    if (!gateway.configurado) {
      return res.status(503).json({ erro: 'gateway não configurado' });
    }

    if (!gateway.autenticarWebhook(req.headers)) {
      log.warn(`notificação recusada: token ausente ou errado (origem ${req.ip})`);
      return res.status(401).json({ erro: 'não autorizado' });
    }

    let aviso;
    try {
      aviso = gateway.interpretarWebhook(req.body);
    } catch (erro) {
      // Corpo inesperado. Reenviar o mesmo corpo não vai melhorar nada.
      log.warn(`não entendi o corpo da notificação: ${erro.message}`);
      return res.status(200).json({ ok: true, ignorado: true });
    }

    if (aviso.acao === 'ignorar' || !aviso.referencia) {
      log.debug(`evento ${aviso.evento} ignorado`);
      return res.status(200).json({ ok: true, ignorado: true });
    }

    // O externalReference é o caminho normal; a assinatura é o plano B para
    // cobranças criadas fora daqui (avulsa gerada no painel do Asaas).
    const candidata = aviso.usuarioId ?? assinaturas.usuarioPorAssinaturaExterna(aviso.assinaturaExterna);

    /*
      Conferir que o usuário EXISTE, e não só que a referência tem o formato
      certo. Uma referência digitada à mão no painel do Asaas, ou sobrada de
      uma conta já excluída, passaria na expressão regular e viraria uma
      ativação silenciosa que não muda nada e não avisa ninguém.
    */
    const usuarioId = candidata && assinaturas.dadosDeCobranca(candidata) ? candidata : null;

    let inedito;
    try {
      inedito = assinaturas.registrarWebhook({
        provedor: 'asaas',
        evento: aviso.evento,
        acao: aviso.acao,
        referencia: aviso.referencia,
        usuarioId,
        valor: aviso.valor,
        corpo: req.body,
      });
    } catch (erro) {
      // Banco fora do ar: este é o único caso em que o reenvio nos salva.
      log.error(`não consegui gravar a notificação ${aviso.evento}/${aviso.referencia}: ${erro.message}`);
      return res.status(500).json({ erro: 'falha ao registrar' });
    }

    if (!inedito) {
      log.debug(`notificação repetida (${aviso.acao}/${aviso.referencia}) — nada a fazer`);
      return res.status(200).json({ ok: true, repetido: true });
    }

    if (!usuarioId) {
      log.warn(
        `cobrança ${aviso.referencia} (${aviso.evento}) não casou com nenhum usuário. `
        + 'O evento está salvo em pagamento_eventos para conferência.',
      );
      return res.status(200).json({ ok: true, semUsuario: true });
    }

    try {
      aplicar(aviso, usuarioId);
    } catch (erro) {
      // O evento já está gravado: insistir com o Asaas só arriscaria travar a
      // fila dele por um problema que é nosso.
      log.error(`falha ao aplicar ${aviso.evento} no usuário ${usuarioId}: ${erro.stack || erro.message}`);
    }

    res.status(200).json({ ok: true });
  });

  return rotas;
}

function aplicar(aviso, usuarioId) {
  if (aviso.acao === 'pagou') {
    /*
      Trava contra ordem invertida: se um "pagou" atrasado chegasse depois do
      estorno DA MESMA cobrança, quem já pegou o dinheiro de volta sairia com
      a assinatura reativada.
    */
    if (assinaturas.jaAconteceu({ acao: 'estornou', referencia: aviso.referencia })) {
      assinaturas.registrarEvento({
        usuarioId,
        tipo: 'cobranca',
        descricao: `${aviso.descricao} Ignorado: esta cobrança já foi estornada.`,
        valor: aviso.valor,
        ator: 'Asaas',
      });
      log.warn(`usuário ${usuarioId}: "${aviso.evento}" chegou depois do estorno da cobrança ${aviso.referencia} — assinatura NÃO reativada`);
      return;
    }

    assinaturas.ativar(usuarioId, {
      dias: DIAS_POR_PAGAMENTO,
      ator: 'Asaas',
      descricao: `${aviso.descricao} Assinatura liberada por ${DIAS_POR_PAGAMENTO} dias.`,
    });
    log.info(`usuário ${usuarioId} pagou ${aviso.valor ?? '?'} — assinatura liberada`);
    return;
  }

  if (aviso.acao === 'atrasou') {
    /*
      Vencimento NÃO bloqueia na hora, de propósito: boleto compensa em até
      três dias úteis e PIX de fim de semana cai depois. Quem bloqueia é a
      data de expiração da própria assinatura, que já passou ou vai passar.
      Aqui só registramos, para o histórico contar a história certa.
    */
    assinaturas.registrarEvento({ usuarioId, tipo: 'cobranca', descricao: aviso.descricao, valor: aviso.valor, ator: 'Asaas' });
    log.info(`usuário ${usuarioId}: cobrança ${aviso.referencia} venceu sem pagamento`);
    return;
  }

  if (aviso.acao === 'estornou') {
    // Estorno é dinheiro que voltou: a assinatura para agora, sem esperar a
    // data de expiração que aquele pagamento tinha comprado.
    assinaturas.cancelar(usuarioId, `${aviso.descricao} Assinatura suspensa.`, 'Asaas');
    log.warn(`usuário ${usuarioId}: ${aviso.descricao} — assinatura suspensa`);
  }
}
