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

  idade: {
    // Abaixo disto não cadastramos (dados de criança exigem consentimento específico, LGPD art. 14).
    minima: num(process.env.IDADE_MINIMA, 13),
    // Menores de 18 só usam a conta com um responsável confirmado e ficam fora de venda, lance e mensagem.
    maioridade: num(process.env.IDADE_MAIORIDADE, 18),
  },

  responsavel: {
    // false (padrão): o cadastro NÃO pede responsável e nada bloqueia menor de 18. A data de nascimento
    // continua obrigatória e é ela que controla o fórum. Ligue (RESPONSAVEL_OBRIGATORIO=sim) quando a
    // segurança for configurada: aí menor só grava com o responsável confirmado, como na fase 0.
    obrigatorio: bool(process.env.RESPONSAVEL_OBRIGATORIO, false),
    // Validade do link que o responsável recebe por e-mail.
    validadeHoras: num(process.env.RESPONSAVEL_VALIDADE_HORAS, 168),
    // Limite de reenvios por conta por dia (o e-mail é de um terceiro: não pode virar spam).
    reenviosPorDia: num(process.env.RESPONSAVEL_REENVIOS_DIA, 3),
  },

  // Endereço público: é de onde saem os links dos e-mails. NUNCA vem do cabeçalho da requisição.
  urlPublica: (process.env.URL_PUBLICA || 'https://valtatcg.com.br').replace(/\/+$/, ''),

  email: {
    host: process.env.SMTP_HOST || '',
    porta: num(process.env.SMTP_PORT, 465),
    seguro: bool(process.env.SMTP_SEGURO, num(process.env.SMTP_PORT, 465) === 465),
    usuario: process.env.SMTP_USER || '',
    senha: process.env.SMTP_PASS || '',
    remetente: process.env.EMAIL_REMETENTE || '',
    // smtp (padrão quando há SMTP_HOST) | console (só escreve no log) | memoria (testes) | desligado
    modo: (process.env.EMAIL_MODO || (process.env.SMTP_HOST ? 'smtp' : 'desligado')).toLowerCase(),
  },

  forum: {
    // Menores de 18 (13 a 17) podem escrever no fórum? Com "nao", só leem. Quem não informou a data de
    // nascimento nunca escreve: sem a data não dá para saber a regra que vale.
    menoresEscrevem: bool(process.env.FORUM_MENORES_ESCREVEM, true),
  },

  lojas: {
    // Mensalidade da loja: cadastro atualizado no diretório + marca (logo e link do site) em destaque.
    // 0 fecha o botão de assinar (ex.: para negociar um valor à parte).
    precoMensal: num(process.env.PRECO_LOJA_MENSAL, 49.77),
    // Prazo que a loja ouve de nós para o administrador liberar o cadastro.
    prazoRevisaoHoras: num(process.env.LOJA_PRAZO_REVISAO_HORAS, 48),
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
