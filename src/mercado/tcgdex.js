const BASE = 'https://api.tcgdex.net/v2/en';
const PRAZO_MS = 15_000;

/**
 * Raridades que entram no painel: as cartas "de caça" das coleções modernas, que são as que o colecionador
 * acompanha. A TCGdex só devolve preço carta a carta (não há lista com preço), então o conjunto é limitado de
 * propósito: ~1,7 mil cartas por dia em vez das ~20 mil do jogo, para sermos uma fonte "considerada".
 */
export const RARIDADES = [
  'Special illustration rare', 'Illustration rare', 'Hyper rare', 'Mega Hyper Rare',
  'Secret Rare', 'Shiny Ultra Rare', 'ACE SPEC Rare',
];

async function pegar(caminho, tentativas = 3) {
  let ultimo;
  for (let i = 1; i <= tentativas; i += 1) {
    try {
      const resposta = await fetch(`${BASE}${caminho}`, { signal: AbortSignal.timeout(PRAZO_MS) });
      if (resposta.ok) return await resposta.json();
      ultimo = new Error(`TCGdex respondeu ${resposta.status} para ${caminho}`);
      if (resposta.status < 500) throw ultimo; // 404 e afins não melhoram tentando de novo
    } catch (erro) {
      ultimo = erro;
      if (/respondeu 4/.test(erro.message)) break;
    }
    await new Promise((r) => setTimeout(r, 400 * i));
  }
  throw ultimo;
}

/** Ids de todas as cartas de uma raridade. */
export async function idsPorRaridade(raridade) {
  const lista = await pegar(`/cards?rarity=${encodeURIComponent(raridade)}&pagination:itemsPerPage=5000`);
  return Array.isArray(lista) ? lista.map((c) => c.id).filter((id) => typeof id === 'string') : [];
}

export async function obterCarta(id) {
  return pegar(`/cards/${encodeURIComponent(id)}`);
}

const positivo = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** Ordem das versões para escolher O preço da carta (a comum primeiro, como no resto do sistema). */
const ORDEM_TCGPLAYER = ['normal', 'holofoil', 'reverse', 'reverse-holofoil', '1st-edition', '1st-edition-holofoil'];

/**
 * Tira do JSON da TCGdex só o que o painel usa. Pura (sem rede): é o que os testes alimentam com JSON de exemplo.
 *   precoUsd         preço de mercado no TCGplayer (a versão comum; sem ela, a primeira que existir)
 *   media7 / media30 médias de 7 e 30 dias do Cardmarket em euro, do MESMO par (normal ou holo): misturar um
 *                    com o outro daria uma variação sem sentido
 */
export function extrairPrecos(carta) {
  const tcg = carta?.pricing?.tcgplayer ?? {};
  let precoUsd = null;
  for (const variante of [...ORDEM_TCGPLAYER, ...Object.keys(tcg)]) {
    const valor = tcg[variante]?.marketPrice;
    if (positivo(valor)) {
      precoUsd = valor;
      break;
    }
  }

  const cm = carta?.pricing?.cardmarket ?? {};
  let media7 = null;
  let media30 = null;
  for (const sufixo of ['', '-holo']) {
    if (positivo(cm[`avg7${sufixo}`]) && positivo(cm[`avg30${sufixo}`])) {
      media7 = cm[`avg7${sufixo}`];
      media30 = cm[`avg30${sufixo}`];
      break;
    }
  }

  return {
    precoUsd,
    tcgAtualizadoEm: typeof tcg.updated === 'string' ? tcg.updated : null,
    media7,
    media30,
    cmAtualizadoEm: typeof cm.updated === 'string' ? cm.updated : null,
  };
}
