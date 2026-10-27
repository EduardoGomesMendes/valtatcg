import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'valtatcg-teste-'));
process.env.DATA_DIR = pastaTemp;

const { db } = await import('../src/db/index.js');
const usuarios = await import('../src/auth/usuarios.repo.js');
const lojas = await import('../src/lojas/lojas.repo.js');
const eventos = await import('../src/comunidade/eventos.repo.js');

let falhas = 0;
function ok(nome, condicao, detalhe = '') {
  console.log(`${condicao ? '  OK  ' : ' FALHA'} ${nome}${detalhe ? ` → ${detalhe}` : ''}`);
  if (!condicao) falhas += 1;
}
const lanca = (fn) => { try { fn(); } catch (e) { return e; } return null; };

console.log('\n--- eventos: cadastro, aprovação, busca e limpeza automática ---');

const HOJE = '2026-10-27';
const base = { senha: 'Senha1234', aceiteTermos: true };
const novo = (nome, usuario, nascimento = '1985-03-20') => usuarios.criar({ ...base, nome, email: `${usuario}@teste.local`, usuario, nascimento });
const U = (u) => ({ ...usuarios.buscarPorId(u.id) });

const comum = novo('Pessoa Comum', 'comum');
const admin = novo('Equipe', 'equipe');
db.prepare('UPDATE usuarios SET admin = 1 WHERE id = ?').run(admin.id);
const lojista = novo('Dono da Loja', 'lojista');
const menor = usuarios.criar({ ...base, nome: 'Menor', email: 'menor@teste.local', usuario: 'menorzin', nascimento: '2010-01-15', responsavelNome: 'Mãe', responsavelEmail: 'mae@teste.local' });
const antigo = novo('Antigo', 'antigo');
db.prepare('UPDATE usuarios SET nascimento = NULL WHERE id = ?').run(antigo.id);

const evento = (extra = {}) => ({
  titulo: 'Torneio de Pokémon TCG', tipo: 'torneio', uf: 'RS', cidade: 'Porto Alegre',
  local: 'Rua das Cartas, 100 - Centro', descricao: 'Torneio aberto, todas as idades, premiação em boosters.',
  dataInicio: '2026-11-15', hora: '14:00', link: 'torneio.exemplo.com.br', ...extra,
});
const criar = (u, d, hoje = HOJE) => eventos.criar(U(u), d, hoje);

/* ---------- quem pode divulgar ---------- */
ok('menor de idade não divulga', Boolean(lanca(() => criar(menor, evento()))) && eventos.podeDivulgar(U(menor)).ok === false);
ok('conta sem data de nascimento não divulga', Boolean(lanca(() => criar(antigo, evento()))));
usuarios.suspender(comum.id, 'teste');
ok('conta suspensa não divulga', Boolean(lanca(() => criar(comum, evento()))));
usuarios.reativar(comum.id);

/* ---------- validação ---------- */
ok('título curto é recusado', Boolean(lanca(() => criar(comum, evento({ titulo: 'Oi' })))));
ok('tipo inventado é recusado', Boolean(lanca(() => criar(comum, evento({ tipo: 'show' })))));
ok('estado inexistente é recusado', Boolean(lanca(() => criar(comum, evento({ uf: 'XX' })))));
ok('data inexistente (31/02) é recusada', Boolean(lanca(() => criar(comum, evento({ dataInicio: '2026-02-31' })))));
ok('data no passado é recusada', Boolean(lanca(() => criar(comum, evento({ dataInicio: '2026-10-26' })))));
ok('fim antes do início é recusado', Boolean(lanca(() => criar(comum, evento({ dataInicio: '2026-11-15', dataFim: '2026-11-14' })))));
ok('mais de 30 dias de duração é recusado', Boolean(lanca(() => criar(comum, evento({ dataInicio: '2026-11-01', dataFim: '2026-12-15' })))));
ok('data a mais de 2 anos é recusada', Boolean(lanca(() => criar(comum, evento({ dataInicio: '2029-01-01' })))));
ok('horário inválido é recusado', Boolean(lanca(() => criar(comum, evento({ hora: '25:99' })))));
ok('link "javascript:" é recusado', Boolean(lanca(() => criar(comum, evento({ link: 'javascript:alert(1)' })))));
ok('telefone na descrição é recusado', Boolean(lanca(() => criar(comum, evento({ descricao: 'Informações no zap 51 99999-8888 sem falta' })))));
ok('link na descrição é recusado (o link vai no campo próprio)', Boolean(lanca(() => criar(comum, evento({ descricao: 'Inscrição em https://golpe.com agora mesmo' })))));

