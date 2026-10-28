import { Router } from 'express';
import * as lojas from '../../lojas/lojas.repo.js';
import { UFS } from '../../lojas/regioes.js';
import { pagamento } from '../../pagamento/index.js';
import { ErroDePagamento } from '../../pagamento/provedor.js';
import { criarLog } from '../../logger.js';
import { config } from '../../config.js';
import { enviarLogo } from '../../lojas/logo.js';
import { avisarAdminsDaLoja } from '../../lojas/avisos.js';

const log = criarLog('lojas');

/** Diretório público: qualquer visitante busca lojas por região, sem conta. */
export function rotasLojasPublicas() {
  const rotas = Router();

  rotas.get('/lojas', (req, res) => {
    const { uf, cidade, q, pagina } = req.query;
    res.json(lojas.buscar({
      uf: String(uf ?? ''),
      cidade: String(cidade ?? '').slice(0, 60),
      q: String(q ?? '').slice(0, 60),
      pagina,
    }));
  });

  rotas.get('/lojas/ufs', (req, res) => {
    res.json({ ufs: UFS, comLojas: lojas.contarPorUf() });
  });

  /** Só serve a logo de loja que está no ar; a URL leva ?v=<data da troca>, então pode ficar em cache por um dia. */
  rotas.get('/lojas/:id/logo', (req, res) => {
    enviarLogo(res, lojas.obterVisivel(req.params.id), 'public, max-age=86400');
  });

  return rotas;
}

