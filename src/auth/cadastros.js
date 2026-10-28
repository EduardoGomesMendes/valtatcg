import { createHash, randomBytes } from 'node:crypto';
import dns from 'node:dns/promises';
import { config } from '../config.js';
import { criarLog } from '../logger.js';
import * as repo from './cadastros.repo.js';
import * as usuarios from './usuarios.repo.js';
import * as assinaturas from '../assinaturas/assinaturas.repo.js';
import { enviarConfirmacaoResponsavel } from '../seguranca/responsavel.js';
import { enviarEmail, emailPronto } from '../email/enviador.js';
import { emailConfirmacaoDeCadastro, emailJaTemCadastro } from '../email/modelos.js';

const log = criarLog('cadastro');

/*
  Cadastro público.

  O princípio: NADA é criado antes de a pessoa provar que o e-mail é dela. O pedido vira uma linha que
  expira; só quando ela abre o link do e-mail e escolhe a senha é que nasce a conta (e os dias de teste).
  Assim, quem digita o e-mail de outra pessoa não cria conta nenhuma, e a lista de usuários só tem gente
  que quis mesmo entrar.
*/

export class ErroDeCadastro extends Error {
  constructor(mensagem, status = 400) {
    super(mensagem);
    this.status = status;
  }
}

/** Serviços de e-mail descartável: quem os usa não quer ser encontrado depois (e o fórum precisa de gente identificável). */
const DOMINIOS_DESCARTAVEIS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com', 'yopmail.com', 'yopmail.fr',
  'tempmail.com', 'temp-mail.org', '10minutemail.com', 'trashmail.com', 'getnada.com', 'dispostable.com',
  'maildrop.cc', 'fakeinbox.com', 'throwawaymail.com', 'mohmal.com', 'emailondeck.com', 'burnermail.io',
  'moakt.com', 'tempail.com', 'mailnesia.com', 'mytemp.email', 'spamgourmet.com', 'discard.email',
  'mailcatch.com', 'inboxkitten.com', 'tempinbox.com', 'mintemail.com',
]);

const agoraUtc = (deslocamentoMs = 0) => new Date(Date.now() + deslocamentoMs).toISOString().replace('T', ' ').slice(0, 19);
const hashDoToken = (token) => createHash('sha256').update(String(token)).digest('hex');

/** O cadastro público só abre quando dá para entregar o e-mail de confirmação. */
export function cadastroAberto() {
  return emailPronto() && Boolean(config.urlPublica);
}

/** Confere o que veio do formulário. Qualquer problema vira uma mensagem para a pessoa corrigir. */
function validarPedido(dados) {
  let conferido;
  try {
    conferido = usuarios.conferirDadosDoCadastro(dados ?? {});
  } catch (erro) {
    throw new ErroDeCadastro(erro.message);
  }
  const { emailLimpo, usuarioLimpo, responsavel } = conferido;
  if (emailLimpo.length > 120) throw new ErroDeCadastro('informe um e-mail válido');
  if (DOMINIOS_DESCARTAVEIS.has(emailLimpo.split('@')[1])) {
    throw new ErroDeCadastro('e-mails temporários não são aceitos — use um e-mail fixo seu');
  }
  const nome = String(dados.nome).replace(/\s+/g, ' ').trim().slice(0, 80);
  return { nome, usuario: usuarioLimpo, email: emailLimpo, nascimento: dados.nascimento, responsavel };
}

/** O domínio do e-mail existe? Pega "gmial.com" e afins. Falha de rede NÃO barra ninguém. */
async function dominioExiste(email) {
  const dominio = email.split('@')[1];
  const comPrazo = (promessa) => Promise.race([promessa, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('tempo'), { code: 'ETIMEOUT' })), 4000))]);
  try {
    return (await comPrazo(dns.resolveMx(dominio))).length > 0;
  } catch (erro) {
    if (!['ENOTFOUND', 'ENODATA'].includes(erro.code)) return true; // DNS fora do ar: melhor deixar passar
    try {
      await comPrazo(dns.resolve4(dominio)); // sem MX, o e-mail ainda pode ir para o endereço do próprio domínio
      return true;
    } catch (e2) {
      return !['ENOTFOUND', 'ENODATA'].includes(e2.code);
    }
  }
}

