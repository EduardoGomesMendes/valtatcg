import { config } from '../config.js';
import { criarLog } from '../logger.js';
import { enviarEmail, emailPronto } from '../email/enviador.js';
import { emailLojaParaRevisar, emailDecisaoDaLoja } from '../email/modelos.js';
import * as usuarios from '../auth/usuarios.repo.js';

const log = criarLog('lojas');

/*
  Avisos por e-mail. Nunca derrubam a ação que os causou: o cadastro da loja vale mesmo sem SMTP.
  O aviso garantido é o do painel (faixa fixa no topo para o administrador, lista ordenada pelo prazo);
  o e-mail é o reforço para quem não está com o sistema aberto.
*/

/** Loja nova ou alterada: avisa todos os administradores. */
export async function avisarAdminsDaLoja(loja, { alteracao = false } = {}) {
  const destinos = usuarios.emailsDosAdmins();
  if (!emailPronto() || !destinos.length) {
    log.warn(`loja ${loja.id} aguarda aprovação; e-mail ao administrador não enviado (sem SMTP ou sem administrador com e-mail) — o aviso fica no painel`);
    return { enviados: 0 };
  }
  // O endereço vem da configuração, nunca do cabeçalho da requisição.
  const modelo = emailLojaParaRevisar({
    nomeDaLoja: loja.nome, cidade: loja.cidade, uf: loja.uf, prazoEm: loja.prazo_revisao_em,
    link: `${config.urlPublica}/admin-lojas/`, alteracao,
  });
  let enviados = 0;
  for (const para of destinos) {
    try {
      await enviarEmail({ para, ...modelo });
      enviados += 1;
    } catch (erro) {
      log.warn(`aviso da loja ${loja.id} não chegou a um administrador: ${erro.message}`);
    }
  }
  return { enviados };
}

/** Aprovou ou recusou: o dono precisa saber sem ter que ficar abrindo a página. */
export async function avisarDonoDaDecisao(loja, dono) {
  if (!emailPronto() || !dono?.email || !['ativa', 'recusada'].includes(loja.status)) return { enviado: false };
  try {
    await enviarEmail({
      para: dono.email,
      ...emailDecisaoDaLoja({
        nomeDaLoja: loja.nome, aprovada: loja.status === 'ativa', motivo: loja.motivo_status,
        preco: config.lojas.precoMensal, link: `${config.urlPublica}/minha-loja/`,
      }),
    });
    return { enviado: true };
  } catch (erro) {
    log.warn(`decisão da loja ${loja.id} não chegou ao dono: ${erro.message}`);
    return { enviado: false };
  }
}
