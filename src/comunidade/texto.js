/*
  Regras de texto escrito por usuários (fórum e eventos).

  O ValtaTCG tem menores de idade, então a conversa fica DENTRO da plataforma:
  nada de link, e-mail ou telefone no texto. Isto não pega todo truque ("w w w ponto..."),
  mas barra o comum e deixa claro o que se espera; o resto é denúncia e moderação.
*/

const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|br|io|gg|me|ly|app|xyz|gl|tv)\b)/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const TELEFONE = /(?:\d[\s().-]*){10,}/;

export const AVISO_CONTATO = 'não coloque links, e-mails ou telefones no texto — por segurança, a conversa fica aqui dentro';

/**
 * @returns {string} o texto limpo (espaços, quebras e caracteres de controle normalizados)
 * @throws {Error} com mensagem pronta para mostrar na tela
 */
export function validarTexto(valor, { campo, min, max }) {
  const texto = String(valor ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (texto.length < min) throw new Error(`${campo}: escreva pelo menos ${min} caracteres`);
  if (texto.length > max) throw new Error(`${campo}: no máximo ${max} caracteres`);
  if (LINK.test(texto) || EMAIL.test(texto) || TELEFONE.test(texto)) throw new Error(`${campo}: ${AVISO_CONTATO}`);
  return texto;
}

/** Nome que aparece para os outros: o nome de usuário, ou só o primeiro nome. Nunca o nome completo. */
export function nomePublico({ usuario, nome }) {
  if (usuario) return usuario;
  return String(nome ?? '').trim().split(/\s+/)[0] || 'membro';
}