function conferirLimites(email, ip) {
  if (repo.enviosDoIp(ip, agoraUtc(-3_600_000)) >= config.cadastro.pedidosPorIpPorHora) {
    throw new ErroDeCadastro('Muitos pedidos deste computador. Tente de novo mais tarde.', 429);
  }
  if (repo.enviosDoEmail(email, agoraUtc(-86_400_000)) >= config.cadastro.enviosPorEmailPorDia) {
    throw new ErroDeCadastro('Já enviamos e-mails para este endereço hoje. Confira a caixa de entrada e o spam, ou tente de novo amanhã.', 429);
  }
}

function novoToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashDoToken(token), expiraEm: agoraUtc(config.cadastro.validadeHoras * 3_600_000) };
}

const linkDe = (token) => `${config.urlPublica}/confirmar/?t=${token}`;

async function enviar(mensagem, para, link) {
  // Sem SMTP de verdade (desenvolvimento), o link precisa aparecer em algum lugar para o cadastro ser testável.
  if (config.email.modo === 'console' && link) log.info(`[modo console] link de confirmação: ${link}`);
  try {
    await enviarEmail({ para, ...mensagem });
  } catch {
    throw new ErroDeCadastro('Não consegui enviar o e-mail agora. Tente de novo em alguns minutos.', 502);
  }
}

/**
 * Recebe o pedido. A resposta é a MESMA haja ou não cadastro para o e-mail ("enviamos um e-mail"):
 * dizer "esse e-mail já existe" na tela entregaria a lista de quem é usuário. Quem já tem conta recebe
 * um e-mail avisando.
 */
export async function solicitar({ dados, ip }) {
  if (!cadastroAberto()) throw new ErroDeCadastro('O cadastro online ainda não está disponível. Tente de novo mais tarde.', 503);

  const v = validarPedido(dados);
  if (config.cadastro.checarDominio && !(await dominioExiste(v.email))) {
    throw new ErroDeCadastro('Não encontramos o domínio deste e-mail. Confira se digitou certo.');
  }
  conferirLimites(v.email, ip);
  repo.limparAntigos();

  const existente = usuarios.buscarPorEmail(v.email);
  if (existente) {
    repo.registrarEnvio({ email: v.email, ip, tipo: 'ja_cadastrado' });
    await enviar(emailJaTemCadastro({ nome: existente.nome, linkEntrar: `${config.urlPublica}/entrar/` }), v.email);
    log.info('pedido de cadastro para e-mail que já tem conta');
    return { ok: true };
  }

  // O nome de usuário aparece para todos no fórum, então dizer que está em uso não revela nada privado.
  if (usuarios.usuarioEmUso(v.usuario) || repo.usuarioReservado(v.usuario, v.email)) {
    throw new ErroDeCadastro('este nome de usuário já está em uso — escolha outro');
  }

  const { token, hash, expiraEm } = novoToken();
  const aberto = repo.pendenteAberto(v.email);
  if (aberto) repo.renovar(aberto.id, { tokenHash: hash, ...v, ip, expiraEm });
  else repo.criar({ tokenHash: hash, ...v, ip, expiraEm });
  repo.registrarEnvio({ email: v.email, ip, tipo: aberto ? 'reenvio' : 'confirmacao' });

  const link = linkDe(token);
  await enviar(emailConfirmacaoDeCadastro({ nome: v.nome, link, validadeHoras: config.cadastro.validadeHoras }), v.email, link);
  log.info(`pedido de cadastro recebido (${aberto ? 'reenvio' : 'novo'})`);
  return { ok: true };
}

