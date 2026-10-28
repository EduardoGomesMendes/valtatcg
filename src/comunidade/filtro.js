/*
  Filtro de conteúdo do fórum e dos eventos — primeira camada de proteção de menores.

  É uma camada, não a defesa inteira: pega o óbvio e os truques comuns (letras separadas,
  número no lugar de letra, letra repetida), mas quem quer burlar sempre encontra um jeito.
  Por isso há também denúncia, fila de moderação e suspensão automática (ver moderacao.js).

  As listas abaixo são de propósito simples e editáveis: acrescentar uma palavra é uma linha.
  Tudo é comparado em texto normalizado (minúsculo, sem acento).
*/

/** Classes "graves" contam como tentativa de risco para menores (3 em 24h suspendem a conta). */
export const CLASSES = Object.freeze({
  ofensa: { grave: false, motivo: 'xingamentos e ofensas não são permitidos aqui' },
  tema_sensivel: { grave: false, motivo: 'este assunto não pode ser tratado no fórum' },
  link: { grave: false, motivo: 'links não são permitidos' },
  contato: { grave: true, motivo: 'não é permitido pedir ou passar telefone, redes sociais ou outros contatos' },
  encontro: { grave: true, motivo: 'não é permitido combinar encontros pessoais' },
  dados_pessoais: { grave: true, motivo: 'não peça nem divulgue dados pessoais, fotos, idade, endereço ou escola' },
  sexual: { grave: true, motivo: 'este tipo de assunto não é permitido' },
  segredo: { grave: true, motivo: 'não é permitido pedir segredo sobre a conversa' },
});

const AJUDA = ' Se alguém pediu isso a você, use o botão Denunciar e conte a um adulto de confiança. O Disque 100 também atende.';
const COM_AJUDA = new Set(['encontro', 'dados_pessoais', 'sexual', 'segredo', 'tema_sensivel', 'contato']);

export function mensagemDe(classe) {
  return `Mensagem não publicada: ${CLASSES[classe].motivo}.${COM_AJUDA.has(classe) ? AJUDA : ''}`;
}

/* ------------------------------------------------------------------ */
/* Normalização                                                        */
/* ------------------------------------------------------------------ */

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };

const semAcento = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const colapsar = (t) => t.replace(/(.)\1+/g, '$1');

/** "p u t a", "v.s.f" → "puta", "vsf": junta letras soltas separadas por espaço ou símbolo. */
function juntarLetrasSoltas(t) {
  const extras = [];
  for (const m of t.matchAll(/(?:^|[^a-z0-9@$])((?:[a-z0-9@$][\s.\-_*]+){3,}[a-z0-9@$])(?=$|[^a-z0-9@$])/g)) {
    extras.push(m[1].replace(/[\s.\-_*]+/g, ''));
  }
  return extras;
}

/** Texto em ascii, com leet desfeito só dentro de palavras que misturam letra e símbolo (não estraga "4/102"). */
export function normalizar(texto) {
  const base = semAcento(texto).replace(/[​-‏‪-‮⁦-⁩]/g, '');
  const palavras = base.split(/[^a-z0-9@$]+/).filter(Boolean).map((p) => (
    /[a-z]/.test(p) && /[0-9@$]/.test(p) ? p.replace(/[0-9@$]/g, (c) => LEET[c] ?? c) : p
  ));
  return [...palavras, ...juntarLetrasSoltas(base).map((p) => p.replace(/[0-9@$]/g, (c) => LEET[c] ?? c))].join(' ');
}

/* ------------------------------------------------------------------ */
/* Listas                                                              */
/* ------------------------------------------------------------------ */

const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|br|io|gg|me|ly|app|xyz|gl|tv)\b)/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const TELEFONE = /(?:\d[\s().-]*){10,}/;

const PALAVRAS_OFENSIVAS = [
  'puta', 'puto', 'putaria', 'caralho', 'karalho', 'porra', 'merda', 'bosta', 'foda', 'fodase', 'foder', 'fodido',
  'fdp', 'pqp', 'vsf', 'vtnc', 'tnc', 'krl', 'cu', 'cuzao', 'cacete', 'buceta', 'bct', 'piroca',
  'viado', 'veado', 'bicha', 'sapatao', 'retardado', 'mongol', 'mongoloide', 'arrombado', 'babaca', 'otario',
  'idiota', 'imbecil', 'desgracado', 'vagabundo', 'vagabunda', 'piranha', 'safado', 'safada', 'cretino',
  'crioulo',
];
const OFENSIVAS_COLAPSADAS = new Set(PALAVRAS_OFENSIVAS.filter((p) => !p.includes(' ')).map(colapsar));

