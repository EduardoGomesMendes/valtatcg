import { db } from '../db/index.js';
import { validarTexto, nomePublico } from './texto.js';

/*
  Fórum simples: categorias fixas, tópicos e respostas só em texto.
  Quem ver conteúdo impróprio denuncia (tabela `denuncias`) e o admin oculta.
  Ocultar não apaga: fica a prova, e o admin pode desfazer.
*/

export const CATEGORIAS = Object.freeze({
  cartas: { rotulo: 'Cartas e coleções', descricao: 'Preços, raridades, edições e dicas sobre cartas.', soAdmin: false },
  iniciantes: { rotulo: 'Quem está começando', descricao: 'Dúvidas de quem acabou de entrar no mundo das cartas.', soAdmin: false },
  eventos: { rotulo: 'Eventos e encontros', descricao: 'Conversa sobre torneios, feiras e encontros. Para divulgar um evento, use a página de Eventos.', soAdmin: false },
  avisos: { rotulo: 'Avisos do ValtaTCG', descricao: 'Novidades e regras da plataforma.', soAdmin: true },
});

const POR_PAGINA = 20;
const RESPOSTAS_POR_PAGINA = 30;
const TOPICOS_POR_HORA = 3;
const RESPOSTAS_POR_HORA = 20;

const categoriaValida = (c) => Object.hasOwn(CATEGORIAS, c);

/* ------------------------------------------------------------------ */
/* Leitura                                                             */
/* ------------------------------------------------------------------ */

export function categoriasComContagem() {
  const contagem = new Map(db.prepare(
    'SELECT categoria, COUNT(*) AS n FROM forum_topicos WHERE oculto = 0 GROUP BY categoria',
  ).all().map((l) => [l.categoria, l.n]));
  return Object.entries(CATEGORIAS).map(([chave, c]) => ({ chave, ...c, topicos: contagem.get(chave) ?? 0 }));
}

export function listarTopicos({ categoria = '', pagina = 1 } = {}) {
  const filtrar = categoriaValida(categoria);
  const onde = `t.oculto = 0${filtrar ? ' AND t.categoria = ?' : ''}`;
  const valores = filtrar ? [categoria] : [];
  const p = Math.max(1, Number(pagina) || 1);

  const total = db.prepare(`SELECT COUNT(*) AS n FROM forum_topicos t WHERE ${onde}`).get(...valores).n;
  const topicos = db.prepare(
    `SELECT t.id, t.categoria, t.titulo, t.fixado, t.fechado, t.respostas, t.criado_em, t.atividade_em, u.usuario, u.nome
       FROM forum_topicos t JOIN usuarios u ON u.id = t.autor_id
      WHERE ${onde}
      ORDER BY t.fixado DESC, t.atividade_em DESC, t.id DESC LIMIT ? OFFSET ?`,
  ).all(...valores, POR_PAGINA, (p - 1) * POR_PAGINA).map((t) => ({
    id: t.id,
    categoria: t.categoria,
    categoriaRotulo: CATEGORIAS[t.categoria]?.rotulo ?? t.categoria,
    titulo: t.titulo,
    fixado: Boolean(t.fixado),
    fechado: Boolean(t.fechado),
    respostas: t.respostas,
    criadoEm: t.criado_em,
    atividadeEm: t.atividade_em,
    autor: nomePublico(t),
  }));

  return { topicos, total, pagina: p, porPagina: POR_PAGINA };
}

/**
 * Tópico com as respostas de uma página. Quem não é admin não enxerga o que foi ocultado.
 * `autorId` só vai para o admin (para suspender a conta); os outros recebem `meu`.
 */
