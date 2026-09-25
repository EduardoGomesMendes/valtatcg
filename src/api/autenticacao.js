import { config } from '../config.js';
import { usuarioDaSessao } from '../auth/usuarios.repo.js';
import { estadoDoUsuario } from '../assinaturas/assinaturas.repo.js';

export const NOME_COOKIE = 'valtatcg_sessao';

/** Lê um cookie do cabeçalho sem precisar de biblioteca. */
export function lerCookie(req, nome) {
  const bruto = req.headers.cookie;
  if (!bruto) return null;
  for (const parte of bruto.split(';')) {
    const [chave, ...resto] = parte.trim().split('=');
    if (chave === nome) return decodeURIComponent(resto.join('='));
  }
  return null;
}

/**
 * Grava o cookie da sessão.
 *
 * SEM Max-Age e SEM Expires de propósito: assim ele é um "cookie de sessão",
 * que o navegador apaga ao fechar. Só isso não basta — ver usuarioDaSessao()
 * em auth/usuarios.repo.js, que é quem realmente garante o prazo.
 */
export function gravarCookieSessao(res, token) {
  const partes = [
    `${NOME_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
  ];
  if (config.servidor.https) partes.push('Secure');
  if (config.servidor.dominioCookie) partes.push(`Domain=${config.servidor.dominioCookie}`);
  res.setHeader('Set-Cookie', partes.join('; '));
}

export function apagarCookieSessao(res) {
  const partes = [`${NOME_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (config.servidor.dominioCookie) partes.push(`Domain=${config.servidor.dominioCookie}`);
  res.setHeader('Set-Cookie', partes.join('; '));
}

/** Popula req.usuario quando houver sessão válida. */
export function identificar(req, res, next) {
  req.token = lerCookie(req, NOME_COOKIE);
  req.usuario = req.token ? usuarioDaSessao(req.token) : null;
  next();
}

export function exigirLogin(req, res, next) {
  if (!req.usuario) return res.status(401).json({ erro: 'não autenticado' });
  next();
}

/** Usar sempre depois de exigirLogin — bloqueia quem não é administrador. */
export function exigirAdmin(req, res, next) {
  if (!req.usuario?.admin) return res.status(403).json({ erro: 'só administradores têm acesso' });
  next();
}

/**
 * Assinatura vencida: bloqueia as ESCRITAS, deixa a leitura passar.
 *
 * A pessoa continua entrando, vendo a própria coleção e conferindo o preço
 * das cartas — o que corta é adicionar/editar/remover até regularizar.
 * Sequestrar o dado para forçar pagamento gera atrito e problema de LGPD;
 * parar o serviço não.
 */
export function exigirAssinatura(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();

  // Precisam funcionar justamente quando está bloqueado.
  if (req.path.startsWith('/assinatura') || req.path.startsWith('/sair')) return next();

  // O admin não paga assinatura própria — ele é quem cobra, não quem é cobrado.
  if (req.usuario.admin) return next();

  const situacao = estadoDoUsuario(req.usuario.id);
  if (situacao.bloqueado) {
    return res.status(402).json({
      erro: situacao.motivo ?? 'assinatura inativa',
      bloqueado: true,
      assinatura: situacao,
    });
  }
  next();
}

/**
 * Freio contra força bruta no login: conta as tentativas falhas por
 * IP + e-mail. Em memória — reinicia junto com o processo, suficiente para
 * um app de uso pessoal.
 */
const tentativas = new Map();
const JANELA_MS = 15 * 60 * 1000;
const LIMITE = 8;

export function registrarFalhaDeLogin(chave) {
  const agora = Date.now();
  const atual = tentativas.get(chave) ?? { contagem: 0, desde: agora };
  if (agora - atual.desde > JANELA_MS) {
    atual.contagem = 0;
    atual.desde = agora;
  }
  atual.contagem += 1;
  tentativas.set(chave, atual);
}

export function loginBloqueado(chave) {
  const atual = tentativas.get(chave);
  if (!atual) return false;
  if (Date.now() - atual.desde > JANELA_MS) {
    tentativas.delete(chave);
    return false;
  }
  return atual.contagem >= LIMITE;
}

export function limparFalhas(chave) {
  tentativas.delete(chave);
}
