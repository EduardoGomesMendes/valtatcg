import { createHash, randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { criarLog } from '../logger.js';
import * as repo from './redefinicoes.repo.js';
import * as usuarios from './usuarios.repo.js';
import { enviarEmail, emailPronto } from '../email/enviador.js';
import { emailRedefinirSenha, emailSenhaAlterada } from '../email/modelos.js';

const log = criarLog('senha');

/*
  "Esqueci minha senha".

  A tela NUNCA diz se o e-mail tem conta: dizer entregaria, a quem digitasse, a lista de usuários. A resposta
  é a mesma, no mesmo tempo (o envio roda em segundo plano), exista a conta ou não. O link vai SÓ para o
  e-mail da conta, vale pouco tempo e uma vez só, e a troca derruba todas as sessões abertas dessa conta.
*/

export class ErroDeRedefinicao extends Error {
  constructor(mensagem, status = 400) {
    super(mensagem);
    this.status = status;
  }
}

const agoraUtc = (deslocamentoMs = 0) => new Date(Date.now() + deslocamentoMs).toISOString().replace('T', ' ').slice(0, 19);
const hashDoToken = (token) => createHash('sha256').update(String(token)).digest('hex');

/** Só funciona se dá para entregar o e-mail com o link; senão a tela manda falar com o suporte. */
export function redefinicaoAberta() {
  return emailPronto() && Boolean(config.urlPublica);
}

function conferirLimites(email, ip) {
  if (repo.pedidosDoIp(ip, agoraUtc(-3_600_000)) >= config.redefinicao.pedidosPorIpPorHora) {
    throw new ErroDeRedefinicao('Muitos pedidos deste computador. Tente de novo mais tarde.', 429);
  }
  if (repo.pedidosDoEmail(email, agoraUtc(-86_400_000)) >= config.redefinicao.pedidosPorEmailPorDia) {
    throw new ErroDeRedefinicao('Já enviamos e-mails para este endereço hoje. Confira a caixa de entrada e o spam, ou tente de novo amanhã.', 429);
  }
}

/**
 * Recebe o pedido. Devolve sempre { ok: true } — exceto quando o limite estoura (vale para qualquer e-mail,
 * existente ou não) ou o texto nem tem formato de e-mail.
 */
export async function solicitar({ email, ip }) {
  if (!redefinicaoAberta()) {
    throw new ErroDeRedefinicao('A redefinição por e-mail ainda não está disponível. Fale com o suporte para gerar uma senha nova.', 503);
  }
  const endereco = usuarios.normalizarEmail(email);
  if (!usuarios.emailValido(endereco) || endereco.length > 120) throw new ErroDeRedefinicao('Informe o e-mail da sua conta.');

  conferirLimites(endereco, ip);
  repo.limparAntigos();

  const usuario = usuarios.buscarPorEmail(endereco);
  if (!usuario || usuario.suspenso) {
    // Sem conta (ou conta suspensa): registra o pedido para os limites valerem igual e não faz mais nada.
    repo.criar({ email: endereco, ip, expiraEm: agoraUtc() });
    log.info('pedido de nova senha para e-mail sem conta ativa');
    return { ok: true };
  }

  const token = randomBytes(32).toString('base64url');
  repo.invalidarAbertosDoUsuario(usuario.id);
  repo.criar({
    usuarioId: usuario.id,
    tokenHash: hashDoToken(token),
    email: endereco,
    ip,
    expiraEm: agoraUtc(config.redefinicao.validadeMinutos * 60_000),
  });

  const link = `${config.urlPublica}/redefinir-senha/?t=${token}`;
  // Sem SMTP de verdade (desenvolvimento), o link precisa aparecer em algum lugar para o fluxo ser testável.
  if (config.email.modo === 'console') log.info(`[modo console] link para nova senha: ${link}`);
  // Em segundo plano, de propósito: esperar o SMTP faria o pedido de e-mail existente demorar mais que o de
  // e-mail inexistente, e o tempo de resposta revelaria quem tem conta.
  enviarEmail({
    para: usuario.email,
    ...emailRedefinirSenha({ nome: usuario.nome, link, validadeMinutos: config.redefinicao.validadeMinutos }),
  }).catch((erro) => log.warn(`não consegui enviar o e-mail de nova senha (usuário #${usuario.id}): ${erro.message}`));

  log.info(`pedido de nova senha: usuário #${usuario.id}`);
  return { ok: true };
}

/**
 * O que a página do link mostra. Só LÊ: programas de e-mail abrem links sozinhos para checar se são
 * seguros, e isso não pode gastar o link.
 */
export function consultar(token) {
  const texto = String(token ?? '');
  if (texto.length < 20 || texto.length > 100) return { estado: 'invalido' };
  const linha = repo.buscarPorTokenHash(hashDoToken(texto));
  if (!linha) return { estado: 'invalido' };
  if (linha.usado_em) return { estado: 'usado' };
  if (linha.expira_em <= agoraUtc()) return { estado: 'expirado' };
  return { estado: 'valido', email: linha.email };
}

/** Troca a senha. A pessoa volta para o login: digitar a senha nova uma vez confirma que ela a guardou. */
export function concluir({ token, senha }) {
  const situacao = consultar(token);
  if (situacao.estado === 'invalido') throw new ErroDeRedefinicao('Este link não é válido. Peça um novo na tela de entrada.', 404);
  if (situacao.estado === 'usado') throw new ErroDeRedefinicao('Este link já foi usado. Se precisar, peça um novo.', 410);
  if (situacao.estado === 'expirado') throw new ErroDeRedefinicao('Este link venceu. Peça um novo.', 410);

  const problema = usuarios.validarSenha(senha);
  if (problema) throw new ErroDeRedefinicao(problema);

  const linha = repo.buscarPorTokenHash(hashDoToken(token));
  const usuario = usuarios.buscarPorId(linha.usuario_id);
  if (!usuario || usuario.suspenso) throw new ErroDeRedefinicao('Esta conta não está ativa. Fale com o suporte.', 403);

  if (!repo.reivindicar(linha.id)) throw new ErroDeRedefinicao('Este link já foi usado. Se precisar, peça um novo.', 410);

  try {
    usuarios.definirSenha(usuario.id, senha);
  } catch (erro) {
    repo.liberar(linha.id);
    log.error(`não consegui trocar a senha do usuário #${usuario.id}: ${erro.message}`);
    throw new ErroDeRedefinicao(erro.message);
  }
  // Quem estava logado com a senha antiga (ou quem a tinha descoberto) cai agora.
  usuarios.encerrarSessoesDoUsuario(usuario.id);
  repo.invalidarAbertosDoUsuario(usuario.id);
  log.info(`senha redefinida pelo e-mail: usuário #${usuario.id}`);

  enviarEmail({
    para: usuario.email,
    ...emailSenhaAlterada({ nome: usuario.nome, linkEsqueci: `${config.urlPublica}/esqueci-senha/` }),
  }).catch((erro) => log.warn(`não consegui avisar da troca de senha (usuário #${usuario.id}): ${erro.message}`));

  return { ok: true };
}
