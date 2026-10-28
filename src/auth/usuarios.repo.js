import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { nascimentoValido, faixaEtaria, idadeMinimaAtingida } from '../seguranca/idade.js';
import { analisar } from '../comunidade/filtro.js';

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

/* ------------------------------------------------------------------ */
/* Nome de usuário                                                     */
/* ------------------------------------------------------------------ */

// Letras, números, "_" e ".", de 3 a 20 caracteres — sem espaço, de propósito:
// tem que dar para digitar rápido numa tela de login, como o e-mail.
const USUARIO = /^[a-zA-Z0-9_.]{3,20}$/;

export function normalizarUsuario(bruto) {
  return String(bruto ?? '').trim();
}

export function usuarioValido(usuario) {
  return USUARIO.test(normalizarUsuario(usuario));
}

export function buscarPorUsuario(usuario) {
  return db.prepare('SELECT * FROM usuarios WHERE usuario = ? COLLATE NOCASE')
    .get(normalizarUsuario(usuario)) ?? null;
}

/** Remove hash e salt antes de qualquer coisa sair para a API. */
export function semSegredos(usuario) {
  if (!usuario) return null;
  const { senha_hash: _h, senha_salt: _s, responsavel_token_hash: _t, ...publico } = usuario;
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

/** O nome de usuário aparece para todos no fórum: nada de ofensa, assunto sexual ou telefone nele. */
function apelidoProibido(apelido) {
  return Boolean(analisar(apelido) || analisar(String(apelido).replace(/[0-9_.]+/g, ' ')));
}

const MSG_APELIDO_PROIBIDO = 'escolha outro nome de usuário — este não pode ser usado';

const MSG_USUARIO = 'nome de usuário precisa ter de 3 a 20 caracteres, só letras, números, "_" ou "."';

/** Valida o responsável de quem é menor de idade: tem que ser outra pessoa, com e-mail próprio. */
function conferirResponsavel({ responsavelNome, responsavelEmail }, emailDoMenor) {
  const nome = String(responsavelNome ?? '').trim();
  const email = normalizarEmail(responsavelEmail);
  if (nome.length < 3) throw new Error('informe o nome completo do responsável');
  if (!emailValido(email)) throw new Error('informe um e-mail válido do responsável');
  if (email === normalizarEmail(emailDoMenor)) throw new Error('o e-mail do responsável precisa ser diferente do seu');
  return { nome, email };
}

export function criar({ nome, email, usuario, senha, nascimento, aceiteTermos, responsavelNome, responsavelEmail }) {
  const emailLimpo = normalizarEmail(email);
  const usuarioLimpo = normalizarUsuario(usuario);

  if (!String(nome ?? '').trim()) throw new Error('nome é obrigatório');
  if (!emailValido(emailLimpo)) throw new Error('informe um e-mail válido');
  if (!usuarioValido(usuarioLimpo)) throw new Error(MSG_USUARIO);
  if (apelidoProibido(usuarioLimpo)) throw new Error(MSG_APELIDO_PROIBIDO);

  if (!nascimentoValido(nascimento)) throw new Error('informe sua data de nascimento');
  if (!idadeMinimaAtingida(nascimento)) {
    throw new Error(`o ValtaTCG é para maiores de ${config.idade.minima} anos`);
  }
  if (aceiteTermos !== true && aceiteTermos !== 'on' && aceiteTermos !== 'true') {
    throw new Error('é preciso aceitar os Termos de Uso e a Política de Privacidade');
  }

  const exigeResponsavel = config.responsavel.obrigatorio && faixaEtaria(nascimento) === 'menor';
  const responsavel = exigeResponsavel ? conferirResponsavel({ responsavelNome, responsavelEmail }, emailLimpo) : null;

  const problema = validarSenha(senha);
  if (problema) throw new Error(problema);

  if (buscarPorEmail(emailLimpo)) throw new Error('este e-mail já está cadastrado');
  if (buscarPorUsuario(usuarioLimpo)) throw new Error('este nome de usuário já está em uso');

  const { hash, salt } = gerarHash(senha);
  const info = db.prepare(
    `INSERT INTO usuarios
       (nome, email, usuario, senha_hash, senha_salt, nascimento, aceite_termos_em,
        responsavel_nome, responsavel_email, responsavel_status)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?)`,
  ).run(
    String(nome).trim(), emailLimpo, usuarioLimpo, hash, salt, nascimento,
    responsavel?.nome ?? null, responsavel?.email ?? null, responsavel ? 'pendente' : null,
  );

  return semSegredos(buscarPorId(info.lastInsertRowid));
}

/**
 * Conta de antes do campo de nascimento existir: informa a data uma vez só.
 * Depois disso, só o admin muda — senão um menor poderia "virar adulto" editando o perfil.
 */
export function informarNascimento(usuarioId, { nascimento, responsavelNome, responsavelEmail }) {
  const alvo = buscarPorId(usuarioId);
  if (!alvo) throw new Error('usuário não encontrado');
  if (alvo.nascimento) throw new Error('a data de nascimento já foi informada — para corrigir, fale com o suporte');
  if (!nascimentoValido(nascimento)) throw new Error('informe uma data de nascimento válida');
  if (!idadeMinimaAtingida(nascimento)) throw new Error(`o ValtaTCG é para maiores de ${config.idade.minima} anos`);

  const exigeResponsavel = config.responsavel.obrigatorio && faixaEtaria(nascimento) === 'menor';
  const responsavel = exigeResponsavel ? conferirResponsavel({ responsavelNome, responsavelEmail }, alvo.email) : null;

  db.prepare(
    'UPDATE usuarios SET nascimento = ?, responsavel_nome = ?, responsavel_email = ?, responsavel_status = ? WHERE id = ?',
  ).run(nascimento, responsavel?.nome ?? null, responsavel?.email ?? null, responsavel ? 'pendente' : null, Number(usuarioId));
  return semSegredos(buscarPorId(usuarioId));
}

/* ------------------------------------------------------------------ */
/* Responsável (menores de 18)                                         */
/* ------------------------------------------------------------------ */

const hashDoTokenResponsavel = (token) => createHash('sha256').update(token).digest('hex');

/**
 * Gera um link novo para o responsável (o anterior deixa de valer) e conta o envio.
 * Quem manda o e-mail é a rota — aqui só o token, que não fica guardado em claro.
 */
export function prepararConfirmacaoResponsavel(usuarioId) {
  const alvo = buscarPorId(usuarioId);
  if (!alvo) throw new Error('usuário não encontrado');
  if (alvo.responsavel_status !== 'pendente') throw new Error('não há confirmação de responsável pendente');

  const hoje = new Date().toISOString().slice(0, 10);
  const enviosHoje = alvo.responsavel_envios_data === hoje ? alvo.responsavel_envios : 0;
  if (enviosHoje >= config.responsavel.reenviosPorDia) {
    throw new Error('limite de envios do dia atingido — tente amanhã ou fale com o suporte');
  }

  const token = randomBytes(32).toString('hex');
  db.prepare(
    `UPDATE usuarios SET responsavel_token_hash = ?, responsavel_token_expira_em = datetime('now', ?),
        responsavel_envios = ?, responsavel_envios_data = ? WHERE id = ?`,
  ).run(hashDoTokenResponsavel(token), `+${config.responsavel.validadeHoras} hours`, enviosHoje + 1, hoje, Number(usuarioId));

  return { token, responsavelNome: alvo.responsavel_nome, responsavelEmail: alvo.responsavel_email, nomeDoMenor: alvo.nome };
}

/** Dados mínimos para a tela de confirmação mostrar a quem o responsável está autorizando. */
export function consultarTokenResponsavel(token) {
  if (!token) return null;
  const linha = db.prepare(
    `SELECT nome, responsavel_nome FROM usuarios
        WHERE responsavel_token_hash = ? AND responsavel_status = 'pendente'
          AND responsavel_token_expira_em > datetime('now')`,
  ).get(hashDoTokenResponsavel(String(token)));
  return linha ? { nomeDoMenor: linha.nome, responsavelNome: linha.responsavel_nome } : null;
}

export function confirmarResponsavelPorToken(token) {
  if (!token) throw new Error('link inválido');
  const linha = db.prepare(
    `SELECT id FROM usuarios
        WHERE responsavel_token_hash = ? AND responsavel_status = 'pendente'
          AND responsavel_token_expira_em > datetime('now')`,
  ).get(hashDoTokenResponsavel(String(token)));
  if (!linha) throw new Error('este link não é mais válido — peça um novo na conta do menor');

  db.prepare(
    `UPDATE usuarios SET responsavel_status = 'confirmado', responsavel_confirmado_em = datetime('now'),
        responsavel_token_hash = NULL, responsavel_token_expira_em = NULL WHERE id = ?`,
  ).run(linha.id);
  return semSegredos(buscarPorId(linha.id));
}

/** Escape do admin enquanto o e-mail não estiver configurado, ou quando o responsável não consegue abrir o link. */
export function confirmarResponsavelManual(usuarioId) {
  const alvo = buscarPorId(usuarioId);
  if (!alvo) throw new Error('usuário não encontrado');
  if (!alvo.responsavel_status) throw new Error('esta conta não tem responsável a confirmar');
  db.prepare(
    `UPDATE usuarios SET responsavel_status = 'confirmado', responsavel_confirmado_em = datetime('now'),
        responsavel_token_hash = NULL, responsavel_token_expira_em = NULL WHERE id = ?`,
  ).run(Number(usuarioId));
  return semSegredos(buscarPorId(usuarioId));
}

/* ------------------------------------------------------------------ */
/* Suspensão                                                           */
/* ------------------------------------------------------------------ */

export function suspender(usuarioId, motivo = null) {
  const alvo = buscarPorId(usuarioId);
  if (!alvo) throw new Error('usuário não encontrado');
  if (alvo.admin) throw new Error('não dá para suspender um administrador');
  db.prepare('UPDATE usuarios SET suspenso = 1, motivo_suspensao = ? WHERE id = ?').run(motivo, Number(usuarioId));
  db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(Number(usuarioId));
  return semSegredos(buscarPorId(usuarioId));
}

export function reativar(usuarioId) {
  db.prepare('UPDATE usuarios SET suspenso = 0, motivo_suspensao = NULL WHERE id = ?').run(Number(usuarioId));
  return semSegredos(buscarPorId(usuarioId));
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

export function atualizarPerfil(usuarioId, { nome, email, usuario } = {}) {
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

  if (usuario !== undefined) {
    const novo = normalizarUsuario(usuario);
    if (!usuarioValido(novo)) {
      throw new Error(MSG_USUARIO);
    }
    if (apelidoProibido(novo)) throw new Error(MSG_APELIDO_PROIBIDO);
    const jaUsado = buscarPorUsuario(novo);
    if (jaUsado && jaUsado.id !== alvo.id) throw new Error('este nome de usuário já está em uso');
    sets.push('usuario = ?');
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

/**
 * Confere identificador (e-mail OU nome de usuário) + senha.
 * Retorna o usuário (sem segredos) ou null.
 */
export function autenticar(identificador, senha) {
  const bruto = String(identificador ?? '').trim();
  // "_" e "." (permitidos no usuário) nunca aparecem sozinhos num e-mail sem
  // "@" — então "tem @" basta para decidir qual busca usar, sem ambiguidade.
  const usuario = bruto.includes('@') ? buscarPorEmail(bruto) : buscarPorUsuario(bruto);
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
  if (!usuario || usuario.suspenso) return null;

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
    SELECT u.id, u.nome, u.email, u.usuario, u.admin, u.criado_em,
           u.nascimento, u.responsavel_nome, u.responsavel_email, u.responsavel_status, u.suspenso,
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
  // O administrador vê dados e conversas de menores: só um adulto, que informou a idade, pode ter esse acesso.
  if (valor && faixaEtaria(alvo.nascimento) !== 'adulto') {
    throw new Error('só contas de maiores de 18 anos, com data de nascimento informada, podem ser administradoras');
  }
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