/** "Não chegou": manda um link novo (o anterior para de valer). Mesma resposta haja ou não pedido. */
export async function reenviar({ email, ip }) {
  if (!cadastroAberto()) throw new ErroDeCadastro('O cadastro online ainda não está disponível.', 503);
  const endereco = usuarios.normalizarEmail(email);
  if (!usuarios.emailValido(endereco)) throw new ErroDeCadastro('Informe o e-mail usado no cadastro.');
  conferirLimites(endereco, ip);

  const aberto = repo.pendenteAberto(endereco);
  if (!aberto) return { ok: true };

  const { token, hash, expiraEm } = novoToken();
  repo.trocarLink(aberto.id, { tokenHash: hash, ip, expiraEm });
  repo.registrarEnvio({ email: endereco, ip, tipo: 'reenvio' });
  const link = linkDe(token);
  await enviar(emailConfirmacaoDeCadastro({ nome: aberto.nome, link, validadeHoras: config.cadastro.validadeHoras }), endereco, link);
  return { ok: true };
}

/**
 * O que a página do link mostra. Só LÊ: programas de e-mail abrem links sozinhos para checar se são
 * seguros, e isso não pode "gastar" o link nem criar a conta.
 */
export function consultar(token) {
  const texto = String(token ?? '');
  if (texto.length < 20 || texto.length > 100) return { estado: 'invalido' };
  const linha = repo.buscarPorTokenHash(hashDoToken(texto));
  if (!linha) return { estado: 'invalido' };
  if (linha.confirmado_em) return { estado: 'usado' };
  if (linha.expira_em <= agoraUtc()) return { estado: 'expirado', email: linha.email };
  return { estado: 'valido', nome: linha.nome, usuario: linha.usuario, email: linha.email };
}

/**
 * Confirma o e-mail e cria a conta com a senha escolhida. Devolve o usuário para a rota abrir a sessão.
 * @returns {Promise<{usuario: object, responsavel: object|null}>}
 */
export async function concluir({ token, senha }) {
  const situacao = consultar(token);
  if (situacao.estado === 'invalido') throw new ErroDeCadastro('Este link não é válido. Faça o cadastro de novo.', 404);
  if (situacao.estado === 'usado') throw new ErroDeCadastro('Este link já foi usado. Entre com o seu e-mail e a sua senha.', 410);
  if (situacao.estado === 'expirado') throw new ErroDeCadastro('Este link venceu. Faça o cadastro de novo para receber outro.', 410);

  const problema = usuarios.validarSenha(senha);
  if (problema) throw new ErroDeCadastro(problema);

  const linha = repo.buscarPorTokenHash(hashDoToken(token));
  if (usuarios.buscarPorEmail(linha.email)) throw new ErroDeCadastro('Este e-mail já tem cadastro. Entre com a sua senha.', 409);
  if (!repo.reivindicar(linha.id)) throw new ErroDeCadastro('Este link já foi usado. Entre com o seu e-mail e a sua senha.', 410);

  let usuario;
  try {
    usuario = usuarios.criar({
      nome: linha.nome,
      email: linha.email,
      usuario: linha.usuario,
      senha,
      nascimento: linha.nascimento,
      aceiteTermos: true,
      aceiteTermosEm: linha.aceite_termos_em,
      responsavelNome: linha.responsavel_nome,
      responsavelEmail: linha.responsavel_email,
    });
  } catch (erro) {
    repo.liberar(linha.id);
    log.error(`não consegui criar a conta do cadastro ${linha.id}: ${erro.message}`);
    // O nome pode ter sido tomado por outra conta entre o pedido e o clique no link.
    throw new ErroDeCadastro(erro.message, /nome de usuário já está em uso/.test(erro.message) ? 409 : 400);
  }
  assinaturas.iniciarTeste(usuario.id);
  repo.vincularUsuario(linha.id, usuario.id);

  let responsavel = null;
  if (usuario.responsavel_status === 'pendente') {
    try {
      responsavel = await enviarConfirmacaoResponsavel(usuario.id);
    } catch (erro) {
      log.warn(`não consegui mandar a confirmação do responsável: ${erro.message}`);
    }
  }
  log.info(`conta criada pelo link do e-mail: usuário #${usuario.id}`);
  return { usuario, responsavel };
}
