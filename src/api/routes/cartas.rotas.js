import { Router } from 'express';
import { buscarCartas, obterCarta } from '../../pokemontcg/cliente.js';
import * as cartasRepo from '../../portfolio/cartas.repo.js';
import * as precosRepo from '../../portfolio/precos.repo.js';
import { obterTaxa } from '../../cambio/cambio.js';

function variacaoDe(carta) {
  if (carta.preco_mercado_usd === null || carta.preco_mercado_usd === undefined) return null;
  return precosRepo.variacoes({ [carta.id]: carta.preco_mercado_usd })[carta.id] ?? null;
}

export function rotasCartas() {
  const rotas = Router();

  rotas.get('/cartas/buscar', async (req, res) => {
    const nome = String(req.query.nome ?? '').trim();
    if (!nome) return res.json({ cartas: [], total: 0 });

    try {
      const pagina = Math.max(1, Number(req.query.pagina) || 1);
      const { cartas, total } = await buscarCartas({ nome, pagina });
      // Já deixa em cache: quem clicar em "adicionar" não espera outra chamada à API externa.
      const precos = {};
      for (const carta of cartas) {
        const salva = cartasRepo.salvar(carta);
        if (salva.preco_mercado_usd !== null) {
          precos[salva.id] = salva.preco_mercado_usd;
          // O preço visto hoje vira histórico: é assim que a variação passa a existir para cartas que ninguém possui.
          precosRepo.registrarSnapshot(salva.id, salva.preco_mercado_usd);
        }
      }
      res.json({ cartas, total, variacoes: precosRepo.variacoes(precos) });
    } catch (erro) {
      res.status(502).json({ erro: `não consegui buscar na pokemontcg.io: ${erro.message}` });
    }
  });

  rotas.get('/cartas/:id', async (req, res) => {
    const cache = cartasRepo.obter(req.params.id);
    if (cache) return res.json({ carta: cache, variacao: variacaoDe(cache) });

    try {
      const cartaApi = await obterCarta(req.params.id);
      const carta = cartasRepo.salvar(cartaApi);
      res.json({ carta, variacao: variacaoDe(carta) });
    } catch {
      res.status(404).json({ erro: 'carta não encontrada' });
    }
  });

  /** Cotação dólar→real usada para converter os preços na tela. */
  rotas.get('/cambio', async (req, res) => {
    const cambio = await obterTaxa();
    res.json({ cambio });
  });

  rotas.get('/cartas/:id/historico', (req, res) => {
    res.json({ historico: precosRepo.historico(req.params.id) });
  });

  return rotas;
}
