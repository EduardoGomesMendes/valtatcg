import { db } from '../db/index.js';
import { config } from '../config.js';
import { UFS, semAcento } from './regioes.js';
import { apenasDigitos, documentoValido } from '../documento.js';
import { faixaEtaria } from '../seguranca/idade.js';
import { salvarLogo, removerLogo } from './logo.js';

const STATUS = ['pendente', 'ativa', 'recusada', 'suspensa'];
const POR_PAGINA = 24;

/* ------------------------------------------------------------------ */
/* Validação — tudo que a loja digita vira dado público, então é conferido aqui */
/* ------------------------------------------------------------------ */

function normalizarWhatsapp(bruto) {
  const d = apenasDigitos(bruto);
  if (!d) return null;
  const comPais = d.length <= 11 ? `55${d}` : d;
  if (comPais.length < 12 || comPais.length > 13) throw new Error('WhatsApp inválido — use DDD e número');
  return comPais;
}

function normalizarInstagram(bruto) {
  const t = String(bruto ?? '').trim();
  if (!t) return null;
  const usuario = t.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/\/+$/, '');
  if (!/^[A-Za-z0-9._]{1,30}$/.test(usuario)) throw new Error('Instagram inválido — informe só o @ da loja');
  return usuario;
}

function normalizarSite(bruto) {
  const t = String(bruto ?? '').trim();
  if (!t) return null;
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
  } catch {
    throw new Error('site inválido');
  }
  // Só http(s): "javascript:" ou "data:" num link público seria um ataque.
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('site inválido');
  if (url.href.length > 200) throw new Error('site muito longo');
  return url.href;
}

function validarDados(dados, { exigirCnpj }) {
  const nome = String(dados.nome ?? '').trim();
  if (nome.length < 3 || nome.length > 80) throw new Error('o nome da loja precisa ter de 3 a 80 caracteres');

  const uf = String(dados.uf ?? '').trim().toUpperCase();
  if (!UFS.includes(uf)) throw new Error('escolha o estado da loja');

  const cidade = String(dados.cidade ?? '').trim();
  if (cidade.length < 2 || cidade.length > 60) throw new Error('informe a cidade da loja');

  const descricao = String(dados.descricao ?? '').trim().slice(0, 500) || null;

  const limpo = {
    nome, uf, cidade, descricao,
    cidade_busca: semAcento(cidade),
    whatsapp: normalizarWhatsapp(dados.whatsapp),
    instagram: normalizarInstagram(dados.instagram),
    site: normalizarSite(dados.site),
  };

  if (exigirCnpj) {
    const cnpj = apenasDigitos(dados.cnpj);
    if (cnpj.length !== 14 || !documentoValido(cnpj)) throw new Error('CNPJ inválido — confira os números');
    limpo.cnpj = cnpj;
  }

  if (!limpo.whatsapp && !limpo.instagram && !limpo.site) {
    throw new Error('informe pelo menos um contato: WhatsApp, Instagram ou site');
  }
  return limpo;
}

/** Só maior de idade, conta sem suspensão, abre loja. */
export function podeCadastrar(usuario) {
  if (usuario.suspenso) return { ok: false, motivo: 'conta suspensa' };
  const faixa = faixaEtaria(usuario.nascimento);
  if (faixa === 'desconhecida') return { ok: false, motivo: 'informe sua data de nascimento no perfil para cadastrar uma loja' };
  if (faixa === 'menor') return { ok: false, motivo: 'lojas só podem ser cadastradas por maiores de 18 anos' };
  return { ok: true, motivo: null };
}

/* ------------------------------------------------------------------ */
/* Leitura                                                             */
/* ------------------------------------------------------------------ */

export function obterPorId(id) {
  return db.prepare('SELECT * FROM lojas WHERE id = ?').get(Number(id)) ?? null;
}

export function obterPorDono(donoId) {
  return db.prepare('SELECT * FROM lojas WHERE dono_id = ?').get(Number(donoId)) ?? null;
}

// Cancelada continua no ar até o fim do período já pago; estorno zera a validade e some na hora.
const VISIVEL = "status = 'ativa' AND assinatura_status IN ('ativa', 'cancelada') AND assinatura_expira_em > datetime('now')";

/** Endereço da logo, com a data de troca na query: logo nova nunca fica presa no cache do navegador. */
function enderecoDaLogo(l) {
  return l.logo_mime ? `/api/lojas/${l.id}/logo?v=${encodeURIComponent(l.logo_atualizado_em ?? '')}` : null;
}

/** O que aparece para o público — nunca CNPJ, dono nem dados de cobrança. */
function publica(l) {
  return {
    id: l.id, nome: l.nome, descricao: l.descricao, uf: l.uf, cidade: l.cidade,
    whatsapp: l.whatsapp, instagram: l.instagram, site: l.site, logo: enderecoDaLogo(l),
  };
}

/** A loja visível ao público (aprovada + mensalidade em dia), ou null — usado para servir a logo. */
export function obterVisivel(id) {
  return db.prepare(`SELECT * FROM lojas WHERE id = ? AND ${VISIVEL}`).get(Number(id)) ?? null;
}

