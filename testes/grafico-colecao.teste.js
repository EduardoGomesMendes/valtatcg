import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'valtatcg-teste-'));
process.env.DATA_DIR = pastaTemp;
process.env.PORT = '0';

const { db } = await import('../src/db/index.js');
const { criarServidor } = await import('../src/api/servidor.js');
const usuarios = await import('../src/auth/usuarios.repo.js');
const { salvar } = await import('../src/portfolio/cartas.repo.js');
const colecaoRepo = await import('../src/portfolio/colecao.repo.js');
const precosRepo = await import('../src/portfolio/precos.repo.js');
const g = await import('../public/assets/js/grafico-colecao.js');

let falhas = 0;
function ok(nome, condicao, detalhe = '') {
  console.log(`${condicao ? '  OK  ' : ' FALHA'} ${nome}${detalhe ? ` → ${detalhe}` : ''}`);
  if (!condicao) falhas += 1;
}

const HOJE = '2026-11-22';
// Um ponto por dia, de 12/05 (194 dias atrás) até hoje, subindo R$ 1 por dia a partir de 100.
const dia = (n) => new Date(Date.UTC(2026, 10, 22 - n)).toISOString().slice(0, 10);
const serie = Array.from({ length: 195 }, (_, i) => ({ data: dia(194 - i), valor: 100 + i, custo: 0 }));

console.log('\n--- gráfico da coleção: dias e datas ---');
ok('numeroDoDia: dias seguidos diferem em 1', g.numeroDoDia('2026-11-22') - g.numeroDoDia('2026-11-21') === 1);
ok('numeroDoDia atravessa o fim do mês e do ano', g.numeroDoDia('2027-01-01') - g.numeroDoDia('2026-12-31') === 1 && g.numeroDoDia('2026-03-01') - g.numeroDoDia('2026-02-28') === 1);
ok('numeroDoDia de texto ruim é NaN', Number.isNaN(g.numeroDoDia('ontem')) && Number.isNaN(g.numeroDoDia(undefined)));
ok('dataBr não desloca o dia pelo fuso', g.dataBr('2026-11-01') === '01/11/2026' && g.dataBr('lixo') === '—');
ok('hojeLocal usa o dia do próprio aparelho', g.hojeLocal(new Date(2026, 10, 30, 23, 59)) === '2026-11-30' && g.hojeLocal(new Date(2026, 0, 1, 0, 0)) === '2026-01-01');

console.log('\n--- gráfico da coleção: períodos ---');
const p = g.periodoDaChave;
ok('7D traz os últimos 8 pontos (hoje e 7 dias atrás)', g.recortar(serie, p('7d'), HOJE).length === 8);
ok('1M traz 31 pontos', g.recortar(serie, p('1m'), HOJE).length === 31);
ok('3M traz 91 e 6M traz 181 pontos', g.recortar(serie, p('3m'), HOJE).length === 91 && g.recortar(serie, p('6m'), HOJE).length === 181);
ok('Tudo devolve a série inteira', g.recortar(serie, p('tudo'), HOJE).length === 195);
ok('chave desconhecida cai em Tudo', g.periodoDaChave('xyz').chave === 'tudo');
ok('não existe 1D (um preço por dia)', !g.PERIODOS.some((x) => x.rotulo === '1D'));
ok('períodos: 7D, 1M, 3M, 6M e Tudo, nessa ordem', g.PERIODOS.map((x) => x.rotulo).join(',') === '7D,1M,3M,6M,Tudo');

console.log('\n--- gráfico da coleção: período que abre sozinho ---');
ok('histórico longo abre em 1M', g.periodoInicial(serie, HOJE) === '1m');
ok('só 10 dias de histórico: 1M já tem linha e abre nele', g.periodoInicial(serie.slice(-10), HOJE) === '1m');
ok('histórico antigo e parado (último ponto há 2 meses) sobe para 3M', g.periodoInicial([{ data: dia(70), valor: 1 }, { data: dia(65), valor: 2 }], HOJE) === '3m');
ok('um ponto só abre em Tudo', g.periodoInicial([{ data: dia(0), valor: 1 }], HOJE) === 'tudo');
ok('série vazia abre em Tudo', g.periodoInicial([], HOJE) === 'tudo');

