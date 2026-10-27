import { config } from '../config.js';

/** "AAAA-MM-DD" válido e que existe no calendário (31/02 não passa). */
export function nascimentoValido(texto, hoje = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(texto ?? ''));
  if (!m) return false;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return false;
  return d.getTime() <= hoje.getTime() && ano >= 1900;
}

/** Idade completa em anos, ou null se a data não foi informada/é inválida. */
export function calcularIdade(nascimento, hoje = new Date()) {
  if (!nascimentoValido(nascimento, hoje)) return null;
  const [ano, mes, dia] = nascimento.split('-').map(Number);
  let idade = hoje.getUTCFullYear() - ano;
  const aindaNaoFez = hoje.getUTCMonth() + 1 < mes || (hoje.getUTCMonth() + 1 === mes && hoje.getUTCDate() < dia);
  if (aindaNaoFez) idade -= 1;
  return idade;
}

/**
 * 'desconhecida' — conta antiga, sem data de nascimento (segue como estava, mas só vira "adulta" quando informar);
 * 'menor'        — abaixo de 18: exige responsável e fica fora de venda, lance e mensagem;
 * 'adulto'       — 18 ou mais.
 */
export function faixaEtaria(nascimento, hoje = new Date()) {
  const idade = calcularIdade(nascimento, hoje);
  if (idade === null) return 'desconhecida';
  return idade >= config.idade.maioridade ? 'adulto' : 'menor';
}

export function idadeMinimaAtingida(nascimento, hoje = new Date()) {
  const idade = calcularIdade(nascimento, hoje);
  return idade !== null && idade >= config.idade.minima;
}
