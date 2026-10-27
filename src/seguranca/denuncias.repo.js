import { db } from '../db/index.js';

export const MOTIVOS = Object.freeze({
  golpe: 'Golpe ou tentativa de fraude',
  falsificacao: 'Carta falsificada ou produto enganoso',
  conteudo_improprio: 'Conteúdo impróprio',
  assedio: 'Assédio ou contato inadequado',
  outro: 'Outro motivo',
});

const TIPOS = ['loja', 'usuario'];
const LIMITE_POR_DIA = 10;

function alvoExiste(tipo, id) {
  const tabela = tipo === 'loja' ? 'lojas' : 'usuarios';
  return Boolean(db.prepare(`SELECT 1 FROM ${tabela} WHERE id = ?`).get(Number(id)));
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
  return { id: Number(info.lastInsertRowid), repetida: false };
}

export function listar(status = 'aberta') {
  const linhas = db.prepare(
    `SELECT d.*, a.nome AS autor_nome, a.email AS autor_email
       FROM denuncias d LEFT JOIN usuarios a ON a.id = d.autor_id
      WHERE (? = 'todas' OR d.status = ?) ORDER BY d.id DESC LIMIT 200`,
  ).all(status, status);

  return linhas.map((d) => {
    const alvo = d.alvo_tipo === 'loja'
      ? db.prepare('SELECT nome, status FROM lojas WHERE id = ?').get(d.alvo_id)
      : db.prepare('SELECT nome, email, suspenso FROM usuarios WHERE id = ?').get(d.alvo_id);
    return { ...d, motivo_rotulo: MOTIVOS[d.motivo] ?? d.motivo, alvo: alvo ?? null };
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
