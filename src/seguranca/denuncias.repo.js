import { db } from '../db/index.js';
import { faixaEtaria } from './idade.js';
import * as forum from '../comunidade/forum.repo.js';

export const MOTIVOS = Object.freeze({
  seguranca_menor: 'Contato inadequado com menor (pedido de foto, telefone, encontro ou segredo)',
  ofensa: 'Ofensa, xingamento ou bullying',
  golpe: 'Golpe ou tentativa de fraude',
  falsificacao: 'Carta falsificada ou produto enganoso',
  conteudo_improprio: 'Conteúdo impróprio',
  assedio: 'Assédio ou contato inadequado',
  outro: 'Outro motivo',
});

const TIPOS = ['loja', 'usuario', 'topico', 'resposta', 'evento'];
const TABELAS = { loja: 'lojas', usuario: 'usuarios', topico: 'forum_topicos', resposta: 'forum_respostas', evento: 'eventos' };
const LIMITE_POR_DIA = 10;

function alvoExiste(tipo, id) {
  return Boolean(db.prepare(`SELECT 1 FROM ${TABELAS[tipo]} WHERE id = ?`).get(Number(id)));
}

/** Repetir a mesma denúncia em aberto não cria outra: devolve a que já existe. */
export function criar({ autorId, alvoTipo, alvoId, motivo, detalhe = '' }) {
  if (!TIPOS.includes(alvoTipo)) throw new Error('tipo de denúncia inválido');
  if (!Object.hasOwn(MOTIVOS, motivo)) throw new Error('escolha um motivo para a denúncia');
  if (!alvoExiste(alvoTipo, alvoId)) throw new Error('o item denunciado não existe mais');

  const texto = String(detalhe ?? '').trim().slice(0, 1000);

  const igual = db.prepare(
    "SELECT id FROM denuncias WHERE autor_id = ? AND alvo_tipo = ? AND alvo_id = ? AND status = 'aberta'",
  ).get(Number(autorId), alvoTipo, Number(alvoId));
  if (igual) return { id: igual.id, repetida: true };

  const hoje = db.prepare(
    "SELECT COUNT(*) AS n FROM denuncias WHERE autor_id = ? AND criado_em >= datetime('now', '-1 day')",
  ).get(Number(autorId)).n;
  if (hoje >= LIMITE_POR_DIA) throw new Error('você já enviou muitas denúncias hoje — tente amanhã');

  const info = db.prepare(
    'INSERT INTO denuncias (autor_id, alvo_tipo, alvo_id, motivo, detalhe) VALUES (?, ?, ?, ?, ?)',
  ).run(Number(autorId), alvoTipo, Number(alvoId), motivo, texto || null);

  // Risco a menor: o conteúdo sai do ar NA HORA, antes de qualquer análise. Se foi engano, o moderador reabre.
  if (motivo === 'seguranca_menor') {
    if (alvoTipo === 'topico') forum.moderarTopico(alvoId, 'ocultar');
    if (alvoTipo === 'resposta') forum.moderarResposta(alvoId, 'ocultar');
  }
  return { id: Number(info.lastInsertRowid), repetida: false, ocultado: motivo === 'seguranca_menor' };
}

/** O que o admin precisa ver para decidir: o conteúdo denunciado e quem o escreveu (para suspender a conta, se for o caso). */
function descreverAlvo(tipo, id) {
  if (tipo === 'loja') return db.prepare('SELECT nome, status FROM lojas WHERE id = ?').get(id) ?? null;
  if (tipo === 'usuario') return db.prepare('SELECT nome, email, suspenso FROM usuarios WHERE id = ?').get(id) ?? null;
  if (tipo === 'topico') {
    return db.prepare('SELECT t.titulo AS nome, t.oculto, t.autor_id AS autorId, u.nome AS autorNome, u.nascimento AS autorNascimento, u.suspenso AS autorSuspenso FROM forum_topicos t JOIN usuarios u ON u.id = t.autor_id WHERE t.id = ?').get(id) ?? null;
  }
  if (tipo === 'resposta') {
    const r = db.prepare('SELECT substr(r.corpo, 1, 160) AS nome, r.oculto, r.autor_id AS autorId, r.topico_id AS topicoId, u.nome AS autorNome, u.nascimento AS autorNascimento, u.suspenso AS autorSuspenso FROM forum_respostas r JOIN usuarios u ON u.id = r.autor_id WHERE r.id = ?').get(id);
    return r ?? null;
  }
  return db.prepare('SELECT e.titulo AS nome, e.status, e.criado_por AS autorId, u.nome AS autorNome, u.nascimento AS autorNascimento, u.suspenso AS autorSuspenso FROM eventos e JOIN usuarios u ON u.id = e.criado_por WHERE e.id = ?').get(id) ?? null;
}

export function listar(status = 'aberta') {
  const linhas = db.prepare(
    `SELECT d.*, a.nome AS autor_nome, a.email AS autor_email
       FROM denuncias d LEFT JOIN usuarios a ON a.id = d.autor_id
      WHERE (? = 'todas' OR d.status = ?)
      ORDER BY (d.motivo = 'seguranca_menor') DESC, d.id DESC LIMIT 200`,
  ).all(status, status);

  return linhas.map((d) => {
    const alvo = descreverAlvo(d.alvo_tipo, d.alvo_id);
    // Idade do autor só para o admin priorizar (assédio envolvendo menor); a data em si não sai daqui.
    if (alvo && 'autorNascimento' in alvo) {
      alvo.autorFaixa = faixaEtaria(alvo.autorNascimento);
      delete alvo.autorNascimento;
    }
    return { ...d, motivo_rotulo: MOTIVOS[d.motivo] ?? d.motivo, alvo };
  });
}

export function resolver(id, { adminId, status, nota = '' }) {
  if (!['resolvida', 'descartada'].includes(status)) throw new Error('status inválido');
  const info = db.prepare(
    `UPDATE denuncias SET status = ?, nota_admin = ?, resolvida_por = ?, resolvida_em = datetime('now')
      WHERE id = ? AND status = 'aberta'`,
  ).run(status, String(nota ?? '').trim().slice(0, 500) || null, Number(adminId), Number(id));
  if (!info.changes) throw new Error('denúncia não encontrada ou já resolvida');
}

export function contarAbertas() {
  return db.prepare("SELECT COUNT(*) AS n FROM denuncias WHERE status = 'aberta'").get().n;
}
