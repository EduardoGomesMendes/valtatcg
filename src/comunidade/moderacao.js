import { db } from '../db/index.js';
import * as usuarios from '../auth/usuarios.repo.js';
import { faixaEtaria } from '../seguranca/idade.js';
import { analisar, CLASSES } from './filtro.js';
import { nomePublico } from './texto.js';

/*
  Moderação do que as pessoas escrevem (fórum e eventos).

  Fluxo de uma mensagem nova:
    1. o filtro analisa o texto;
    2. se barrou, a tentativa fica registrada e a pessoa recebe o motivo;
    3. tentativas GRAVES (pedir contato, encontro, foto, segredo, assunto sexual) são contadas:
       ao chegar no limite em 24h a conta é suspensa na hora e abre-se uma denúncia urgente.
  Quem modera vê tudo em /admin-moderacao/. Administrador não passa pelo filtro.
*/

const LIMITE_GRAVES_EM_24H = 3;
const RETENCAO_BLOQUEIOS_DIAS = 90;

/**
 * @param {object} usuario quem está escrevendo
 * @param {string[]} textos campos a conferir (título, corpo…)
 * @param {'topico'|'resposta'|'evento'} origem
 * @throws {Error} com a mensagem pronta para a pessoa ler
 */
export function conferirConteudo(usuario, textos, origem) {
  if (usuario.admin) return;
  for (const texto of textos) {
    const r = analisar(texto);
    if (!r) continue;

    db.prepare('INSERT INTO bloqueios_conteudo (usuario_id, classe, grave, origem, trecho) VALUES (?, ?, ?, ?, ?)')
      .run(Number(usuario.id), r.classe, r.grave ? 1 : 0, origem, String(texto).trim().slice(0, 300));

    if (r.grave) {
      const graves = db.prepare(
        "SELECT COUNT(*) AS n FROM bloqueios_conteudo WHERE usuario_id = ? AND grave = 1 AND criado_em >= datetime('now', '-1 day')",
      ).get(Number(usuario.id)).n;
      if (graves >= LIMITE_GRAVES_EM_24H) {
        suspenderPorRepeticao(usuario, graves);
        throw new Error('Sua conta foi suspensa por repetir mensagens que violam as regras de segurança. Se foi engano, fale com o suporte.');
      }
    }
    throw new Error(r.mensagem);
  }
}

function suspenderPorRepeticao(usuario, graves) {
  usuarios.suspender(usuario.id, `Suspensão automática: ${graves} tentativas de mensagem grave em 24h`);
  // Denúncia sem autor (é do sistema): cai no topo da fila do moderador.
  db.prepare(
    `INSERT INTO denuncias (autor_id, alvo_tipo, alvo_id, motivo, detalhe) VALUES (NULL, 'usuario', ?, 'seguranca_menor', ?)`,
  ).run(Number(usuario.id), `Bloqueio automático: ${graves} mensagens graves barradas em 24h. Conta suspensa. Confira "Tentativas bloqueadas" em Moderação.`);
}

/* ------------------------------------------------------------------ */
/* Painel do moderador                                                 */
/* ------------------------------------------------------------------ */

/** Últimas mensagens do fórum (tópicos e respostas misturados), para o moderador olhar sem esperar denúncia. */
export function mensagensRecentes(limite = 80) {
  const linhas = db.prepare(
    `SELECT 'topico' AS tipo, t.id AS id, t.id AS topico_id, t.titulo AS titulo, t.corpo AS corpo, t.oculto AS oculto, t.criado_em AS criado_em,
            t.autor_id AS autor_id, u.usuario AS usuario, u.nome AS nome, u.nascimento AS nascimento, u.suspenso AS suspenso, u.nascimento AS topico_autor_nascimento
       FROM forum_topicos t JOIN usuarios u ON u.id = t.autor_id
     UNION ALL
     SELECT 'resposta', r.id, r.topico_id, tp.titulo, r.corpo, r.oculto, r.criado_em,
            r.autor_id, u.usuario, u.nome, u.nascimento, u.suspenso, ut.nascimento
       FROM forum_respostas r JOIN usuarios u ON u.id = r.autor_id
       JOIN forum_topicos tp ON tp.id = r.topico_id JOIN usuarios ut ON ut.id = tp.autor_id
     ORDER BY criado_em DESC, id DESC LIMIT ?`,
  ).all(Number(limite));

  return linhas.map((l) => {
    const autorFaixa = faixaEtaria(l.nascimento);
    const donoFaixa = faixaEtaria(l.topico_autor_nascimento);
    return {
      tipo: l.tipo,
      id: l.id,
      topicoId: l.topico_id,
      titulo: l.titulo,
      corpo: l.corpo,
      oculto: Boolean(l.oculto),
      criadoEm: l.criado_em,
      autorId: l.autor_id,
      autor: nomePublico(l),
      autorNome: l.nome,
      autorFaixa,
      autorSuspenso: Boolean(l.suspenso),
      // O padrão a vigiar: um adulto respondendo em tópico escrito por um menor.
      adultoEmTopicoDeMenor: l.tipo === 'resposta' && autorFaixa === 'adulto' && donoFaixa === 'menor',
    };
  });
}

export function bloqueiosRecentes(limite = 100) {
  return db.prepare(
    `SELECT b.*, u.usuario, u.nome, u.email, u.nascimento, u.suspenso
       FROM bloqueios_conteudo b JOIN usuarios u ON u.id = b.usuario_id
      ORDER BY b.id DESC LIMIT ?`,
  ).all(Number(limite)).map((b) => ({
    id: b.id,
    classe: b.classe,
    classeRotulo: CLASSES[b.classe]?.motivo ?? b.classe,
    grave: Boolean(b.grave),
    origem: b.origem,
    trecho: b.trecho,
    criadoEm: b.criado_em,
    autorId: b.usuario_id,
    autor: nomePublico(b),
    autorNome: b.nome,
    autorEmail: b.email,
    autorFaixa: faixaEtaria(b.nascimento),
    autorSuspenso: Boolean(b.suspenso),
  }));
}

/** Números do aviso fixo no topo para o moderador. */
export function resumoParaModerador() {
  const um = (sql) => db.prepare(sql).get().n;
  return {
    denunciasAbertas: um("SELECT COUNT(*) AS n FROM denuncias WHERE status = 'aberta'"),
    denunciasUrgentes: um("SELECT COUNT(*) AS n FROM denuncias WHERE status = 'aberta' AND motivo = 'seguranca_menor'"),
    bloqueiosGraves24h: um("SELECT COUNT(*) AS n FROM bloqueios_conteudo WHERE grave = 1 AND criado_em >= datetime('now', '-1 day')"),
  };
}

/** Apaga os registros de tentativas bloqueadas mais velhos que o prazo — é dado pessoal, não fica para sempre. */
export function apagarBloqueiosAntigos() {
  return db.prepare("DELETE FROM bloqueios_conteudo WHERE criado_em < datetime('now', ?)").run(`-${RETENCAO_BLOQUEIOS_DIAS} days`).changes;
}

export const LIMITES = Object.freeze({ gravesEm24h: LIMITE_GRAVES_EM_24H, retencaoDias: RETENCAO_BLOQUEIOS_DIAS });