export function obterTopico(id, { pagina = 1, usuario } = {}) {
  const admin = Boolean(usuario?.admin);
  const t = db.prepare(
    `SELECT t.*, u.usuario, u.nome FROM forum_topicos t JOIN usuarios u ON u.id = t.autor_id WHERE t.id = ?`,
  ).get(Number(id));
  if (!t || (t.oculto && !admin)) return null;

  const p = Math.max(1, Number(pagina) || 1);
  const filtro = admin ? '' : 'AND r.oculto = 0';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM forum_respostas r WHERE r.topico_id = ? ${filtro}`).get(t.id).n;
  const respostas = db.prepare(
    `SELECT r.id, r.corpo, r.oculto, r.criado_em, r.autor_id, u.usuario, u.nome
       FROM forum_respostas r JOIN usuarios u ON u.id = r.autor_id
      WHERE r.topico_id = ? ${filtro} ORDER BY r.id LIMIT ? OFFSET ?`,
  ).all(t.id, RESPOSTAS_POR_PAGINA, (p - 1) * RESPOSTAS_POR_PAGINA);

  const dono = (autorId) => Number(autorId) === Number(usuario?.id);
  return {
    id: t.id,
    categoria: t.categoria,
    categoriaRotulo: CATEGORIAS[t.categoria]?.rotulo ?? t.categoria,
    titulo: t.titulo,
    corpo: t.corpo,
    fixado: Boolean(t.fixado),
    fechado: Boolean(t.fechado),
    oculto: Boolean(t.oculto),
    criadoEm: t.criado_em,
    autor: nomePublico(t),
    meu: dono(t.autor_id),
    ...(admin ? { autorId: t.autor_id } : {}),
    respostas: respostas.map((r) => ({
      id: r.id,
      corpo: r.corpo,
      oculto: Boolean(r.oculto),
      criadoEm: r.criado_em,
      autor: nomePublico(r),
      meu: dono(r.autor_id),
      ...(admin ? { autorId: r.autor_id } : {}),
    })),
    totalRespostas: total,
    pagina: p,
    porPagina: RESPOSTAS_POR_PAGINA,
  };
}

/* ------------------------------------------------------------------ */
/* Escrita                                                             */
/* ------------------------------------------------------------------ */

function conferirLimite(tabela, usuario, limite, mensagem) {
  if (usuario.admin) return;
  const feitas = db.prepare(`SELECT COUNT(*) AS n FROM ${tabela} WHERE autor_id = ? AND criado_em >= datetime('now', '-1 hour')`)
    .get(Number(usuario.id)).n;
  if (feitas >= limite) throw new Error(mensagem);
}

export function criarTopico(usuario, { categoria, titulo, corpo }) {
  if (!categoriaValida(categoria)) throw new Error('escolha uma categoria');
  if (CATEGORIAS[categoria].soAdmin && !usuario.admin) throw new Error('só a equipe publica nesta categoria');
  const t = validarTexto(titulo, { campo: 'título', min: 5, max: 120 });
  if (t.includes('\n')) throw new Error('título: use uma linha só');
  const c = validarTexto(corpo, { campo: 'texto', min: 10, max: 4000 });
  conferirLimite('forum_topicos', usuario, TOPICOS_POR_HORA, 'você já criou vários tópicos agora há pouco — espere um pouco');

  const info = db.prepare('INSERT INTO forum_topicos (categoria, autor_id, titulo, corpo) VALUES (?, ?, ?, ?)')
    .run(categoria, usuario.id, t, c);
  return Number(info.lastInsertRowid);
}

export function responder(usuario, topicoId, corpo) {
  const t = db.prepare('SELECT id, fechado, oculto FROM forum_topicos WHERE id = ?').get(Number(topicoId));
  if (!t || t.oculto) throw new Error('tópico não encontrado');
  if (t.fechado) throw new Error('este tópico está fechado para novas respostas');
  const c = validarTexto(corpo, { campo: 'resposta', min: 2, max: 2000 });
  conferirLimite('forum_respostas', usuario, RESPOSTAS_POR_HORA, 'você respondeu muitas vezes agora há pouco — espere um pouco');

  const info = db.prepare('INSERT INTO forum_respostas (topico_id, autor_id, corpo) VALUES (?, ?, ?)').run(t.id, usuario.id, c);
  recontar(t.id, { atividade: true });
  return Number(info.lastInsertRowid);
}

function recontar(topicoId, { atividade = false } = {}) {
  db.prepare(
    `UPDATE forum_topicos SET respostas = (SELECT COUNT(*) FROM forum_respostas WHERE topico_id = ? AND oculto = 0)
        ${atividade ? ", atividade_em = datetime('now')" : ''} WHERE id = ?`,
  ).run(Number(topicoId), Number(topicoId));
}

/** O autor tira o próprio conteúdo do ar. Oculta em vez de apagar: se foi denunciado, a prova fica. */
export function removerProprio(usuario, tipo, id) {
  if (tipo === 'topico') {
    const info = db.prepare('UPDATE forum_topicos SET oculto = 1 WHERE id = ? AND autor_id = ?').run(Number(id), Number(usuario.id));
    if (!info.changes) throw new Error('tópico não encontrado');
    return;
  }
  const r = db.prepare('SELECT id, topico_id FROM forum_respostas WHERE id = ? AND autor_id = ?').get(Number(id), Number(usuario.id));
  if (!r) throw new Error('resposta não encontrada');
  db.prepare('UPDATE forum_respostas SET oculto = 1 WHERE id = ?').run(r.id);
  recontar(r.topico_id);
}

/* ------------------------------------------------------------------ */
/* Moderação (admin)                                                   */
/* ------------------------------------------------------------------ */

const ACOES_TOPICO = {
  ocultar: ['oculto', 1], mostrar: ['oculto', 0],
  fixar: ['fixado', 1], desafixar: ['fixado', 0],
  fechar: ['fechado', 1], abrir: ['fechado', 0],
};

export function moderarTopico(id, acao) {
  const par = ACOES_TOPICO[acao];
  if (!par) throw new Error('ação inválida');
  const info = db.prepare(`UPDATE forum_topicos SET ${par[0]} = ? WHERE id = ?`).run(par[1], Number(id));
  if (!info.changes) throw new Error('tópico não encontrado');
}

export function moderarResposta(id, acao) {
  if (!['ocultar', 'mostrar'].includes(acao)) throw new Error('ação inválida');
  const r = db.prepare('SELECT topico_id FROM forum_respostas WHERE id = ?').get(Number(id));
  if (!r) throw new Error('resposta não encontrada');
  db.prepare('UPDATE forum_respostas SET oculto = ? WHERE id = ?').run(acao === 'ocultar' ? 1 : 0, Number(id));
  recontar(r.topico_id);
}
