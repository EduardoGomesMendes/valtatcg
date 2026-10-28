import { db } from '../db/index.js';
import { criarLog } from '../logger.js';

const log = criarLog('cambio');

/*
  Câmbio dólar → real.

  A pokemontcg.io só entrega preço em dólar; o painel mostra em reais. A cotação vem de duas fontes
  gratuitas e sem chave (a primeira que responder vale) e fica guardada no banco, uma por dia:
    - serve de reserva quando as duas fontes estiverem fora do ar (a tela segue em reais, com a última cotação);
    - permite converter o gráfico da coleção com a cotação de cada dia, em vez de a de hoje para tudo.
*/

const VALIDADE_MS = 6 * 60 * 60 * 1000;
const PRAZO_REQUISICAO_MS = 6000;

const FONTES = [
  { nome: 'frankfurter', url: 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=BRL', ler: (json) => json?.rates?.BRL },
  { nome: 'awesomeapi', url: 'https://economia.awesomeapi.com.br/json/last/USD-BRL', ler: (json) => Number(json?.USDBRL?.bid) },
];

let memoria = null;
let pendente = null;

/** Uma cotação fora desta faixa é erro da fonte, não câmbio: melhor recusar do que converter tudo errado. */
const taxaPlausivel = (t) => Number.isFinite(t) && t > 1 && t < 20;

const hojeUtc = () => new Date().toISOString().slice(0, 10);

function guardar(taxa, fonte) {
  db.prepare(
    `INSERT INTO cambio_diario (data, usd_brl, fonte) VALUES (?, ?, ?)
     ON CONFLICT(data) DO UPDATE SET usd_brl = excluded.usd_brl, fonte = excluded.fonte, buscado_em = datetime('now')`,
  ).run(hojeUtc(), taxa, fonte);
}

function ultimaGuardada() {
  const l = db.prepare('SELECT data, usd_brl, fonte FROM cambio_diario ORDER BY data DESC LIMIT 1').get();
  return l ? { usdBrl: l.usd_brl, data: l.data, fonte: l.fonte } : null;
}

async function buscarNasFontes(buscar) {
  for (const fonte of FONTES) {
    try {
      const resposta = await buscar(fonte.url, { signal: AbortSignal.timeout(PRAZO_REQUISICAO_MS) });
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
      const taxa = Number(fonte.ler(await resposta.json()));
      if (!taxaPlausivel(taxa)) throw new Error(`cotação implausível (${taxa})`);
      return { taxa, fonte: fonte.nome };
    } catch (erro) {
      log.warn(`fonte ${fonte.nome} falhou: ${erro.message}`);
    }
  }
  return null;
}

/**
 * @returns {Promise<{usdBrl: number, data: string, fonte: string, defasada: boolean} | null>}
 *   `defasada` = true quando nenhuma fonte respondeu e valeu a última cotação guardada; null se nunca houve cotação.
 */
export async function obterTaxa({ buscar = fetch, agora = Date.now() } = {}) {
  if (memoria && agora - memoria.em < VALIDADE_MS) return memoria.valor;
  if (pendente) return pendente;

  pendente = (async () => {
    const achada = await buscarNasFontes(buscar);
    if (achada) {
      guardar(achada.taxa, achada.fonte);
      const valor = { usdBrl: achada.taxa, data: hojeUtc(), fonte: achada.fonte, defasada: false };
      memoria = { valor, em: agora };
      return valor;
    }
    const ultima = ultimaGuardada();
    if (!ultima) return null;
    log.warn(`nenhuma fonte respondeu — usando a cotação de ${ultima.data}`);
    // Defasada não entra na memória: a próxima chamada tenta as fontes de novo.
    return { ...ultima, defasada: true };
  })().finally(() => { pendente = null; });

  return pendente;
}

/** Cotação do dia (ou a mais recente antes dele) — para converter o gráfico com a taxa de cada data. Null se não houver. */
export function taxaDoDia(data) {
  const l = db.prepare('SELECT usd_brl FROM cambio_diario WHERE data <= ? ORDER BY data DESC LIMIT 1').get(String(data));
  return l?.usd_brl ?? null;
}

/** Só para teste. */
export function esquecerMemoria() {
  memoria = null;
  pendente = null;
}
