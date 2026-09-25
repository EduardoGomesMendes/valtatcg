import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function bool(valor, padrao) {
  if (valor === undefined || valor === '') return padrao;
  return ['1', 'true', 'sim', 'yes', 'on'].includes(String(valor).toLowerCase());
}

function num(valor, padrao) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : padrao;
}

export const config = {
  raiz,
  pastaDados: process.env.DATA_DIR || path.join(raiz, 'data'),

  servidor: {
    porta: num(process.env.PORT, 3300),
    // true quando o painel estiver atrás de HTTPS (marca o cookie como Secure).
    https: bool(process.env.HTTPS, false),
    // Vazio (padrão) = cookie preso ao host que respondeu, o mais seguro.
    dominioCookie: process.env.COOKIE_DOMAIN || '',
  },

  sessao: {
    // Minutos sem nenhuma requisição até a sessão morrer no servidor.
    inatividadeMinutos: num(process.env.SESSAO_INATIVIDADE_MIN, 30),
    // Teto absoluto, contado da hora do login.
    duracaoHoras: num(process.env.SESSAO_HORAS, 12),
  },

  pokemontcg: {
    // Vazio funciona (limite de requisições menor). Cadastro em pokemontcg.io.
    chave: process.env.POKEMONTCG_API_KEY || '',
  },

  assinatura: {
    // Dias de uso grátis desde o cadastro, antes de exigir pagamento.
    diasDeTeste: num(process.env.DIAS_DE_TESTE, 7),
    // Plano único — sem isto o valtatcg não teria como cobrar ninguém.
    precoMensal: num(process.env.PRECO_MENSAL, 9.97),
  },

  pagamento: {
    provedor: (process.env.PAGAMENTO_PROVIDER || 'asaas').toLowerCase(),
    chave: process.env.ASAAS_API_KEY || '',
    /*
      sandbox é o padrão de propósito: enquanto ninguém trocar isto de forma
      consciente, nenhum cliente real é cobrado. Sandbox e produção têm contas
      e chaves separadas — a chave de um não funciona no outro.
    */
    ambiente: (process.env.ASAAS_AMBIENTE || 'sandbox').toLowerCase() === 'producao' ? 'producao' : 'sandbox',
    /*
      Segredo combinado com o Asaas, enviado por ele no header
      `asaas-access-token` de cada notificação. NUNCA use a chave da API aqui:
      o token do webhook viaja para dentro do nosso servidor a cada evento, e
      quem o roubar não pode ganhar acesso à conta do Asaas junto.
    */
    tokenWebhook: process.env.ASAAS_WEBHOOK_TOKEN || '',
  },
};