/* ---------- aprovação ---------- */
const e1 = criar(comum, evento());
ok('adulto comum: o evento espera aprovação', e1.status === 'pendente');
ok('o link ganha https://', e1.link === 'https://torneio.exemplo.com.br/');
ok('evento pendente não aparece para o público', eventos.listarPublicos({}, HOJE).total === 0);

const e2 = criar(admin, evento({ titulo: 'Encontro oficial da equipe', tipo: 'encontro', uf: 'SP', cidade: 'São Paulo', dataInicio: '2026-12-05' }));
ok('evento do admin já sai aprovado', e2.status === 'aprovado');

const loja = lojas.criar(U(lojista), { nome: 'Cards do Sul', cnpj: '11.222.333/0001-81', uf: 'RS', cidade: 'Porto Alegre', whatsapp: '51999998888' });
const e3 = criar(lojista, evento({ titulo: 'Pré-lançamento na loja', tipo: 'lancamento', dataInicio: '2026-11-20' }));
ok('dono de loja ainda pendente de aprovação: evento espera', e3.status === 'pendente');
eventos.removerProprio(lojista.id, e3.id);
lojas.mudarStatus(loja.id, 'ativa');
const e4 = criar(lojista, evento({ titulo: 'Pré-lançamento na loja', tipo: 'lancamento', dataInicio: '2026-11-20' }));
ok('dono de loja aprovada: evento sai aprovado e ligado à loja', e4.status === 'aprovado' && e4.loja_id === loja.id);

ok('recusar exige motivo', Boolean(lanca(() => eventos.decidir(e1.id, 'recusado', ''))));
eventos.decidir(e1.id, 'aprovado');
ok('depois de aprovado, o evento aparece', eventos.listarPublicos({}, HOJE).total === 3);
ok('status inventado é recusado', Boolean(lanca(() => eventos.decidir(e1.id, 'publicado'))));

/* ---------- lista pública ---------- */
const lista = eventos.listarPublicos({}, HOJE);
ok('ordenados por data', lista.eventos.map((e) => e.dataInicio).join() === ['2026-11-15', '2026-11-20', '2026-12-05'].join());
ok('o público não vê quem cadastrou', !JSON.stringify(lista).match(/criado_por|criador|@teste\.local|Pessoa Comum|Dono da Loja/));
ok('evento de loja mostra o nome da loja', lista.eventos.find((e) => e.titulo === 'Pré-lançamento na loja').loja === 'Cards do Sul');
ok('filtra por estado', eventos.listarPublicos({ uf: 'sp' }, HOJE).total === 1 && eventos.listarPublicos({ uf: 'RS' }, HOJE).total === 2);
ok('cidade sem acento acha cidade acentuada', eventos.listarPublicos({ cidade: 'sao paulo' }, HOJE).total === 1);
ok('filtra por tipo', eventos.listarPublicos({ tipo: 'torneio' }, HOJE).total === 1 && eventos.listarPublicos({ tipo: 'inventado' }, HOJE).total === 3);
ok('estado inválido na busca dá lista vazia, sem erro', eventos.listarPublicos({ uf: 'ZZ' }, HOJE).total === 0);
ok('"%" na busca de cidade é texto, não curinga', eventos.listarPublicos({ cidade: '%' }, HOJE).total === 0);

