import { criarLog } from '../logger.js';
import { obterCarta } from '../pokemontcg/cliente.js';
import * as cartasRepo from './cartas.repo.js';
import * as colecaoRepo from './colecao.repo.js';
import * as precosRepo from './precos.repo.js';

const log = criarLog('precos');
const INTERVALO_MS = 24 * 60 * 60 * 1000;

/**
 * Atualiza o preço só das cartas que alguém realmente possui — não do cache
 * inteiro (que cresce a cada busca) — para manter o consumo da API contido.
 */
export async function atualizarPrecos() {
  const ids = colecaoRepo.cartasDistintasPossuidas();
  if (!ids.length) return;

  log.info(`atualizando preço de ${ids.length} carta(s)`);
  for (const id of ids) {
    try {
      const cartaApi = await obterCarta(id);
      const carta = cartasRepo.salvar(cartaApi);
      if (carta.preco_mercado_usd !== null) {
        precosRepo.registrarSnapshot(id, carta.preco_mercado_usd);
      }
    } catch (erro) {
      log.warn(`falha ao atualizar preço de ${id}:`, erro.message);
    }
  }
}

export function iniciarJobDePrecos() {
  atualizarPrecos().catch((erro) => log.error('falha no job de preços:', erro.message));
  const intervalo = setInterval(() => {
    atualizarPrecos().catch((erro) => log.error('falha no job de preços:', erro.message));
  }, INTERVALO_MS);
  return () => clearInterval(intervalo);
}
