import { db } from '../db/index.js';
import { config } from '../config.js';

/*
  Cota diária do plano grátis: quantas cartas a pessoa ainda pode cadastrar hoje.

  O "dia" é o de Brasília (UTC−3, sem horário de verão desde 2019): quem cadastra às 22h não pode cadastrar de novo
  às 22h05 só porque, em UTC, já virou o dia. Assinante não passa por aqui.
*/

export const limiteDiario = () => config.assinatura.limiteDiarioGratis;

/** AAAA-MM-DD de hoje em Brasília. */
export function hoje() {
  return db.prepare("SELECT date('now', '-3 hours') AS d").get().d;
}

export function usadasHoje(usuarioId) {
  return db.prepare('SELECT usadas FROM colecao_cota WHERE usuario_id = ? AND dia = ?')
    .get(Number(usuarioId), hoje())?.usadas ?? 0;
}

export function restantesHoje(usuarioId) {
  return Math.max(0, limiteDiario() - usadasHoje(usuarioId));
}

/** O que a tela mostra ao plano grátis. */
export function situacaoDaCota(usuarioId) {
  const usadas = usadasHoje(usuarioId);
  return { limiteDiario: limiteDiario(), usadasHoje: usadas, restantesHoje: Math.max(0, limiteDiario() - usadas) };
}

export class ErroDeCota extends Error {
  constructor(mensagem, cota) {
    super(mensagem);
    this.cota = cota;
  }
}

/**
 * Gasta `quantidade` cartas da cota de hoje, ou lança ErroDeCota sem gastar nada. Confere e grava no mesmo bloco síncrono
 * (o banco é de um processo só), então dois pedidos ao mesmo tempo não passam juntos pelo limite.
 */
export function reservar(usuarioId, quantidade) {
  const n = Number(quantidade);
  const situacao = situacaoDaCota(usuarioId);
  if (n > situacao.restantesHoje) {
    const mensagem = situacao.limiteDiario === 0
      ? 'O plano grátis não cadastra cartas novas. Assine para cadastrar sem limite.'
      : situacao.restantesHoje === 0
        ? `No plano grátis você cadastra ${situacao.limiteDiario} ${situacao.limiteDiario === 1 ? 'carta' : 'cartas'} por dia, e a de hoje já foi. Volte amanhã ou assine para cadastrar sem limite.`
        : `No plano grátis você ainda pode cadastrar ${situacao.restantesHoje} ${situacao.restantesHoje === 1 ? 'carta' : 'cartas'} hoje. Reduza a quantidade ou assine para cadastrar sem limite.`;
    throw new ErroDeCota(mensagem, situacao);
  }
  db.prepare(
    `INSERT INTO colecao_cota (usuario_id, dia, usadas) VALUES (?, ?, ?)
     ON CONFLICT(usuario_id, dia) DO UPDATE SET usadas = usadas + excluded.usadas`,
  ).run(Number(usuarioId), hoje(), n);
}

/** Devolve cota (ex.: a carta foi removida no mesmo dia em que foi cadastrada, ou o cadastro falhou). */
export function devolver(usuarioId, quantidade) {
  db.prepare(
    'UPDATE colecao_cota SET usadas = MAX(0, usadas - ?) WHERE usuario_id = ? AND dia = ?',
  ).run(Number(quantidade), Number(usuarioId), hoje());
}

/** O item foi cadastrado hoje (no dia de Brasília)? Só nesse caso remover o item devolve a cota. */
export function itemDeHoje(itemId, usuarioId) {
  return Boolean(db.prepare(
    "SELECT 1 FROM colecao_item WHERE id = ? AND usuario_id = ? AND date(criado_em, '-3 hours') = ?",
  ).get(Number(itemId), Number(usuarioId), hoje()));
}

/** Registros de dias que já passaram não servem para nada. */
export function limparAntigas(dias = 7) {
  return db.prepare("DELETE FROM colecao_cota WHERE dia < date('now', ?)").run(`-${dias} days`).changes;
}