/* ---------- a data decide, no fuso do Brasil ---------- */
ok('22h30 de 27/10 no Brasil ainda é dia 27 (mesmo já sendo 28 em UTC)', eventos.hojeNoBrasil(new Date('2026-10-28T01:30:00Z')) === '2026-10-27');
ok('01h00 de 28/10 no Brasil já é dia 28', eventos.hojeNoBrasil(new Date('2026-10-28T04:00:00Z')) === '2026-10-28');

const hoje1 = criar(admin, evento({ titulo: 'Evento só de hoje à noite', dataInicio: HOJE, hora: '22:00' }));
ok('evento de hoje ainda aparece durante o dia', eventos.listarPublicos({}, HOJE).eventos.some((e) => e.id === hoje1.id));
ok('no dia seguinte ele já some da lista (mesmo antes da limpeza)', !eventos.listarPublicos({}, '2026-10-28').eventos.some((e) => e.id === hoje1.id));

const longo = criar(admin, evento({ titulo: 'Convenção de três dias', tipo: 'feira', dataInicio: '2026-11-01', dataFim: '2026-11-03' }));
ok('evento de vários dias continua até o último dia', eventos.listarPublicos({}, '2026-11-03').eventos.some((e) => e.id === longo.id) && !eventos.listarPublicos({}, '2026-11-04').eventos.some((e) => e.id === longo.id));

/* ---------- limpeza automática ---------- */
const antes = db.prepare('SELECT COUNT(*) AS n FROM eventos').get().n;
ok('limpar no mesmo dia não apaga nada que ainda vale', eventos.apagarPassados(HOJE) === 0);
const apagados = eventos.apagarPassados('2026-11-04');
ok('passada a data, o evento é APAGADO do banco', apagados === 2 && db.prepare('SELECT COUNT(*) AS n FROM eventos WHERE id IN (?, ?)').get(hoje1.id, longo.id).n === 0);
ok('o que ainda não passou continua', db.prepare('SELECT COUNT(*) AS n FROM eventos').get().n === antes - 2);
const pendenteVelho = db.prepare("INSERT INTO eventos (criado_por, titulo, tipo, uf, cidade, cidade_busca, data_inicio, data_fim, status) VALUES (?, 'Velho pendente', 'outro', 'RS', 'Canoas', 'canoas', '2026-01-01', '2026-01-01', 'pendente')").run(comum.id);
ok('evento passado é apagado em qualquer status (até o que ninguém aprovou)', eventos.apagarPassados(HOJE) === 1 && !eventos.obter(pendenteVelho.lastInsertRowid));

/* ---------- limites e posse ---------- */
const frequente = novo('Frequente', 'frequente');
for (let i = 0; i < 5; i += 1) criar(frequente, evento({ titulo: `Evento número ${i + 1}` }));
ok('no máximo 5 eventos aguardando aprovação por pessoa', Boolean(lanca(() => criar(frequente, evento({ titulo: 'Evento número 6' })))));
ok('ninguém apaga evento dos outros', Boolean(lanca(() => eventos.removerProprio(comum.id, e2.id))));
eventos.removerProprio(comum.id, e1.id);
ok('o dono apaga o próprio evento', eventos.obter(e1.id) === null);
ok('a pessoa vê os próprios eventos com o status', eventos.listarDaPessoa(frequente.id).length === 5 && eventos.listarDaPessoa(frequente.id)[0].status === 'pendente');
ok('o admin lista por status e vê quem criou', eventos.listarParaAdmin('pendente', HOJE).every((e) => e.criador.includes('@teste.local')));

db.close();
try {
  fs.rmSync(pastaTemp, { recursive: true, force: true });
} catch {
  // pasta fica para trás em %TEMP% — sem impacto no resultado do teste.
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nOK — tudo passou\n');
process.exit(falhas > 0 ? 1 : 0);
