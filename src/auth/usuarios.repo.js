import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { db } from '../db/index.js';
import { config } from '../config.js';

/* ------------------------------------------------------------------ */
/* Senhas                                                              */
/* ------------------------------------------------------------------ */

const TAMANHO_HASH = 64;

function gerarHash(senha) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(senha, salt, TAMANHO_HASH).toString('hex');
  return { hash, salt };
}

/** Comparação em tempo constante — não vaza informação pelo tempo de resposta. */
function conferirSenha(senha, hashGuardado, salt) {
  try {
    const calculado = scryptSync(senha, salt, TAMANHO_HASH);
    const guardado = Buffer.from(hashGuardado, 'hex');
    return calculado.length === guardado.length && timingSafeEqual(calculado, guardado);
  } catch {
    return false;
  }
}

export function validarSenha(senha) {
  if (typeof senha !== 'string' || senha.length < 8) {
    return 'A senha precisa ter pelo menos 8 caracteres.';
  }
  if (!/[a-zA-Z]/.test(senha) || !/[0-9]/.test(senha)) {
    return 'A senha precisa ter pelo menos uma letra e um número.';
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* E-mail                                                              */
/* ------------------------------------------------------------------ */

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export function normalizarEmail(bruto) {
  return String(bruto ?? '').trim().toLowerCase();
}

export function emailValido(email) {
  return EMAIL.test(normalizarEmail(email));
}

/** Remove hash e salt antes de qualquer coisa sair para a API. */
export function semSegredos(usuario) {
  if (!usuario) return null;
  const { senha_hash: _h, senha_salt: _s, ...publico } = usuario;
  return publico;
}

/* ------------------------------------------------------------------ */
/* Consultas                                                           */
/* ------------------------------------------------------------------ */

export function buscarPorId(id) {
  return db.prepare('SELECT * FROM usuarios WHERE id = ?').get(Number(id)) ?? null;
}

export function buscarPorEmail(email) {
  return db.prepare('SELECT * FROM usuarios WHERE email = ? COLLATE NOCASE')
    .get(normalizarEmail(email)) ?? null;
}

/* ------------------------------------------------------------------ */
/* Escrita                                                             */
/* ------------------------------------------------------------------ */

export function criar({ nome, email, senha }) {
  const emailLimpo = normalizarEmail(email);

  if (!String(nome ?? '').trim()) throw new Error('nome é obrigatório');
  if (!emailValido(emailLimpo)) throw new Error('informe um e-mail válido');

  const problema = validarSenha(senha);
  if (problema) throw new Error(problema);

  if (buscarPorEmail(emailLimpo)) throw new Error('este e-mail já está cadastrado');

  const { hash, salt } = gerarHash(senha);
  const info = db.prepare(
    'INSERT INTO usuarios (nome, email, senha_hash, senha_salt) VALUES (?, ?, ?, ?)',
  ).run(String(nome).trim(), emailLimpo, hash, salt);

  return semSegredos(buscarPorId(info.lastInsertRowid));
}

/**
 * Define uma senha nova para a conta, sem exigir a antiga.
 *
 * Existe para o admin resolver "esqueci minha senha" na mão — o valtatcg
 * ainda não tem um fluxo de recuperação por e-mail, então isto é o caminho
 * até lá existir (ver src/db/definir-senha.js).
 */
export function definirSenha(usuarioId, novaSenha) {
  const alvo = buscarPorId(usuarioId);
  if (!alvo) throw new Error('usuário não encontrado');

  const problema = validarSenha(novaSenha);
  if (problema) throw new Error(problema);

  const { hash, salt } = gerarHash(novaSenha);
  db.prepare('UPDATE usuarios SET senha_hash = ?, senha_salt = ? WHERE id = ?')
    .run(hash, salt, Number(usuarioId));

  return semSegredos(buscarPorId(usuarioId));
}

/** A própria pessoa troca a senha — diferente de definirSenha(), exige a atual. */
export function trocarSenha(usuarioId, novaSenha, senhaAtual) {
  const alvo = buscarPorId(usuarioId);
  if (!alvo) throw new Error('usuário não encontrado');
  if (!conferirSenha(senhaAtual ?? '', alvo.senha_hash, alvo.senha_salt)) {
    throw new Error('senha atual incorreta');
  }
  return definirSenha(usuarioId, novaSenha);
}

export function atualizarPerfil(usuarioId, { nome, email } = {}) {
  const alvo = buscarPorId(usuarioId);
  if (!alvo) throw new Error('usuário não encontrado');

  const sets = [];
  const valores = [];

  if (nome !== undefined) {
    if (!String(nome).trim()) throw new Error('nome é obrigatório');
    sets.push('nome = ?');
    valores.push(String(nome).trim());
  }

  if (email !== undefined) {
    const novo = normalizarEmail(email);
    if (!emailValido(novo)) throw new Error('informe um e-mail válido');
    const jaUsado = buscarPorEmail(novo);
    if (jaUsado && jaUsado.id !== alvo.id) throw new Error('este e-mail já está cadastrado');
    sets.push('email = ?');
    valores.push(novo);
  }

  if (!sets.length) return semSegredos(alvo);

  db.prepare(`UPDATE usuarios SET ${sets.join(', ')} WHERE id = ?`).run(...valores, Number(usuarioId));
  return semSegredos(buscarPorId(usuarioId));
}

/* ------------------------------------------------------------------ */
/* Autenticação e sessões                                              */
/* ------------------------------------------------------------------ */

const { inatividadeMinutos: INATIVIDADE_MIN, duracaoHoras: DURACAO_SESSAO_HORAS } = config.sessao;

/*
  O painel pode se atualizar sozinho periodicamente. Registrar "último uso" a
  cada uma dessas batidas seria uma escrita no banco por tab aberta, o tempo
  todo. Um minuto de granularidade é fino o bastante para um prazo de 30 min.
*/
const INTERVALO_REGISTRO_USO_SEG = 60;

function hashDoToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/** Confere e-mail e senha. Retorna o usuário (sem segredos) ou null. */
export function autenticar(email, senha) {
  const usuario = buscarPorEmail(email);
  if (!usuario) return null;
  if (!conferirSenha(senha ?? '', usuario.senha_hash, usuario.senha_salt)) return null;
  return semSegredos(usuario);
}

export function abrirSessao(usuarioId) {
  const token = randomBytes(32).toString('hex');
  db.prepare(
    `INSERT INTO sessoes (token_hash, usuario_id, ultimo_uso, expira_em)
     VALUES (?, ?, datetime('now'), datetime('now', ?))`,
  ).run(hashDoToken(token), Number(usuarioId), `+${DURACAO_SESSAO_HORAS} hours`);
  return token;
}

export function usuarioDaSessao(token) {
  if (!token) return null;

  const hash = hashDoToken(token);
  const sessao = db.prepare('SELECT * FROM sessoes WHERE token_hash = ?').get(hash);
  if (!sessao) return null;

  const agoraMs = Date.now();
  const emMs = (texto) => new Date(`${String(texto).replace(' ', 'T')}Z`).getTime();

  const venceu = !(emMs(sessao.expira_em) > agoraMs);
  const parada = !(emMs(sessao.ultimo_uso ?? sessao.criado_em) > agoraMs - INATIVIDADE_MIN * 60000);

  if (venceu || parada) {
    db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(hash);
    return null;
  }

  const usuario = buscarPorId(sessao.usuario_id);
  if (!usuario) return null;

  db.prepare(
    `UPDATE sessoes SET ultimo_uso = datetime('now')
      WHERE token_hash = ?
        AND COALESCE(ultimo_uso, criado_em) <= datetime('now', ?)`,
  ).run(hash, `-${INTERVALO_REGISTRO_USO_SEG} seconds`);

  return semSegredos(usuario);
}

export function encerrarSessao(token) {
  if (!token) return;
  db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(hashDoToken(token));
}

/* ------------------------------------------------------------------ */
/* Administração                                                       */
/* ------------------------------------------------------------------ */

/** Lista todos os usuários com a quantidade de cartas na coleção de cada um. */
export function listarTodos() {
  return db.prepare(`
    SELECT u.id, u.nome, u.email, u.admin, u.criado_em,
           u.assinatura_status, u.teste_termina_em, u.assinatura_expira_em,
           COUNT(ci.id) AS itens_na_colecao
    FROM usuarios u
    LEFT JOIN colecao_item ci ON ci.usuario_id = u.id
    GROUP BY u.id
    ORDER BY u.criado_em DESC
  `).all();
}

export function contarAdmins() {
  return db.prepare('SELECT COUNT(*) AS n FROM usuarios WHERE admin = 1').get().n;
}

export function definirAdmin(id, valor) {
  const alvo = buscarPorId(id);
  if (!alvo) throw new Error('usuário não encontrado');
  if (!valor && alvo.admin && contarAdmins() <= 1) {
    throw new Error('este é o único administrador — promova outra conta antes de tirar o acesso desta');
  }
  db.prepare('UPDATE usuarios SET admin = ? WHERE id = ?').run(valor ? 1 : 0, Number(id));
  return semSegredos(buscarPorId(id));
}

export function excluirComoAdmin(id) {
  const alvo = buscarPorId(id);
  if (!alvo) return;
  if (alvo.admin && contarAdmins() <= 1) {
    throw new Error('este é o único administrador — promova outra conta antes de excluir esta');
  }
  db.prepare('DELETE FROM usuarios WHERE id = ?').run(Number(id));
}
