import { Router } from 'express';
import { buscarCartas, buscarCartasPorNumero, obterCarta } from '../../pokemontcg/cliente.js';
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
    // Busca pelo número impresso (vem da foto): "numero=25&total=165". Valida antes de montar a consulta
    // da API externa, para nada além de letras e dígitos curtos chegar lá.
    const numero = String(req.query.numero ?? '').trim();
    const totalImpresso = String(req.query.total ?? '').trim();
    const porNumero = numero !== '';
    if (porNumero && (!/^[A-Za-z]{0,5}\d{1,3}$/.test(numero) || !/^(\d{1,3})?$/.test(totalImpresso))) {
      return res.status(400).json({ erro: 'número da carta inválido' });
    }
    if (!porNumero && !nome) return res.json({ cartas: [], total: 0 });

    try {
      const pagina = Math.max(1, Number(req.query.pagina) || 1);
      const { cartas, total } = porNumero
        ? await buscarCartasPorNumero({ numero, totalImpresso, nome })
        : await buscarCartas({ nome, pagina });
      // Já deixa em cache: quem clicar em "adicionar" não espera outra chamada à API externa.
      const precos = {};
      for (const carta of cartas) {
        const salva = cartasRepo.salvar(carta);
        cartasRepo.marcarVista(salva.id);
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
    if (cache) {
      cartasRepo.marcarVista(cache.id);
      return res.json({ carta: cache, variacao: variacaoDe(cache) });
    }

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