console.log('\n--- gráfico da coleção: variação do período ---');
{
  const v = g.variacaoDoPeriodo(g.recortar(serie, p('1m'), HOJE), p('1m'), HOJE);
  ok('30 dias de alta de R$ 1/dia: +30 (de 264 para 294)', v.delta === 30 && Math.abs(v.percentual - (30 / 264) * 100) < 1e-9, JSON.stringify(v));
  ok('o rótulo diz "nos últimos 30 dias" quando o histórico cobre o período', v.rotulo === 'nos últimos 30 dias');

  const curto = g.variacaoDoPeriodo(g.recortar(serie.slice(-10), p('3m'), HOJE), p('3m'), HOJE);
  ok('histórico mais curto que o período diz "desde DD/MM" em vez de fingir 90 dias', curto.rotulo === `desde ${g.dataBr(dia(9)).slice(0, 5)}`, curto.rotulo);

  const tudo = g.variacaoDoPeriodo(serie, p('tudo'), HOJE);
  ok('Tudo conta desde o primeiro ponto', tudo.delta === 194 && tudo.rotulo === 'desde 12/05', JSON.stringify(tudo));

  const comAtual = g.variacaoDoPeriodo(g.recortar(serie, p('7d'), HOJE), p('7d'), HOJE, 500);
  ok('com o valor atual do resumo, a variação vai até ele (não até o último ponto)', comAtual.delta === 500 - 287, String(comAtual.delta));

  const queda = g.variacaoDoPeriodo([{ data: dia(5), valor: 200 }, { data: dia(0), valor: 150 }], p('7d'), HOJE);
  ok('queda sai negativa', queda.delta === -50 && queda.percentual === -25);
  ok('começar de zero não divide por zero', g.variacaoDoPeriodo([{ data: dia(5), valor: 0 }, { data: dia(0), valor: 40 }], p('7d'), HOJE).percentual === null);
  ok('menos de 2 pontos não tem variação', g.variacaoDoPeriodo([{ data: dia(0), valor: 5 }], p('7d'), HOJE) === null && g.variacaoDoPeriodo([], p('7d'), HOJE) === null);
}

console.log('\n--- gráfico da coleção: o cursor ---');
{
  const pos = g.posicoesNoTempo([{ data: '2026-11-01' }, { data: '2026-11-02' }, { data: '2026-11-11' }]);
  ok('posição pela data: o primeiro em 0 e o último em 1', pos[0] === 0 && pos.at(-1) === 1);
  ok('um buraco de dias aparece como buraco (1 dia = 10%, 10 dias = 100%)', Math.abs(pos[1] - 0.1) < 1e-9);
  ok('um ponto só fica no meio', JSON.stringify(g.posicoesNoTempo([{ data: HOJE }])) === '[0.5]' && g.posicoesNoTempo([]).length === 0);
  ok('o toque pega o ponto mais perto', g.indiceMaisProximo(pos, 0.04) === 0 && g.indiceMaisProximo(pos, 0.07) === 1 && g.indiceMaisProximo(pos, 0.6) === 2);
  ok('fora das pontas escolhe a ponta', g.indiceMaisProximo(pos, -3) === 0 && g.indiceMaisProximo(pos, 9) === 2);
}

console.log('\n--- servidor: a série traz o histórico inteiro, não só 90 dias ---');
const servidor = criarServidor().listen(0);
await new Promise((r) => servidor.once('listening', r));
const base = `http://127.0.0.1:${servidor.address().port}`;

const u = usuarios.criar({ nome: 'Ana', email: 'ana@teste.local', usuario: 'ana_grafico', senha: 'Senha1234', nascimento: '1990-01-01', aceiteTermos: true });
const cookie = `valtatcg_sessao=${encodeURIComponent(usuarios.abrirSessao(u.id))}`;

const carta = salvar({ id: 'teste-grafico-1', name: 'Carta do Gráfico', set: { id: 'teste', name: 'Set' }, tcgplayer: { prices: { normal: { market: 5 } } } });
colecaoRepo.adicionar({ usuarioId: u.id, cartaId: carta.id, quantidade: 2 });
db.prepare("UPDATE colecao_item SET criado_em = datetime('now', '-300 days') WHERE usuario_id = ?").run(u.id);
for (const dias of [250, 200, 120, 30, 0]) {
  precosRepo.registrarSnapshot(carta.id, 5, db.prepare("SELECT date('now', ?) AS d").get(`-${dias} days`).d);
}

const resumo = await (await fetch(`${base}/api/colecao/resumo`, { headers: { cookie } })).json();
ok('o resumo traz os 5 pontos, inclusive os de 250 e 200 dias atrás', resumo.serie?.length === 5, String(resumo.serie?.length));
ok('o ponto mais antigo é o de 250 dias atrás', resumo.serie?.[0]?.data === db.prepare("SELECT date('now', '-250 days') AS d").get().d);
ok('o repositório continua com 90 dias por padrão (só a rota pede mais)', precosRepo.serieDoPortfolio(u.id).length === 2);

servidor.close();
db.close();
try {
  fs.rmSync(pastaTemp, { recursive: true, force: true });
} catch {
  // pasta fica para trás em %TEMP% — sem impacto no resultado do teste.
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nOK — tudo passou\n');
process.exit(falhas > 0 ? 1 : 0);
