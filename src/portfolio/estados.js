import { config } from '../config.js';

/*
  Estados de conservação da carta (a escala dos marketplaces: TCGplayer e afins).

  O preço de mercado que temos (TCGplayer, via pokemontcg.io) é o de uma carta em estado quase perfeito. Para
  a coleção refletir o estado de cada carta, o valor é ESTIMADO: preço × fator do estado. Os fatores são
  aproximações (guias de terceiros divergem bastante: Lightly Played 70–90%, Moderately Played 40–75%, Heavily
  Played 20–55%, Damaged 5–35%); usamos o ponto médio e deixamos ajustável por variável de ambiente. É estimativa,
  e a tela sempre diz isso. Mint não é um degrau de preço no TCGplayer: vale o mesmo que Near Mint.
*/

const fator = (chave) => config.estados[chave];

export const ESTADOS = Object.freeze([
  { valor: 'Mint', rotulo: 'Mint', descricao: 'Perfeita, como se nunca tivesse sido manuseada. Para preço, vale o mesmo que Near Mint.', fator: () => 1 },
  { valor: 'Near Mint', rotulo: 'Near Mint', descricao: 'Quase perfeita: sem defeitos, ou só marcas mínimas.', fator: () => 1 },
  { valor: 'Lightly Played', rotulo: 'Lightly Played', descricao: 'Desgaste leve nas bordas ou riscos que só se veem em ângulo. A estrutura está intacta.', fator: () => fator('lightlyPlayed') },
  { valor: 'Moderately Played', rotulo: 'Moderately Played', descricao: 'Desgaste visível: cantos esbranquiçados, riscos, talvez uma dobra pequena.', fator: () => fator('moderatelyPlayed') },
  { valor: 'Heavily Played', rotulo: 'Heavily Played', descricao: 'Desgaste forte: vincos e bordas desfiadas. A arte ainda aparece inteira.', fator: () => fator('heavilyPlayed') },
  { valor: 'Damaged', rotulo: 'Damaged', descricao: 'Dano grave: vinco que atravessa a carta, rasgo, água ou escrita.', fator: () => fator('damaged') },
]);

/** Nomes que existiam antes da escala padrão: continuam valendo (e o banco é convertido no boot). */
export const ESTADOS_ANTIGOS = Object.freeze({
  Lacrado: 'Mint',
  Excelente: 'Near Mint',
  Jogado: 'Moderately Played',
  Danificado: 'Damaged',
});

/** O nome oficial do estado, ou null se vazio/desconhecido. */
export function estadoCanonico(valor) {
  const texto = String(valor ?? '').trim();
  if (!texto) return null;
  const direto = ESTADOS.find((e) => e.valor.toLowerCase() === texto.toLowerCase());
  if (direto) return direto.valor;
  return ESTADOS_ANTIGOS[texto] ?? null;
}

/** Fração do preço Near Mint que a carta vale neste estado. Sem estado informado (ou desconhecido): 1. */
export function fatorDoEstado(valor) {
  const canonico = estadoCanonico(valor);
  return ESTADOS.find((e) => e.valor === canonico)?.fator() ?? 1;
}

/** O que a API entrega para a tela montar o campo de estado (nome, explicação e fator). */
export function listarEstados() {
  return ESTADOS.map((e) => ({ valor: e.valor, rotulo: e.rotulo, descricao: e.descricao, fator: e.fator() }));
}
