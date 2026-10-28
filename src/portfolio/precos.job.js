import { criarLog } from '../logger.js';
import { obterCarta, obterCartasPorIds } from '../pokemontcg/cliente.js';
import * as cartasRepo from './cartas.repo.js';
import * as colecaoRepo from './colecao.repo.js';
import * as precosRepo from './precos.repo.js';

const log = criarLog('precos');
const INTERVALO_MS = 24 * 60 * 60 * 1000;

const LOTE = 25;

/**
 * Cartas que só apareceram em buscas (ninguém possui) ganham um preço por dia também, em lotes, enquanto foram
 * vistas nas últimas duas semanas. É isso que faz a busca mostrar a variação de uma carta pesquisada ontem.
 * Falha aqui não pode impedir a atualização das cartas da coleção.
 */
export async function atualizarCartasVistas() {
  const ids = cartasRepo.vistasRecentementeSemDono();
  if (!ids.length) return;

  log.info(`acompanhando preço de ${ids.length} carta(s) vistas em buscas`);
  for (let i = 0; i < ids.length; i += LOTE) {
    try {
      for (const cartaApi of await obterCartasPorIds(ids.slice(i, i + LOTE))) {
        // Não passa por marcarVista: a carta só continua sendo acompanhada se alguém voltar a procurá-la.
        const carta = cartasRepo.salvar(cartaApi);
        if (carta.preco_mercado_usd !== null) precosRepo.registrarSnapshot(carta.id, carta.preco_mercado_usd);
      }
    } catch (erro) {
      log.warn('falha ao atualizar um lote de cartas vistas:', erro.message);
    }
  }
}

/**
 * Atualiza o preço das cartas que alguém possui — não do cache inteiro (que cresce a cada busca) —
 * para manter o consumo da API contido.
 */
export async function atualizarPrecos() {
  await atualizarCartasVistas();

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