/** A loja da pessoa logada: cadastro, edição e mensalidade. */
export function rotasMinhaLoja() {
  const rotas = Router();

  rotas.get('/minha-loja', (req, res) => {
    res.json({
      loja: lojas.paraODono(lojas.obterPorDono(req.usuario.id)),
      permissao: lojas.podeCadastrar(req.usuario),
      precoMensal: lojas.precoMensal(),
      prazoRevisaoHoras: config.lojas.prazoRevisaoHoras,
      pagamentoAutomatico: pagamento().configurado,
    });
  });

  rotas.post('/minha-loja', (req, res) => {
    try {
      const loja = lojas.criar(req.usuario, req.body ?? {});
      log.info(`loja ${loja.id} cadastrada pelo usuário ${req.usuario.id} (aguardando aprovação até ${loja.prazo_revisao_em} UTC)`);
      avisarAdminsDaLoja(loja).catch(() => {});
      res.status(201).json({ loja: lojas.paraODono(loja) });
    } catch (erro) {
      res.status(400).json({ erro: erro.message });
    }
  });

  rotas.patch('/minha-loja', (req, res) => {
    try {
      const antes = lojas.obterPorDono(req.usuario.id);
      const loja = lojas.atualizar(req.usuario.id, req.body ?? {});
      if (antes?.status === 'ativa' && loja.status === 'pendente') avisarAdminsDaLoja(loja, { alteracao: true }).catch(() => {});
      res.json({ loja: lojas.paraODono(loja) });
    } catch (erro) {
      res.status(400).json({ erro: erro.message });
    }
  });

  /* Logo: o dono vê a própria mesmo antes da aprovação (a pública só serve loja no ar). */
  rotas.get('/minha-loja/logo', (req, res) => {
    enviarLogo(res, lojas.obterPorDono(req.usuario.id), 'private, no-cache');
  });

  rotas.post('/minha-loja/logo', (req, res) => {
    try {
      const { loja, voltouParaRevisao } = lojas.trocarLogo(req.usuario.id, req.body?.imagem);
      if (voltouParaRevisao) avisarAdminsDaLoja(loja, { alteracao: true }).catch(() => {});
      res.json({ loja: lojas.paraODono(loja), voltouParaRevisao });
    } catch (erro) {
      res.status(400).json({ erro: erro.message });
    }
  });

  rotas.delete('/minha-loja/logo', (req, res) => {
    try {
      const { loja, voltouParaRevisao } = lojas.trocarLogo(req.usuario.id, null);
      if (voltouParaRevisao) avisarAdminsDaLoja(loja, { alteracao: true }).catch(() => {});
      res.json({ loja: lojas.paraODono(loja), voltouParaRevisao });
    } catch (erro) {
      res.status(400).json({ erro: erro.message });
    }
  });

  /** Link da cobrança em aberto — a pessoa fecha a aba do Asaas sem pagar com frequência. */
  rotas.get('/minha-loja/cobranca', async (req, res) => {
    const loja = lojas.obterPorDono(req.usuario.id);
    const gateway = pagamento();
    if (!loja?.asaas_assinatura_id || !gateway.configurado) return res.json({ url: null, vencimento: null, status: null });
    try {
      res.json(await gateway.cobrancaPendente(loja.asaas_assinatura_id));
    } catch (erro) {
      log.warn(`cobrança pendente da loja ${loja.id}: ${erro.message}`);
      res.json({ url: null, vencimento: null, status: null });
    }
  });

  rotas.post('/minha-loja/assinar', async (req, res) => {
    const loja = lojas.obterPorDono(req.usuario.id);
    if (!loja) return res.status(404).json({ erro: 'cadastre a loja primeiro' });
    if (loja.status !== 'ativa') {
      return res.status(409).json({ erro: 'a mensalidade só abre depois que a loja for aprovada' });
    }
    const preco = lojas.precoMensal();
    if (!(preco > 0)) {
      return res.status(409).json({ erro: 'a mensalidade das lojas ainda não foi definida — fale com o suporte para liberar sua loja' });
    }

    const gateway = pagamento();
    if (!gateway.configurado) {
      return res.json({
        ok: true,
        pagamento: { disponivel: false, mensagem: 'Recebemos seu pedido. Entraremos em contato para concluir o pagamento.' },
      });
    }

    const email = String(req.body?.email ?? req.usuario.email ?? '').trim();
    const referencia = `loja:${loja.id}`;
    try {
      // A cobrança sai no CNPJ da loja, não no CPF de quem a cadastrou.
      const clienteId = await gateway.garantirCliente({
        nome: loja.nome, documento: loja.cnpj, email, usuarioId: req.usuario.id, referencia, clienteExistente: loja.asaas_cliente_id,
      });
      const assinatura = await gateway.criarAssinatura({
        clienteId, preco, usuarioId: req.usuario.id, referencia, descricao: 'valtatcg — mensalidade da loja', assinaturaExistente: loja.asaas_assinatura_id,
      });
      lojas.salvarIdentificadoresAsaas(loja.id, { clienteId, assinaturaId: assinatura.id });
      log.info(`loja ${loja.id}: assinatura ${assinatura.id} criada no ${gateway.nome}`);
      res.json({
        ok: true,
        pagamento: {
          disponivel: true,
          url: assinatura.url,
          vencimento: assinatura.vencimento,
          mensagem: assinatura.url
            ? 'Cobrança gerada. Você pode pagar por PIX, boleto ou cartão.'
            : 'Cobrança gerada. O link de pagamento chega no seu e-mail em instantes.',
        },
      });
    } catch (erro) {
      if (erro instanceof ErroDePagamento) {
        log.warn(`loja ${loja.id} não conseguiu gerar cobrança: ${erro.message}`);
        return res.status(502).json({ erro: erro.message });
      }
      throw erro;
    }
  });

  rotas.post('/minha-loja/cancelar', async (req, res) => {
    const loja = lojas.obterPorDono(req.usuario.id);
    if (!loja) return res.status(404).json({ erro: 'você não tem uma loja cadastrada' });

    const gateway = pagamento();
    if (gateway.configurado && loja.asaas_assinatura_id) {
      try {
        await gateway.cancelarAssinatura(loja.asaas_assinatura_id);
        lojas.salvarIdentificadoresAsaas(loja.id, { assinaturaId: null });
      } catch (erro) {
        log.error(`ATENÇÃO: a cobrança da loja ${loja.id} continua ativa no ${gateway.nome}: ${erro.message}`);
      }
    }
    res.json({ loja: lojas.paraODono(lojas.cancelarAssinatura(loja.id)) });
  });

  return rotas;
}
