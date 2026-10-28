/*
  Interpreta o texto que o OCR leu de uma foto de carta. Só funções puras (sem DOM): o servidor de testes
  importa este mesmo arquivo para conferir as regras sem precisar de navegador.

  O OCR erra bastante em carta (brilho do holofoil, foto torta). Por isso nada aqui "decide" a carta:
  só extrai pistas — o número impresso ("025/165") e o começo do nome — e a tela mostra o que foi lido
  para a pessoa corrigir.
*/

const sem = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Palavras impressas no topo da carta que não fazem parte do nome.
const PALAVRAS_DO_TOPO = new Set([
  'basic', 'basico', 'stage', 'fase', 'hp', 'ps', 'evolves', 'evolui', 'from', 'de', 'trainer', 'treinador',
  'item', 'supporter', 'apoiador', 'stadium', 'estadio', 'energy', 'energia', 'pokemon', 'tool', 'ferramenta',
  'restored', 'restaurado', 'mega', 'lv', 'level', 'nivel',
]);

/**
 * Acha o número impresso no rodapé: "025/165" → { numero: '025', total: '165' }, ou o código de promo
 * ("SWSH123") → { numero: 'SWSH123', total: '' }. Devolve null se não achar nada plausível.
 */
export function interpretarRodape(texto) {
  const t = String(texto ?? '');

  // A barra costuma sair como "I", "l" ou "|" no OCR; só vale entre dígitos.
  for (const m of t.matchAll(/(\d{1,3})\s*[/|\\Il]\s*(\d{1,3})/g)) {
    const numero = Number(m[1]);
    const total = Number(m[2]);
    // O total de uma coleção raramente passa de 400; o número pode passar do total (raridades secretas).
    if (numero >= 1 && total >= 10 && total <= 400 && numero <= total + 150) {
      return { numero: m[1], total: m[2] };
    }
  }

  const promo = t.toUpperCase().match(/\b(SWSH|SVP|SM|XY|BW|HGSS|DP|BLW|SMP)\s?-?\s?(\d{1,3})\b/);
  if (promo) return { numero: `${promo[1]}${promo[2]}`, total: '' };

  return null;
}

/**
 * Tira o nome da faixa do topo da carta. Devolve { nome, chave } ou null:
 * `nome` é o texto limpo ("Pikachu ex") e `chave` a palavra que melhor serve de busca por prefixo
 * ("Pikachu") — uma letra errada no fim do nome não derruba a busca.
 *
 * Vale a primeira linha que parece um nome: o nome vem antes do texto "Evolui de…", que nas cartas
 * antigas também cita outro Pokémon e enganaria a leitura se a linha mais longa ganhasse.
 */
export function interpretarTopo(texto) {
  for (const linha of String(texto ?? '').split(/\r?\n/)) {
    if (/\b(evolves|evolui)\b/.test(sem(linha))) continue;
    const palavras = linha
      .replace(/[^\p{L}'’\-\s]/gu, ' ')
      .split(/\s+/)
      .map((p) => p.replace(/^[-'’]+|[-'’]+$/g, ''))
      .filter((p) => p.length >= 2 && !PALAVRAS_DO_TOPO.has(sem(p)));
    const longas = palavras.filter((p) => p.length >= 3);
    if (!longas.length) continue;

    // Lixo no começo da linha ("Ba", "LV") é comum: a chave sai da maior palavra entre as três primeiras.
    const chave = longas.slice(0, 3).reduce((a, b) => (b.length > a.length ? b : a));
    return { nome: palavras.join(' '), chave };
  }
  return null;
}

/** Quanto o nome da carta se parece com a pista lida (0 a 3). Usado só para ordenar os resultados. */
export function pontuarNome(nomeDaCarta, chave) {
  const a = sem(nomeDaCarta);
  const b = sem(chave);
  if (!b) return 0;
  if (a.startsWith(b)) return 3;
  if (a.includes(b)) return 2;
  // Tolera uma letra errada: compara pares de letras seguidas.
  const pares = (s) => new Set(Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2)));
  const pb = pares(b);
  if (!pb.size) return 0;
  const pa = pares(a);
  let comuns = 0;
  for (const p of pb) if (pa.has(p)) comuns += 1;
  return comuns / pb.size;
}

/** Ordena as cartas das mais para as menos parecidas com a pista, mantendo a ordem original nos empates. */
export function ordenarPorNome(cartas, chave) {
  if (!chave) return cartas;
  return cartas
    .map((carta, i) => ({ carta, i, pontos: pontuarNome(carta.name, chave) }))
    .sort((x, y) => y.pontos - x.pontos || x.i - y.i)
    .map((x) => x.carta);
}

const PREFIXOS_DE_PROMO = 'SWSH|SVP|SMP|SM|XY|BW|HGSS|DP|BLW|TG|GG|SV|RC';

/**
 * Interpreta o que a pessoa digitou no campo de busca: nome, número da carta ou os dois juntos.
 *   "pikachu"        → nome
 *   "025/165"        → número 25 de uma coleção com 165 cartas
 *   "25"             → número 25 (de qualquer coleção)
 *   "pikachu 25/165" → nome + número
 *   "SWSH123"        → código de promo
 * Só reconhece número quando o trecho é inteiro um número (um nome como "Porygon2" não vira busca por número).
 */
export function interpretarBusca(texto) {
  const palavras = String(texto ?? '').trim().split(/\s+/).filter(Boolean);
  const padrao = new RegExp(`^(?:(\\d{1,3})(?:/(\\d{1,3}))?|((?:${PREFIXOS_DE_PROMO})-?\\d{1,3}))$`, 'i');
  const indice = palavras.findIndex((p) => padrao.test(p));
  if (indice < 0) return { nome: palavras.join(' '), numero: '', total: '' };

  const [, digitos, total, promo] = palavras[indice].match(padrao);
  const nome = palavras.filter((_, i) => i !== indice).join(' ');
  return { nome, numero: promo ? promo.replace('-', '').toUpperCase() : digitos, total: total ?? '' };
}

/**
 * Converte o quadro-guia (em pixels da tela) na região correspondente do vídeo (em pixels do vídeo).
 * O <video> é exibido com object-fit: cover — escala até cobrir a caixa e corta o que sobra —, então
 * a conta precisa desfazer essa escala e esse corte.
 */
export function recorteDaGuia({ video, caixa, guia }) {
  const escala = Math.max(caixa.largura / video.largura, caixa.altura / video.altura);
  const sobraX = (video.largura * escala - caixa.largura) / 2;
  const sobraY = (video.altura * escala - caixa.altura) / 2;
  return {
    x: (guia.x + sobraX) / escala,
    y: (guia.y + sobraY) / escala,
    largura: guia.largura / escala,
    altura: guia.altura / escala,
  };
}
