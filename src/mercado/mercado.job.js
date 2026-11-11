import { criarLog } from '../logger.js';
import * as tcgdex from './tcgdex.js';
import * as repo from './mercado.repo.js';

const log = criarLog('mercado');

/** De onde vêm os dados. É um objeto para os testes trocarem pela versão sem rede. */
export const fontes = {
  idsPorRaridade: tcgdex.idsPorRaridade,
  obterCarta: tcgdex.obterCarta,
};

const SEIS_HORAS_MS = 6 * 60 * 60 * 1000;
const SIMULTANEAS = 3;
const PAUSA_MS = 120; // entre uma consulta e a próxima de cada "trabalhador": a fonte pede consideração
const FALHAS_SEGUIDAS_PARA_DESISTIR = 25;

let rodando = false;

/**
 * Atualiza os preços do painel. Só consulta o que está velho (mais de 20 h) ou nunca foi visto, então rodar de novo
 * logo em seguida (ou depois de reiniciar o servidor no meio) não repete trabalho nem sobrecarrega a fonte.
 * Falha aqui nunca derruba nada: o painel simplesmente fica com o que já tem (e esconde o que passou da validade).
 */
export async function atualizarMercado({ pausaMs = PAUSA_MS, simultaneas = SIMULTANEAS } = {}) {
  if (rodando) return { pulou: true };
  rodando = true;
  try {
    const todos = new Set();
    let listasCompletas = true;
    for (const raridade of tcgdex.RARIDADES) {
      try {
        (await fontes.idsPorRaridade(raridade)).forEach((id) => todos.add(id));
      } catch (erro) {
        listasCompletas = false;
        log.warn(`lista de "${raridade}" indisponível: ${erro.message}`);
      }
    }
    if (!todos.size) return { atualizadas: 0, falhas: 0, semLista: true };
    // Só limpa o que saiu da lista quando TODAS as listas vieram: uma lista fora do ar não pode apagar o painel.
    if (listasCompletas) repo.removerForaDaLista([...todos]);

    const fila = repo.idsParaAtualizar([...todos]);
    let atualizadas = 0;
    let falhas = 0;
    let seguidas = 0;

    async function trabalhador() {
      while (fila.length && seguidas < FALHAS_SEGUIDAS_PARA_DESISTIR) {
        const id = fila.shift();
        try {
          const carta = await fontes.obterCarta(id);
          const precos = tcgdex.extrairPrecos(carta);
          repo.salvar({
            id,
            nome: carta.name,
            colecao: carta.set?.name,
            numero: carta.localId,
            raridade: carta.rarity,
            imagem: carta.image,
            ...precos,
          });
          atualizadas += 1;
          seguidas = 0;
        } catch (erro) {
          falhas += 1;
          seguidas += 1;
          if (seguidas === 1) log.warn(`falha ao consultar ${id}: ${erro.message}`);
        }
        if (pausaMs) await new Promise((r) => setTimeout(r, pausaMs));
      }
    }
    await Promise.all(Array.from({ length: simultaneas }, trabalhador));

    if (seguidas >= FALHAS_SEGUIDAS_PARA_DESISTIR) log.warn('a fonte parece fora do ar: parei por hoje, retomo na próxima rodada');
    log.info(`painel do mercado: ${atualizadas} carta(s) atualizada(s), ${falhas} falha(s)`);
    return { atualizadas, falhas };
  } finally {
    rodando = false;
  }
}

export function iniciarJobDoMercado() {
  const rodar = () => atualizarMercado().catch((erro) => log.error(`falha no job do mercado: ${erro.message}`));
  // Meio minuto depois de subir: o servidor atende primeiro, e um deploy a cada poucos minutos não vira rajada na fonte.
  const inicio = setTimeout(rodar, 30_000);
  const intervalo = setInterval(rodar, SEIS_HORAS_MS);
  return () => {
    clearTimeout(inicio);
    clearInterval(intervalo);
  };
}
