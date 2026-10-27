import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { criarLog } from '../logger.js';

const log = criarLog('email');

export class ErroDeEmail extends Error {}

/** Em modo 'memoria' (testes) os e-mails ficam aqui em vez de sair. */
export const caixaDeSaida = [];

let transporte = null;

function obterTransporte() {
  if (!transporte) {
    const { host, porta, seguro, usuario, senha } = config.email;
    transporte = nodemailer.createTransport({
      host,
      port: porta,
      secure: seguro,
      auth: { user: usuario, pass: senha },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return transporte;
}

export function emailPronto() {
  const { modo, host, usuario, senha, remetente } = config.email;
  if (modo === 'console' || modo === 'memoria') return true;
  if (modo === 'smtp') return Boolean(host && usuario && senha && remetente);
  return false;
}

const mascarar = (e) => String(e).replace(/^(.)[^@]*(@.*)$/, '$1***$2');

/** Nunca registra a senha do SMTP nem o corpo da mensagem (que carrega o link de acesso). */
export async function enviarEmail({ para, assunto, texto, html }) {
  if (!emailPronto()) throw new ErroDeEmail('o envio de e-mail não está configurado');

  if (config.email.modo === 'memoria') {
    caixaDeSaida.push({ para, assunto, texto, html });
    return { id: `memoria-${caixaDeSaida.length}` };
  }
  if (config.email.modo === 'console') {
    log.info(`[e-mail simulado] para ${mascarar(para)} · ${assunto}`);
    return { id: 'console' };
  }

  try {
    const r = await obterTransporte().sendMail({ from: config.email.remetente, to: para, subject: assunto, text: texto, html });
    log.info(`e-mail enviado para ${mascarar(para)} · "${assunto}"`);
    return { id: r.messageId };
  } catch (erro) {
    log.error(`falha ao enviar e-mail para ${mascarar(para)}: ${erro.code ?? ''} ${erro.message}`.trim());
    throw new ErroDeEmail('não consegui enviar o e-mail agora');
  }
}
