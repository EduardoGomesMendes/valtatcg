import { db } from '../db/index.js';

/* Acesso ao banco do "esqueci minha senha". As regras ficam em redefinicoes.js. */

export function buscarPorTokenHash(tokenHash) {
  return db.prepare('SELECT * FROM redefinicoes_senha WHERE token_hash = ?').get(tokenHash) ?? null;
}

/** `expiraEm` no passado e sem token = pedido só para contar nos limites (e-mail sem conta). */
export function criar({ usuarioId = null, tokenHash = null, email, ip, expiraEm }) {
  db.prepare(
    'INSERT INTO redefinicoes_senha (usuario_id, token_hash, email, ip, expira_em) VALUES (?, ?, ?, ?, ?)',
  ).run(usuarioId, tokenHash, email, ip ?? null, expiraEm);
}

/** Um link novo cancela os anteriores: só o último e-mail funciona. */
export function invalidarAbertosDoUsuario(usuarioId) {
  db.prepare(
    "UPDATE redefinicoes_senha SET usado_em = datetime('now') WHERE usuario_id = ? AND usado_em IS NULL AND token_hash IS NOT NULL",
  ).run(Number(usuarioId));
}

/** Reivindica o link, uma única vez (dois cliques ao mesmo tempo não trocam a senha duas vezes). */
export function reivindicar(id) {
  const r = db.prepare("UPDATE redefinicoes_senha SET usado_em = datetime('now') WHERE id = ? AND usado_em IS NULL").run(Number(id));
  return r.changes === 1;
}

/** A troca falhou depois da reivindicação: devolve o link, para a pessoa tentar de novo. */
export function liberar(id) {
  db.prepare('UPDATE redefinicoes_senha SET usado_em = NULL WHERE id = ?').run(Number(id));
}

export const pedidosDoEmail = (email, desde) => db.prepare('SELECT COUNT(*) AS n FROM redefinicoes_senha WHERE email = ? AND criado_em >= ?').get(email, desde).n;
export const pedidosDoIp = (ip, desde) => db.prepare('SELECT COUNT(*) AS n FROM redefinicoes_senha WHERE ip = ? AND criado_em >= ?').get(ip ?? '', desde).n;

export function limparAntigos() {
  db.prepare("DELETE FROM redefinicoes_senha WHERE criado_em < datetime('now', '-7 days')").run();
}