/** "+48 hours": o prazo que prometemos à loja para o administrador decidir. */
const prazoDeRevisao = () => `+${config.lojas.prazoRevisaoHoras} hours`;

const escaparLike = (t) => t.replace(/[\\%_]/g, '\\$&');

export function buscar({ uf = '', cidade = '', q = '', pagina = 1 } = {}) {
  const filtros = [VISIVEL];
  const valores = [];

  const ufLimpa = String(uf).trim().toUpperCase();
  if (ufLimpa) {
    if (!UFS.includes(ufLimpa)) return { lojas: [], total: 0, pagina: 1, porPagina: POR_PAGINA };
    filtros.push('uf = ?');
    valores.push(ufLimpa);
  }
  const cidadeBusca = semAcento(cidade);
  if (cidadeBusca) {
    filtros.push("cidade_busca LIKE ? ESCAPE '\\'");
    valores.push(`%${escaparLike(cidadeBusca)}%`);
  }
  const termo = semAcento(q);
  if (termo) {
    filtros.push("(LOWER(nome) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(descricao, '')) LIKE ? ESCAPE '\\')");
    const padrao = `%${escaparLike(termo)}%`;
    valores.push(padrao, padrao);
  }

  const onde = filtros.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM lojas WHERE ${onde}`).get(...valores).n;
  const p = Math.max(1, Number(pagina) || 1);
  const lojas = db.prepare(
    `SELECT * FROM lojas WHERE ${onde} ORDER BY cidade_busca, nome LIMIT ? OFFSET ?`,
  ).all(...valores, POR_PAGINA, (p - 1) * POR_PAGINA).map(publica);

  return { lojas, total, pagina: p, porPagina: POR_PAGINA };
}

export function contarPorUf() {
  return db.prepare(`SELECT uf, COUNT(*) AS total FROM lojas WHERE ${VISIVEL} GROUP BY uf ORDER BY uf`).all();
}

/* ------------------------------------------------------------------ */
/* Escrita pelo dono                                                   */
/* ------------------------------------------------------------------ */

export function criar(usuario, dados) {
  const permissao = podeCadastrar(usuario);
  if (!permissao.ok) throw new Error(permissao.motivo);
  if (obterPorDono(usuario.id)) throw new Error('você já tem uma loja cadastrada');

  const l = validarDados(dados, { exigirCnpj: true });
  if (db.prepare('SELECT 1 FROM lojas WHERE cnpj = ?').get(l.cnpj)) {
    throw new Error('já existe uma loja cadastrada com este CNPJ');
  }

  const info = db.prepare(
    `INSERT INTO lojas (dono_id, nome, cnpj, descricao, uf, cidade, cidade_busca, whatsapp, instagram, site, prazo_revisao_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?))`,
  ).run(usuario.id, l.nome, l.cnpj, l.descricao, l.uf, l.cidade, l.cidade_busca, l.whatsapp, l.instagram, l.site, prazoDeRevisao());
  return obterPorId(info.lastInsertRowid);
}

/**
 * O dono edita; se a loja já estava no ar, volta para revisão — senão daria para ser
 * aprovada com um nome e trocar por outro depois. O CNPJ não muda por aqui.
 */
export function atualizar(donoId, dados) {
  const atual = obterPorDono(donoId);
  if (!atual) throw new Error('você ainda não tem uma loja cadastrada');

  const l = validarDados({ ...dados, cnpj: atual.cnpj }, { exigirCnpj: false });
  const mudouVitrine = ['nome', 'descricao', 'uf', 'cidade', 'whatsapp', 'instagram', 'site']
    .some((campo) => (l[campo] ?? null) !== (atual[campo] ?? null));
  const volta = atual.status === 'ativa' && mudouVitrine;

  db.prepare(
    `UPDATE lojas SET nome = ?, descricao = ?, uf = ?, cidade = ?, cidade_busca = ?, whatsapp = ?, instagram = ?, site = ?,
        status = ?, motivo_status = ?, prazo_revisao_em = ${volta ? "datetime('now', ?)" : 'prazo_revisao_em'},
        atualizado_em = datetime('now') WHERE id = ?`,
  ).run(
    l.nome, l.descricao, l.uf, l.cidade, l.cidade_busca, l.whatsapp, l.instagram, l.site,
    volta ? 'pendente' : atual.status,
    volta ? 'Alteração aguardando nova revisão.' : atual.motivo_status,
    ...(volta ? [prazoDeRevisao()] : []),
    atual.id,
  );
  return obterPorId(atual.id);
}

/**
 * Troca (dataUrl) ou tira (null) a logo. A logo é vitrine como o nome: se a loja estava no ar,
 * volta para revisão — senão daria para ser aprovada com uma imagem e trocar por outra depois.
 */
export function trocarLogo(donoId, dataUrl) {
  const atual = obterPorDono(donoId);
  if (!atual) throw new Error('cadastre a loja antes de enviar a logo');

  if (dataUrl === null) removerLogo(atual.id);
  else salvarLogo(atual.id, dataUrl);

  const volta = atual.status === 'ativa';
  if (volta) {
    db.prepare(
      "UPDATE lojas SET status = 'pendente', motivo_status = 'Alteração aguardando nova revisão.', prazo_revisao_em = datetime('now', ?) WHERE id = ?",
    ).run(prazoDeRevisao(), atual.id);
  }
  return { loja: obterPorId(atual.id), voltouParaRevisao: volta };
}

/* ------------------------------------------------------------------ */
/* Moderação (admin)                                                   */
/* ------------------------------------------------------------------ */

export function listarParaAdmin(status = 'pendente') {
  const filtrar = STATUS.includes(status);
  // Em análise: quem vence primeiro aparece primeiro.
  const ordem = status === 'pendente' ? 'l.prazo_revisao_em, l.id' : 'l.id DESC';
  return db.prepare(
    `SELECT l.*, u.nome AS dono_nome, u.email AS dono_email
       FROM lojas l JOIN usuarios u ON u.id = l.dono_id ${filtrar ? 'WHERE l.status = ?' : ''}
      ORDER BY ${ordem} LIMIT 200`,
  ).all(...(filtrar ? [status] : [])).map((l) => ({ ...l, logo: enderecoDaLogo(l) }));
}

/** O aviso fixo do administrador: quantas lojas esperam e quantas já passaram do prazo. */
export function resumoDeRevisoes() {
  const r = db.prepare(
    `SELECT COUNT(*) AS pendentes,
            COALESCE(SUM(CASE WHEN prazo_revisao_em <= datetime('now') THEN 1 ELSE 0 END), 0) AS vencidas,
            MIN(prazo_revisao_em) AS proximoPrazo
       FROM lojas WHERE status = 'pendente'`,
  ).get();
  return { lojasPendentes: r.pendentes, lojasVencidas: r.vencidas, lojasProximoPrazo: r.proximoPrazo };
}

export function mudarStatus(id, status, motivo = null) {
  if (!STATUS.includes(status)) throw new Error('status inválido');
  if (!obterPorId(id)) throw new Error('loja não encontrada');
  // Decidida, a loja deixa de ter prazo; em análise de novo (reabrir), o prazo recomeça.
  db.prepare(
    `UPDATE lojas SET status = ?, motivo_status = ?, atualizado_em = datetime('now'),
        prazo_revisao_em = ${status === 'pendente' ? "datetime('now', ?)" : 'NULL'} WHERE id = ?`,
  ).run(status, String(motivo ?? '').trim().slice(0, 300) || null, ...(status === 'pendente' ? [prazoDeRevisao()] : []), Number(id));
  return obterPorId(id);
}

/* ------------------------------------------------------------------ */
/* Mensalidade                                                         */
/* ------------------------------------------------------------------ */

export function precoMensal() {
  return config.lojas.precoMensal;
}

/** Libera (ou renova) N dias, somando ao que ainda resta — renovar antes de vencer não perde dia pago. */
export function ativarAssinatura(id, dias = 30) {
  const atual = obterPorId(id);
  if (!atual) throw new Error('loja não encontrada');
  const saldo = atual.assinatura_status === 'ativa' && atual.assinatura_expira_em
    ? Math.max(0, Math.ceil((new Date(`${atual.assinatura_expira_em.replace(' ', 'T')}Z`).getTime() - Date.now()) / 86400000))
    : 0;
  db.prepare(
    "UPDATE lojas SET assinatura_status = 'ativa', assinatura_expira_em = datetime('now', ?), atualizado_em = datetime('now') WHERE id = ?",
  ).run(`+${saldo + Number(dias)} days`, Number(id));
  return obterPorId(id);
}

export function cancelarAssinatura(id, { imediato = false } = {}) {
  db.prepare(
    `UPDATE lojas SET assinatura_status = 'cancelada', atualizado_em = datetime('now')${imediato ? ", assinatura_expira_em = datetime('now')" : ''} WHERE id = ?`,
  ).run(Number(id));
  return obterPorId(id);
}

export function salvarIdentificadoresAsaas(id, { clienteId = null, assinaturaId = null } = {}) {
  db.prepare('UPDATE lojas SET asaas_cliente_id = COALESCE(?, asaas_cliente_id), asaas_assinatura_id = ? WHERE id = ?')
    .run(clienteId, assinaturaId, Number(id));
}

export function lojaPorAssinaturaExterna(assinaturaId) {
  if (!assinaturaId) return null;
  return db.prepare('SELECT id FROM lojas WHERE asaas_assinatura_id = ?').get(String(assinaturaId))?.id ?? null;
}

/** O que o dono pode ver da própria loja (inclui estado da mensalidade, nunca ids do gateway). */
export function paraODono(l) {
  if (!l) return null;
  const { asaas_cliente_id: _c, asaas_assinatura_id: assinaturaGateway, ...resto } = l;
  return { ...resto, logo: enderecoDaLogo(l), temAssinaturaNoGateway: Boolean(assinaturaGateway) };
}
