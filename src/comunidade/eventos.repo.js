import { db } from '../db/index.js';
import { UFS, semAcento } from '../lojas/regioes.js';
import { faixaEtaria } from '../seguranca/idade.js';
import * as lojas from '../lojas/lojas.repo.js';
import { validarTexto } from './texto.js';

/*
  Eventos de cartas em todo o Brasil.

  Evento passado some sozinho: sai da lista na hora (a consulta filtra pela data) e é
  apagado do banco pela limpeza diária. Uma data de fim igual ou maior que HOJE ainda vale —
  um evento de hoje à noite não pode ter "passado".
*/

export const TIPOS = Object.freeze({
  torneio: 'Torneio',
  encontro: 'Encontro de colecionadores',
  lancamento: 'Lançamento ou pré-lançamento',
  feira: 'Feira ou convenção',
  outro: 'Outro',
});

const STATUS = ['pendente', 'aprovado', 'recusado'];
const POR_PAGINA = 24;
const MAX_ATIVOS_POR_PESSOA = 20;
const MAX_PENDENTES_POR_PESSOA = 5;
const MAX_DIAS_DE_DURACAO = 30;
const MAX_DIAS_NO_FUTURO = 730;

/** A data de hoje no Brasil (AAAA-MM-DD). O servidor pode estar em outro fuso: não confiar no relógio local. */
export function hojeNoBrasil(agora = new Date()) {
  return agora.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

function somarDias(data, dias) {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function dataValida(t) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(t ?? ''))) return false;
  const d = new Date(`${t}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t;
}

function normalizarLink(bruto) {
  const t = String(bruto ?? '').trim();
  if (!t) return null;
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
  } catch {
    throw new Error('link inválido');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('link inválido');
  if (url.href.length > 200) throw new Error('link muito longo');
  return url.href;
}

function validar(dados, hoje) {
  const titulo = validarTexto(dados.titulo, { campo: 'título', min: 5, max: 100 });
  if (titulo.includes('\n')) throw new Error('título: use uma linha só');
  if (!Object.hasOwn(TIPOS, dados.tipo)) throw new Error('escolha o tipo do evento');

  const uf = String(dados.uf ?? '').trim().toUpperCase();
  if (!UFS.includes(uf)) throw new Error('escolha o estado do evento');
  const cidade = String(dados.cidade ?? '').trim();
  if (cidade.length < 2 || cidade.length > 60) throw new Error('informe a cidade do evento');

  if (!dataValida(dados.dataInicio)) throw new Error('informe a data do evento');
  const dataInicio = dados.dataInicio;
  const dataFim = dados.dataFim ? dados.dataFim : dataInicio;
  if (!dataValida(dataFim)) throw new Error('data de término inválida');
  if (dataInicio < hoje) throw new Error('o evento precisa ser de hoje em diante');
  if (dataFim < dataInicio) throw new Error('a data de término não pode ser antes do início');
  if (dataInicio > somarDias(hoje, MAX_DIAS_NO_FUTURO)) throw new Error('data muito distante — cadastre mais perto da data');
  if (dataFim > somarDias(dataInicio, MAX_DIAS_DE_DURACAO)) throw new Error(`o evento pode durar no máximo ${MAX_DIAS_DE_DURACAO} dias`);

  const hora = String(dados.hora ?? '').trim();
  if (hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) throw new Error('horário inválido (use HH:MM)');

  const local = String(dados.local ?? '').trim()
    ? validarTexto(dados.local, { campo: 'local', min: 3, max: 150 })
    : null;
  const descricao = String(dados.descricao ?? '').trim()
    ? validarTexto(dados.descricao, { campo: 'descrição', min: 10, max: 1000 })
    : null;

  return {
    titulo, tipo: dados.tipo, uf, cidade, cidade_busca: semAcento(cidade), local, descricao,
    data_inicio: dataInicio, data_fim: dataFim, hora: hora || null, link: normalizarLink(dados.link),
  };
}

/* ------------------------------------------------------------------ */
/* Publicação                                                          */
/* ------------------------------------------------------------------ */

/** Só adulto, sem suspensão, divulga evento. A tela usa isto para esconder o formulário de quem não pode. */
export function podeDivulgar(usuario) {
  if (usuario.suspenso) return { ok: false, motivo: 'conta suspensa' };
  const faixa = faixaEtaria(usuario.nascimento);
  if (faixa === 'desconhecida') return { ok: false, motivo: 'informe sua data de nascimento no perfil para divulgar eventos' };
  if (faixa === 'menor') return { ok: false, motivo: 'só maiores de 18 anos divulgam eventos' };
  return { ok: true, motivo: null };
}

/**
 * Só adulto divulga evento. Administrador e dono de loja já aprovada saem direto no ar
 * (já passaram por uma análise); o resto espera a aprovação.
 */
export function criar(usuario, dados, hoje = hojeNoBrasil()) {
  const permissao = podeDivulgar(usuario);
  if (!permissao.ok) throw new Error(permissao.motivo);

  const e = validar(dados, hoje);
  const ativos = db.prepare("SELECT COUNT(*) AS n FROM eventos WHERE criado_por = ? AND data_fim >= ?").get(usuario.id, hoje).n;
  if (ativos >= MAX_ATIVOS_POR_PESSOA) throw new Error('você já tem muitos eventos cadastrados — espere algum acontecer');
  const pendentes = db.prepare("SELECT COUNT(*) AS n FROM eventos WHERE criado_por = ? AND status = 'pendente'").get(usuario.id).n;
  if (pendentes >= MAX_PENDENTES_POR_PESSOA && !usuario.admin) throw new Error('você tem eventos aguardando aprovação — espere a análise');

  const loja = lojas.obterPorDono(usuario.id);
  const lojaAtiva = loja?.status === 'ativa' ? loja : null;
  const status = usuario.admin || lojaAtiva ? 'aprovado' : 'pendente';

  const info = db.prepare(
    `INSERT INTO eventos (criado_por, loja_id, titulo, tipo, uf, cidade, cidade_busca, local, descricao, data_inicio, data_fim, hora, link, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(usuario.id, lojaAtiva?.id ?? null, e.titulo, e.tipo, e.uf, e.cidade, e.cidade_busca, e.local, e.descricao, e.data_inicio, e.data_fim, e.hora, e.link, status);
  return obter(info.lastInsertRowid);
}

export function obter(id) {
  return db.prepare('SELECT * FROM eventos WHERE id = ?').get(Number(id)) ?? null;
}

/** Quem criou apaga o próprio evento (não há edição: apaga e cadastra de novo). */
export function removerProprio(usuarioId, id) {
  const info = db.prepare('DELETE FROM eventos WHERE id = ? AND criado_por = ?').run(Number(id), Number(usuarioId));
  if (!info.changes) throw new Error('evento não encontrado');
}

/* ------------------------------------------------------------------ */
/* Leitura                                                             */
/* ------------------------------------------------------------------ */

const paraPublico = (e) => ({
  id: e.id,
  titulo: e.titulo,
  tipo: e.tipo,
  tipoRotulo: TIPOS[e.tipo],
  uf: e.uf,
  cidade: e.cidade,
  local: e.local,
  descricao: e.descricao,
  dataInicio: e.data_inicio,
  dataFim: e.data_fim,
  hora: e.hora,
  link: e.link,
  loja: e.loja_nome ?? null,
});

/** Lista pública: só aprovado e que ainda não passou. Nunca expõe quem cadastrou. */
export function listarPublicos({ uf = '', cidade = '', tipo = '', pagina = 1 } = {}, hoje = hojeNoBrasil()) {
  const filtros = ["e.status = 'aprovado'", 'e.data_fim >= ?'];
  const valores = [hoje];

  const ufLimpa = String(uf).trim().toUpperCase();
  if (ufLimpa) {
    if (!UFS.includes(ufLimpa)) return { eventos: [], total: 0, pagina: 1, porPagina: POR_PAGINA };
    filtros.push('e.uf = ?');
    valores.push(ufLimpa);
  }
  const cidadeBusca = semAcento(cidade);
  if (cidadeBusca) {
    filtros.push("e.cidade_busca LIKE ? ESCAPE '\\'");
    valores.push(`%${cidadeBusca.replace(/[\\%_]/g, '\\$&')}%`);
  }
  if (Object.hasOwn(TIPOS, tipo)) {
    filtros.push('e.tipo = ?');
    valores.push(tipo);
  }

  const onde = filtros.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM eventos e WHERE ${onde}`).get(...valores).n;
  const p = Math.max(1, Number(pagina) || 1);
  const eventos = db.prepare(
    `SELECT e.*, l.nome AS loja_nome FROM eventos e LEFT JOIN lojas l ON l.id = e.loja_id
      WHERE ${onde} ORDER BY e.data_inicio, COALESCE(e.hora, '99:99'), e.id LIMIT ? OFFSET ?`,
  ).all(...valores, POR_PAGINA, (p - 1) * POR_PAGINA).map(paraPublico);

  return { eventos, total, pagina: p, porPagina: POR_PAGINA };
}

export function listarDaPessoa(usuarioId) {
  return db.prepare('SELECT * FROM eventos WHERE criado_por = ? ORDER BY data_inicio DESC, id DESC LIMIT 100')
    .all(Number(usuarioId))
    .map((e) => ({ ...paraPublico(e), status: e.status, motivoStatus: e.motivo_status }));
}

/* ------------------------------------------------------------------ */
/* Moderação e limpeza                                                 */
/* ------------------------------------------------------------------ */

export function listarParaAdmin(status = 'pendente', hoje = hojeNoBrasil()) {
  const filtrar = STATUS.includes(status);
  return db.prepare(
    `SELECT e.*, u.nome AS criador_nome, u.email AS criador_email, l.nome AS loja_nome
       FROM eventos e JOIN usuarios u ON u.id = e.criado_por LEFT JOIN lojas l ON l.id = e.loja_id
      WHERE e.data_fim >= ? ${filtrar ? 'AND e.status = ?' : ''}
      ORDER BY e.data_inicio, e.id LIMIT 200`,
  ).all(hoje, ...(filtrar ? [status] : []))
    .map((e) => ({ ...paraPublico(e), status: e.status, motivoStatus: e.motivo_status, criador: `${e.criador_nome} (${e.criador_email})` }));
}

export function decidir(id, status, motivo = null) {
  if (!['aprovado', 'recusado'].includes(status)) throw new Error('status inválido');
  const texto = String(motivo ?? '').trim().slice(0, 300) || null;
  if (status === 'recusado' && !texto) throw new Error('explique o motivo da recusa');
  const info = db.prepare('UPDATE eventos SET status = ?, motivo_status = ? WHERE id = ?').run(status, texto, Number(id));
  if (!info.changes) throw new Error('evento não encontrado');
}

export function removerComoAdmin(id) {
  const info = db.prepare('DELETE FROM eventos WHERE id = ?').run(Number(id));
  if (!info.changes) throw new Error('evento não encontrado');
}

/** Apaga o que já passou (qualquer status). Roda no boot e a cada 6 horas. */
export function apagarPassados(hoje = hojeNoBrasil()) {
  return db.prepare('DELETE FROM eventos WHERE data_fim < ?').run(hoje).changes;
}
