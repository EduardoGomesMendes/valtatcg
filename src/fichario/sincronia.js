import * as cliente from '../pokemontcg/cliente.js';
import * as cartasRepo from '../portfolio/cartas.repo.js';
import { emTransacao } from '../db/index.js';
import * as repo from './colecoes.repo.js';
import { criarLog } from '../logger.js';

const log = criarLog('fichario');

/*
  Traz da pokemontcg.io a lista de coleções e as cartas de cada uma, e guarda no banco.
  A API é instável e as listas quase não mudam: por isso o que já está guardado vale por um tempo, e se a API cair
  depois disso a tela segue com o que tem (um pouco velho) em vez de quebrar.
*/

const DIAS_DA_LISTA = 7;
const DIAS_DAS_CARTAS = 3;
const DIA_MS = 86_400_000;

/** De onde vêm os dados. É um objeto para os testes trocarem pela versão sem rede. */
export const fontes = {
  listarColecoes: cliente.listarColecoes,
  cartasDaColecao: cliente.cartasDaColecao,
};

/** "AAAA-MM-DD HH:MM:SS" (UTC, como o banco guarda) → milissegundos; ilegível conta como nunca. */
function momento(texto) {
  const t = Date.parse(`${String(texto ?? '').replace(' ', 'T')}Z`);
  return Number.isNaN(t) ? 0 : t;
}

const velho = (texto, dias) => Date.now() - momento(texto) > dias * DIA_MS;

// Dois pedidos da mesma coisa ao mesmo tempo esperam a mesma busca, em vez de cada um gastar chamadas na API.
const emAndamento = new Map();
function umaVez(chave, tarefa) {
  if (!emAndamento.has(chave)) {
    emAndamento.set(chave, tarefa().finally(() => emAndamento.delete(chave)));
  }
  return emAndamento.get(chave);
}

/** Garante a lista de coleções no banco. Só falha se não houver NADA guardado e a API não responder. */
export function garantirColecoes() {
  const { quantidade, atualizadaEm } = repo.situacaoDaLista();
  if (quantidade > 0 && !velho(atualizadaEm, DIAS_DA_LISTA)) return Promise.resolve();
  return umaVez('colecoes', async () => {
    try {
      repo.salvarColecoes(await fontes.listarColecoes());
    } catch (erro) {
      if (quantidade === 0) throw erro;
      log.warn(`lista de coleções não atualizou, usando a guardada: ${erro.message}`);
    }
  });
}

/** Garante as cartas da coleção no banco (baixa de novo se ainda não baixou ou se está velha). */
export function garantirCartas(colecaoId) {
  const colecao = repo.obterColecao(colecaoId);
  if (!colecao) return Promise.reject(new Error('coleção não encontrada'));
  // "Já tem" só vale se a coleção INTEIRA foi baixada alguma vez: umas poucas cartas no cache (de uma busca ou da coleção
  // da pessoa) não são a coleção, e mostrá-las como se fossem faria o fichário parecer quase completo.
  const jaTem = Boolean(colecao.cartas_sync_em) && repo.cartasDaColecao(colecaoId).length > 0;
  if (jaTem && !velho(colecao.cartas_sync_em, DIAS_DAS_CARTAS)) return Promise.resolve();
  return umaVez(`cartas:${colecaoId}`, async () => {
    try {
      const cartas = await fontes.cartasDaColecao(colecaoId);
      if (!cartas.length) throw new Error('a API não devolveu cartas');
      // Uma transação só: centenas de gravações soltas, uma a uma, seriam lentas. NÃO marca como "vista": senão o job
      // diário passaria a acompanhar o preço de todas elas durante duas semanas.
      emTransacao(() => cartas.forEach((c) => cartasRepo.salvar(c)));
      repo.marcarCartasBaixadas(colecaoId);
    } catch (erro) {
      if (!jaTem) throw erro;
      log.warn(`cartas da coleção ${colecaoId} não atualizaram, usando as guardadas: ${erro.message}`);
    }
  });
}
