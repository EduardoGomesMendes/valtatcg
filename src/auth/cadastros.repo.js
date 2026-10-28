import { db } from '../db/index.js';

/*
  Acesso ao banco do cadastro público. As regras (validação, limites, o que fazer em cada
  situação) ficam em cadastros.js; aqui só se lê e se grava.
*/

const agoraUtc = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

export function buscarPorTokenHash(tokenHash) {
  return db.prepare('SELECT * FROM cadastros_pendentes WHERE token_hash = ?').get(tokenHash) ?? null;
}

/** O pedido ainda em aberto deste e-mail: não confirmado e não vencido. */
export function pendenteAberto(email) {
  return db.prepare(
    `SELECT * FROM cadastros_pendentes
      WHERE email = ? AND confirmado_em IS NULL AND expira_em > ?
      ORDER BY id DESC LIMIT 1`,
  ).get(email, agoraUtc()) ?? null;
}

/** Alguém (com OUTRO e-mail) já pediu este nome de usuário e ainda pode confirmar? */
export function usuarioReservado(usuario, emailDaPessoa) {
  return Boolean(db.prepare(
    `SELECT 1 FROM cadastros_pendentes
      WHERE usuario = ? COLLATE NOCASE AND email <> ? AND confirmado_em IS NULL AND expira_em > ? LIMIT 1`,
  ).get(usuario, emailDaPessoa, agoraUtc()));
}

export function criar({ tokenHash, nome, usuario, email, nascimento, responsavel, ip, expiraEm }) {
  db.prepare(
    `INSERT INTO cadastros_pendentes
       (token_hash, nome, usuario, email, nascimento, responsavel_nome, responsavel_email, ip, aceite_termos_em, expira_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`,
  ).run(tokenHash, nome, usuario, email, nascimento, responsavel?.nome ?? null, responsavel?.email ?? null, ip, expiraEm);
}

/** Pedido repetido do mesmo e-mail: vale o link NOVO (o anterior deixa de funcionar) e os dados mais recentes. */
export function renovar(id, { tokenHash, nome, usuario, nascimento, responsavel, ip, expiraEm }) {
  db.prepare(
    `UPDATE cadastros_pendentes
        SET token_hash = ?, nome = ?, usuario = ?, nascimento = ?, responsavel_nome = ?, responsavel_email = ?,
            ip = ?, expira_em = ?, aceite_termos_em = datetime('now')
      WHERE id = ? AND confirmado_em IS NULL`,
  ).run(tokenHash, nome, usuario, nascimento, responsavel?.nome ?? null, responsavel?.email ?? null, ip, expiraEm, id);
}

/** Só troca o link (reenvio): os dados que a pessoa digitou continuam os mesmos. */
export function trocarLink(id, { tokenHash, ip, expiraEm }) {
  db.prepare('UPDATE cadastros_pendentes SET token_hash = ?, ip = ?, expira_em = ? WHERE id = ? AND confirmado_em IS NULL')
    .run(tokenHash, ip, expiraEm, id);
}

/**
 * Reivindica o pedido, uma única vez: quem consegue marcar é quem pode criar a conta. Devolve false se
 * outra requisição chegou antes (o mesmo link aberto duas vezes ao mesmo tempo não cria duas contas).
 */
export function reivindicar(id) {
  const r = db.prepare("UPDATE cadastros_pendentes SET confirmado_em = datetime('now') WHERE id = ? AND confirmado_em IS NULL").run(Number(id));
  return r.changes === 1;
}

/** A criação da conta falhou depois da reivindicação: devolve o pedido, para a pessoa poder tentar de novo. */
export function liberar(id) {
  db.prepare('UPDATE cadastros_pendentes SET confirmado_em = NULL WHERE id = ? AND usuario_id IS NULL').run(Number(id));
}

/** Conta criada: o pedido aponta para ela e deixa de guardar a data de nascimento e o responsável. */
export function vincularUsuario(id, usuarioId) {
  db.prepare(
    'UPDATE cadastros_pendentes SET usuario_id = ?, nascimento = NULL, responsavel_nome = NULL, responsavel_email = NULL WHERE id = ?',
  ).run(Number(usuarioId), Number(id));
}

export function registrarEnvio({ email, ip, tipo }) {
  db.prepare('INSERT INTO cadastros_envios (email, ip, tipo) VALUES (?, ?, ?)').run(email, ip ?? null, tipo);
}

export const enviosDoEmail = (email, desde) => db.prepare('SELECT COUNT(*) AS n FROM cadastros_envios WHERE email = ? AND criado_em >= ?').get(email, desde).n;
export const enviosDoIp = (ip, desde) => db.prepare('SELECT COUNT(*) AS n FROM cadastros_envios WHERE ip = ? AND criado_em >= ?').get(ip ?? '', desde).n;

/** Pedido que ninguém confirmou guarda data de nascimento: não fica mais que uma semana depois de vencer. */
export function limparAntigos() {
  db.prepare("DELETE FROM cadastros_envios WHERE criado_em < datetime('now', '-7 days')").run();
  db.prepare("DELETE FROM cadastros_pendentes WHERE confirmado_em IS NULL AND expira_em < datetime('now', '-7 days')").run();
}
