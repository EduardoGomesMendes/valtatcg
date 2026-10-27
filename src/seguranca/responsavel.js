import { config } from '../config.js';
import { criarLog } from '../logger.js';
import { enviarEmail, emailPronto } from '../email/enviador.js';
import { emailConfirmacaoResponsavel } from '../email/modelos.js';
import * as usuarios from '../auth/usuarios.repo.js';

const log = criarLog('responsavel');

/**
 * Manda ao responsável o link de confirmação.
 * Não lança erro por falta de e-mail configurado: o cadastro do menor segue e o admin
 * pode confirmar na mão. O limite diário de envios, esse sim, volta como erro.
 * @returns {Promise<{enviado: boolean, motivo?: string}>}
 */
export async function enviarConfirmacaoResponsavel(usuarioId) {
  const dados = usuarios.prepararConfirmacaoResponsavel(usuarioId);

  if (!emailPronto()) {
    log.warn(`e-mail não configurado: confirmação do responsável do usuário ${usuarioId} fica para o admin`);
    return { enviado: false, motivo: 'email-nao-configurado' };
  }

  // O endereço vem da configuração, nunca do cabeçalho da requisição (evita link falso).
  const link = `${config.urlPublica}/confirmar-responsavel/?token=${dados.token}`;
  const modelo = emailConfirmacaoResponsavel({
    responsavelNome: dados.responsavelNome,
    nomeDoMenor: dados.nomeDoMenor,
    link,
    validadeHoras: config.responsavel.validadeHoras,
  });

  try {
    await enviarEmail({ para: dados.responsavelEmail, ...modelo });
    return { enviado: true };
  } catch (erro) {
    log.warn(`não consegui enviar a confirmação do usuário ${usuarioId}: ${erro.message}`);
    return { enviado: false, motivo: 'falha-no-envio' };
  }
}
