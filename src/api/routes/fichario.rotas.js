import { Router } from 'express';
import * as repo from '../../fichario/colecoes.repo.js';
import { garantirColecoes, garantirCartas } from '../../fichario/sincronia.js';
import { montarFichario } from '../../fichario/fichario.js';
import * as colecaoRepo from '../../portfolio/colecao.repo.js';
import { criarLog } from '../../logger.js';

const log = criarLog('fichario');

const MENSAGEM_INSTAVEL = 'A lista de coleções está instável agora. Tente de novo em instantes.';

/*
  Fichário: o "o que me falta" de cada coleção. Só leitura: marcar uma carta como "tenho" é cadastrá-la na coleção
  (POST /colecao), então o limite do plano grátis e todas as validações continuam num lugar só.
*/
export function rotasFichario() {
  const rotas = Router();

  /** Todas as coleções, cada uma com quantas cartas diferentes a pessoa tem dela. */
  rotas.get('/fichario/colecoes', async (req, res) => {
    try {
      await garantirColecoes();
    } catch (erro) {
      log.warn(`lista de coleções indisponível: ${erro.message}`);
      return res.status(502).json({ erro: MENSAGEM_INSTAVEL });
    }
    res.json({ colecoes: repo.listarComProgresso(req.usuario.id) });
  });

  /** Uma coleção: cada carta dela com "tenho / falta", e os totais (quantas faltam, quanto custa completar). */
  rotas.get('/fichario/colecoes/:id', async (req, res) => {
    const id = String(req.params.id);
    // O id entra numa consulta da API externa: só o formato dos ids da pokemontcg.io passa.
    if (!/^[A-Za-z0-9.-]{1,40}$/.test(id)) return res.status(400).json({ erro: 'coleção inválida' });

    try {
      await garantirColecoes();
    } catch (erro) {
      log.warn(`lista de coleções indisponível: ${erro.message}`);
      return res.status(502).json({ erro: MENSAGEM_INSTAVEL });
    }
    // Só coleções que existem na lista oficial: ninguém dispara busca na API externa com um id inventado.
    if (!repo.obterColecao(id)) return res.status(404).json({ erro: 'coleção não encontrada' });

    try {
      await garantirCartas(id);
    } catch (erro) {
      log.warn(`cartas da coleção ${id} indisponíveis: ${erro.message}`);
      return res.status(502).json({ erro: 'Não consegui carregar as cartas desta coleção agora. Tente de novo em instantes.' });
    }

    const colecao = repo.obterColecao(id);
    const itens = repo.itensDoUsuarioNaColecao(req.usuario.id, id);
    // O valor do que a pessoa tem usa a variante e o estado que ela informou (a mesma conta da tela Coleção).
    const donas = new Set(itens.map((i) => i.carta_id));
    const valores = {};
    for (const item of colecaoRepo.listar(req.usuario.id)) {
      if (!donas.has(item.carta_id)) continue;
      const unitario = item.preco_estimado_usd ?? item.preco_mercado_usd;
      if (unitario !== null && unitario !== undefined) valores[item.carta_id] = (valores[item.carta_id] ?? 0) + unitario * item.quantidade;
    }

    res.json(montarFichario({ colecao, cartas: repo.cartasDaColecao(id), itens, valores }));
  });

  return rotas;
}
