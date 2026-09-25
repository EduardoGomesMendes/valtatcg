import { Router } from 'express';
import { buscarCartas, obterCarta } from '../../pokemontcg/cliente.js';
import * as cartasRepo from '../../portfolio/cartas.repo.js';
import * as precosRepo from '../../portfolio/precos.repo.js';

export function rotasCartas() {
  const rotas = Router();

  rotas.get('/cartas/buscar', async (req, res) => {
    const nome = String(req.query.nome ?? '').trim();
    if (!nome) return res.json({ cartas: [], total: 0 });

    try {
      const pagina = Math.max(1, Number(req.query.pagina) || 1);
      const { cartas, total } = await buscarCartas({ nome, pagina });
      // Já deixa em cache: quem clicar em "adicionar" não espera outra chamada à API externa.
      for (const carta of cartas) cartasRepo.salvar(carta);
      res.json({ cartas, total });
    } catch (erro) {
      res.status(502).json({ erro: `não consegui buscar na pokemontcg.io: ${erro.message}` });
    }
  });

  rotas.get('/cartas/:id', async (req, res) => {
    const cache = cartasRepo.obter(req.params.id);
    if (cache) return res.json({ carta: cache });

    try {
      const cartaApi = await obterCarta(req.params.id);
      const carta = cartasRepo.salvar(cartaApi);
      res.json({ carta });
    } catch {
      res.status(404).json({ erro: 'carta não encontrada' });
    }
  });

  rotas.get('/cartas/:id/historico', (req, res) => {
    res.json({ historico: precosRepo.historico(req.params.id) });
  });

  return rotas;
}