const FRASES = {
  ofensa: [
    /\bfilh[oa] da puta\b/, /\bvai (se )?(foder|matar|tomar no cu|a merda)\b/, /\b(se|sê) mata\b/, /\bse mate\b/,
    /\bvou te (matar|pegar la fora)\b/, /\bte mato\b/, /\bmorra\b/, /\bvai morrer\b/, /\bpreto sujo\b/,
  ],
  tema_sensivel: [
    /\bpedofil[oa]s?\b/, /\bpedofilia\b/, /\bestupr\w*\b/, /\bmolest\w*\b/, /\babus(ar|ou|ando|o sexual)\b/, /\bsuicid\w*\b/,
  ],
  contato: [
    /\b(whats ?app|whats|zap ?zap|zap|wpp|zipzap|telegram|insta|instagram|discord|snap ?chat|snap|tik ?tok|kwai|facebook|messenger|skype)\b/,
    /\b(me )?(chama|chame|fala|fale|manda|mande|vem|vamos|vai|add|adiciona|adicione)\b.{0,15}\b(pv|privado|inbox|dm|direct)\b/,
    /\b(pv|privado|inbox|dm)\b.{0,6}\b(comigo|ai|ae)\b/,
    /\bme (segue|siga|chama|chame|adiciona|adicione|add)\b/,
    /\b(meu|seu|teu|o seu|o meu)\s+(numero|telefone|fone|cel|celular|contato)\b/,
    /\bpass[ae]\s+(o\s+|seu\s+|teu\s+|um\s+)?(numero|telefone|fone|cel|celular|contato)\b/,
  ],
  encontro: [
    /\bmarcar (um |de nos |de se )?(encontro|ver|encontrar)\b/, /\b(vamos|vamo|bora|quer|queria|podemos)\s+(nos |se |me )?(ver|encontrar|conhecer|sair)\b/,
    /\b(te|me|nos)\s+encontr(ar|o|a)\b/, /\bconhecer (voce )?pessoalmente\b/, /\bso nos dois\b/, /\ba sos\b/,
    /\b(minha|sua|tua) casa\b/, /\bme visit(a|ar|e)\b/, /\b(vem|venha|vai)\s+(pra|para|na|ate)\s+(minha|sua)\b/,
    /\bte (busco|buscar|pego|pegar)\b/, /\bonde (voce )?(mora|estuda|fica)\b/, /\b(qual|que) (e )?(a )?(sua|tua) (escola|rua|cidade e bairro)\b/,
    /\bem que escola\b/,
  ],
  dados_pessoais: [
    /\b(foto|fotos|selfie|video|videos)\s+(sua|tua|de voce|do seu corpo)\b/, /\b(sua|tua)\s+(foto|selfie|cara|idade|escola|rua)\b/,
    /\b(seu|teu|meu)\s+endereco\b/, /\bqual (e )?(a )?(sua|tua) idade\b/, /\b(quantos anos voce tem|voce tem quantos anos|que idade voce tem|quantos aninhos)\b/,
    /\bvoce e (de )?menor\b/, /\btem namorad[oa]\b/, /\bmostra (a )?cara\b/,
  ],
  sexual: [
    /\b(sexo|sexual|sexy|porno|pornografia|transar|transa|gostos[oa]s?|gostosinh[oa]|tesao|punheta|siririca|nude|nudes|pelad[oa]s?|peladinh[oa]|sem roupa|safadeza)\b/,
  ],
  segredo: [
    /\bnosso segredo\b/, /\bsegredo nosso\b/, /\bso entre a gente\b/, /\bsem (ninguem saber|seus pais)\b/, /\bseus pais nao\b/,
    /\bnao (conta|conte|fala|fale|diz|diga) (pra|para|pro|pros|aos?) (ninguem|seus pais|sua mae|seu pai|os seus pais)\b/,
  ],
};

/**
 * @returns {{classe: string, grave: boolean, mensagem: string} | null} a primeira regra que o texto viola
 */
export function analisar(texto) {
  const bruto = String(texto ?? '');
  // Telefone e e-mail são contato direto (grave). Link solto só é barrado, sem contar como risco.
  if (EMAIL.test(bruto) || TELEFONE.test(bruto)) return resultado('contato');
  if (LINK.test(bruto)) return resultado('link');

  const t = normalizar(bruto);
  if (!t) return null;

  // Ordem: o que mais ameaça um menor primeiro, para a mensagem e a contagem refletirem o pior caso.
  for (const classe of ['segredo', 'encontro', 'dados_pessoais', 'sexual', 'contato', 'tema_sensivel', 'ofensa']) {
    if (FRASES[classe]?.some((re) => re.test(t))) return resultado(classe);
  }
  if (t.split(' ').some((p) => OFENSIVAS_COLAPSADAS.has(colapsar(p)))) return resultado('ofensa');
  return null;
}

function resultado(classe) {
  return { classe, grave: CLASSES[classe].grave, mensagem: mensagemDe(classe) };
}
