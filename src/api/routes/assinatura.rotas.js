import { Router } from 'express';
import * as assinaturas from '../../assinaturas/assinaturas.repo.js';
import { pagamento } from '../../pagamento/index.js';
import { ErroDePagamento } from '../../pagamento/provedor.js';
import { documentoValido, apenasDigitos, documentoFormatado } from '../../documento.js';
import { criarLog } from '../../logger.js';

const log = criarLog('assinatura');

/** Rotas da assinatura da própria conta logada. */
export function rotasAssinatura() {
  const rotas = Router();

  /** Situação atual. Sempre acessível, inclusive bloqueado. */
  rotas.get('/assinatura', (req, res) => {
    const situacao = assinaturas.estadoDoUsuario(req.usuario.id);
    const cobranca = assinaturas.dadosDeCobranca(req.usuario.id);
    const gateway = pagamento();

    res.json({
      ...situacao,
      plano: assinaturas.plano(),
      pagamentoAutomatico: gateway.configurado,
      cobranca: {
        // Nunca devolvemos o documento inteiro para a tela: já foi informado
        // uma vez e não precisa circular de novo a cada carregamento.
        documentoInformado: Boolean(cobranca?.documento),
        documento: cobranca?.documento ? documentoFormatado(cobranca.documento) : null,
        email: cobranca?.email_cobranca ?? null,
        temAssinaturaNoGateway: Boolean(cobranca?.asaas_assinatura_id),
      },
    });
  });

  rotas.get('/assinatura/historico', (req, res) => {
    res.json(assinaturas.listarEventos(req.usuario.id));
  });

  /**
   * Link da cobrança em aberto.
   *
   * Existe porque a pessoa fecha a aba do Asaas sem pagar mais vezes do que
   * paga na primeira visita. Sem isto, a única saída seria assinar de novo —
   * o que criaria uma segunda cobrança recorrente.
   */
  rotas.get('/assinatura/cobranca', async (req, res) => {
    const gateway = pagamento();
    const dados = assinaturas.dadosDeCobranca(req.usuario.id);

    if (!gateway.configurado || !dados?.asaas_assinatura_id) {
      return res.json({ url: null, vencimento: null, status: null });
    }

    try {
      res.json(await gateway.cobrancaPendente(dados.asaas_assinatura_id));
    } catch (erro) {
      log.warn(`cobrança pendente do usuário ${req.usuario.id}: ${erro.message}`);
      res.json({ url: null, vencimento: null, status: null });
    }
  });

  /**
   * Assina o plano (só existe um).
   *
   * Com gateway configurado, gera a assinatura recorrente e devolve o link
   * de pagamento. Sem gateway, registra a intenção para liberar na mão — é a
   * rede de segurança para quando o Asaas estiver fora do ar.
   */
  rotas.post('/assinatura/assinar', async (req, res) => {
    const plano = assinaturas.plano();
    const gateway = pagamento();

    if (!gateway.configurado) {
      assinaturas.registrarEvento({
        usuarioId: req.usuario.id,
        tipo: 'cobranca',
        descricao: `Cliente pediu para assinar (${plano.rotulo}). Aguardando pagamento.`,
        valor: plano.preco,
        ator: req.usuario.nome,
      });
      return res.json({
        ok: true,
        plano,
        pagamento: { disponivel: false, mensagem: 'Recebemos seu pedido. Entraremos em contato para concluir o pagamento.' },
      });
    }

    const registro = assinaturas.dadosDeCobranca(req.usuario.id);
    const documento = apenasDigitos(req.body?.documento ?? registro?.documento ?? '');
    const email = String(req.body?.email ?? registro?.email_cobranca ?? req.usuario.email ?? '').trim();

    if (!documento) {
      return res.status(400).json({ erro: 'Para emitir a cobrança preciso do seu CPF.', precisaDocumento: true });
    }
    if (!documentoValido(documento)) {
      return res.status(400).json({ erro: 'CPF inválido. Confira os números e tente de novo.', precisaDocumento: true });
    }

    assinaturas.salvarDadosDeCobranca(req.usuario.id, { documento, email });

    try {
      const clienteId = await gateway.garantirCliente({
        nome: registro.nome,
        documento,
        email,
        usuarioId: req.usuario.id,
        clienteExistente: registro.asaas_cliente_id,
      });

      const assinaturaExterna = await gateway.criarAssinatura({
        clienteId,
        preco: plano.preco,
        usuarioId: req.usuario.id,
        assinaturaExistente: registro.asaas_assinatura_id,
      });

      assinaturas.salvarIdentificadoresAsaas(req.usuario.id, { clienteId, assinaturaId: assinaturaExterna.id });

      assinaturas.registrarEvento({
        usuarioId: req.usuario.id,
        tipo: 'cobranca',
        descricao: `Cobrança gerada no ${gateway.nome}. Aguardando pagamento.`,
        valor: plano.preco,
        ator: req.usuario.nome,
      });

      log.info(`usuário ${req.usuario.id}: assinatura ${assinaturaExterna.id} criada no ${gateway.nome}`);

      res.json({
        ok: true,
        plano,
        pagamento: {
          disponivel: true,
          url: assinaturaExterna.url,
          vencimento: assinaturaExterna.vencimento,
          mensagem: assinaturaExterna.url
            ? 'Cobrança gerada. Você pode pagar por PIX, boleto ou cartão.'
            : 'Cobrança gerada. O link de pagamento chega no seu e-mail em instantes.',
        },
      });
    } catch (erro) {
      if (erro instanceof ErroDePagamento) {
        log.warn(`usuário ${req.usuario.id} não conseguiu gerar cobrança: ${erro.message}`);
        assinaturas.registrarEvento({
          usuarioId: req.usuario.id,
          tipo: 'cobranca',
          descricao: `Cliente pediu para assinar, mas a cobrança falhou (${erro.message}). Concluir manualmente.`,
          valor: plano.preco,
          ator: req.usuario.nome,
        });
        return res.status(502).json({ erro: erro.message, contatoManual: true });
      }
      throw erro;
    }
  });

  /** Cancela a recorrência no gateway (se houver) e localmente. */
  rotas.post('/assinatura/cancelar', async (req, res) => {
    const dados = assinaturas.dadosDeCobranca(req.usuario.id);
    const gateway = pagamento();

    if (gateway.configurado && dados?.asaas_assinatura_id) {
      try {
        await gateway.cancelarAssinatura(dados.asaas_assinatura_id);
        assinaturas.salvarIdentificadoresAsaas(req.usuario.id, { assinaturaId: null });
      } catch (erro) {
        log.error(`ATENÇÃO: a cobrança do usuário ${req.usuario.id} continua ativa no ${gateway.nome}: ${erro.message}`);
      }
    }

    res.json(assinaturas.cancelar(req.usuario.id, req.body?.motivo ?? null, req.usuario.nome));
  });

  return rotas;
}
