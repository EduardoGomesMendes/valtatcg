import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'valtatcg-teste-'));
process.env.DATA_DIR = pastaTemp;

const { db } = await import('../src/db/index.js');
const usuarios = await import('../src/auth/usuarios.repo.js');
const forum = await import('../src/comunidade/forum.repo.js');
const eventos = await import('../src/comunidade/eventos.repo.js');
const moderacao = await import('../src/comunidade/moderacao.js');
const denuncias = await import('../src/seguranca/denuncias.repo.js');
const { analisar } = await import('../src/comunidade/filtro.js');

let falhas = 0;
function ok(nome, condicao, detalhe = '') {
  console.log(`${condicao ? '  OK  ' : ' FALHA'} ${nome}${detalhe ? ` → ${detalhe}` : ''}`);
  if (!condicao) falhas += 1;
}
const lanca = (fn) => { try { fn(); } catch (e) { return e; } return null; };

console.log('\n--- moderação: filtro, suspensão automática, denúncia urgente e painel ---');

/* ---------- filtro: o que deve e o que NÃO deve ser barrado ---------- */
const liberados = [
  'Alguém sabe o valor de uma Charizard holo 4/102?',
  'Meu computador não abre o site',
  'Estou curioso sobre a coleção base, é muito curiosa',
  'Vendi por R$ 1.200,00 a carta 151/165 do set SV3pt5',
  'Manda uma foto da carta para eu ver o estado',
  'A carta é muito antiga, tem quantos anos esse set?',
  'Vou no torneio da loja no sábado, quem mais vai?',
  'Eu gosto do Pica-Pau e o que rola nessa edição?',
  'O Primeape é um Pokémon macaco do tipo lutador',
  'Casa de leilão famosa vendeu a carta',
  'Qual a melhor estratégia para o deck de água?',
];
ok('mensagens normais de colecionador NÃO são barradas', liberados.every((t) => analisar(t) === null), liberados.filter((t) => analisar(t)).join(' | '));

const barrados = [
  ['me passa seu whatsapp', 'contato'], ['chama no zap', 'contato'], ['w h a t s', 'contato'], ['me segue no insta', 'contato'],
  ['liga 51 99999-8888', 'contato'], ['meu email é joao@gmail.com', 'contato'],
  ['vamos nos encontrar no shopping', 'encontro'], ['vem pra minha casa trocar cartas', 'encontro'], ['onde você mora?', 'encontro'],
  ['manda foto sua', 'dados_pessoais'], ['quantos anos você tem?', 'dados_pessoais'], ['qual é a sua idade', 'dados_pessoais'],
  ['isso é nosso segredo, não conta pra ninguém', 'segredo'], ['não fala pros seus pais', 'segredo'],
  ['manda nudes', 'sexual'], ['n u d e s', 'sexual'],
  ['seu idiota', 'ofensa'], ['você é um iiidiota', 'ofensa'], ['p0rr4 de carta', 'ofensa'], ['vai se f o d e r', 'ofensa'], ['filho da puta', 'ofensa'],
  ['pedofilia', 'tema_sensivel'], ['veja https://golpe.com', 'link'],
];
const falhou = barrados.filter(([t, c]) => analisar(t)?.classe !== c).map(([t, c]) => `${t} (esperado ${c}, veio ${analisar(t)?.classe})`);
ok('pedidos de contato, encontro, foto, segredo, conteúdo sexual e ofensas SÃO barrados (inclusive com truques)', falhou.length === 0, falhou.join(' | '));
ok('a mensagem de segurança orienta a denunciar e cita o Disque 100', analisar('manda foto sua').mensagem.includes('Denunciar') && analisar('manda foto sua').mensagem.includes('Disque 100'));
ok('só pedido de contato/encontro/foto/segredo/sexual é "grave"; ofensa e link não', analisar('manda nudes').grave && analisar('vamos nos encontrar').grave && !analisar('seu idiota').grave && !analisar('veja www.x.com').grave);

/* ---------- integração com o fórum ---------- */
const base = { senha: 'Senha1234', aceiteTermos: true };
const novo = (nome, usuario, nascimento = '1985-03-20') => usuarios.criar({ ...base, nome, email: `${usuario}@teste.local`, usuario, nascimento });
const U = (u) => ({ ...usuarios.buscarPorId(u.id) });
const menor = novo('Menino Teste', 'menino', '2011-02-02');
const adulto = novo('Adulto Teste', 'adultoteste');
const admin = novo('Equipe', 'equipe');
db.prepare('UPDATE usuarios SET admin = 1 WHERE id = ?').run(admin.id);
const topico = (u, titulo, corpo) => forum.criarTopico(U(u), { categoria: 'cartas', titulo, corpo });

const tMenor = topico(menor, 'Dúvida sobre uma carta', 'Tenho uma Blastoise e queria saber quanto vale hoje.');
ok('tópico normal de menor é publicado', Number.isInteger(tMenor));

const e1 = lanca(() => topico(adulto, 'Vamos conversar', 'quem quer trocar? me chama no zap'));
ok('mensagem barrada NÃO é salva e a pessoa recebe o motivo', Boolean(e1) && e1.message.includes('Mensagem não publicada') && forum.listarTopicos({}).total === 1);
ok('a tentativa fica registrada para o moderador', moderacao.bloqueiosRecentes().length === 1 && moderacao.bloqueiosRecentes()[0].classe === 'contato' && moderacao.bloqueiosRecentes()[0].autorFaixa === 'adulto');

const e2 = lanca(() => forum.responder(U(adulto), tMenor, 'qual a sua escola? vamos marcar de nos ver'));
ok('adulto tentando combinar encontro com menor é barrado na resposta', Boolean(e2) && forum.obterTopico(tMenor, { usuario: U(admin) }).respostas.length === 0);
ok('ofensa é barrada mas NÃO conta como risco grave', (() => {
  const antes = db.prepare('SELECT COUNT(*) AS n FROM bloqueios_conteudo WHERE grave = 1').get().n;
  lanca(() => forum.responder(U(adulto), tMenor, 'você é um idiota'));
  return db.prepare('SELECT COUNT(*) AS n FROM bloqueios_conteudo WHERE grave = 1').get().n === antes;
})());

ok('o adulto ainda não foi suspenso (2 graves)', usuarios.buscarPorId(adulto.id).suspenso === 0);
const e3 = lanca(() => forum.responder(U(adulto), tMenor, 'manda foto sua para mim'));
ok('3ª tentativa grave em 24h SUSPENDE a conta automaticamente', usuarios.buscarPorId(adulto.id).suspenso === 1 && e3.message.includes('suspensa'));
ok('as sessões da conta suspensa são encerradas', db.prepare('SELECT COUNT(*) AS n FROM sessoes WHERE usuario_id = ?').get(adulto.id).n === 0);
const urgente = denuncias.listar('aberta').find((d) => d.motivo === 'seguranca_menor');
ok('abre uma denúncia URGENTE do sistema para o moderador', Boolean(urgente) && urgente.alvo_tipo === 'usuario' && urgente.alvo_id === adulto.id && urgente.autor_id === null);
ok('o admin nunca é barrado pelo filtro', !lanca(() => forum.criarTopico(U(admin), { categoria: 'avisos', titulo: 'Regras do fórum', corpo: 'Dúvidas? Fale com a equipe pelo painel.' })) && !lanca(() => forum.criarTopico(U(admin), { categoria: 'avisos', titulo: 'Aviso importante', corpo: 'Não passe whatsapp nem telefone aqui.' })));

/* ---------- eventos passam pelo mesmo filtro ---------- */
const organizador = novo('Organizador', 'organizador');
const e4 = lanca(() => eventos.criar(U(organizador), {
  titulo: 'Torneio de cartas', tipo: 'torneio', uf: 'RS', cidade: 'Porto Alegre', dataInicio: '2026-12-10', descricao: 'Inscrição pelo whatsapp da organização',
}, '2026-10-27'));
ok('evento com pedido de contato na descrição é barrado', Boolean(e4) && e4.message.includes('Mensagem não publicada'));

/* ---------- apelido ---------- */
ok('apelido ofensivo é recusado no cadastro', Boolean(lanca(() => novo('Teste', 'puta123'))) && Boolean(lanca(() => novo('Teste', 'idiota_x'))));
ok('apelido com número de telefone é recusado', Boolean(lanca(() => novo('Teste', 'u11999998888'))));
ok('apelido normal é aceito', !lanca(() => novo('Ana', 'ana_cards')));
ok('trocar o apelido no perfil por um ofensivo também é recusado', Boolean(lanca(() => usuarios.atualizarPerfil(organizador.id, { usuario: 'porra_loka' }))));

/* ---------- denúncia de segurança tira o conteúdo do ar na hora ---------- */
const bia = novo('Bia', 'bia');
const rBia = forum.responder(U(bia), tMenor, 'Acho que vale uns cem reais, depende do estado.');
ok('antes da denúncia a resposta está visível', forum.obterTopico(tMenor, { usuario: U(menor) }).respostas.some((r) => r.id === rBia));
const d = denuncias.criar({ autorId: menor.id, alvoTipo: 'resposta', alvoId: rBia, motivo: 'seguranca_menor', detalhe: 'pediu meu telefone' });
ok('denúncia "contato inadequado com menor" OCULTA o conteúdo imediatamente', d.ocultado === true && !forum.obterTopico(tMenor, { usuario: U(menor) }).respostas.some((r) => r.id === rBia));
ok('o moderador ainda enxerga o conteúdo oculto, marcado', forum.obterTopico(tMenor, { usuario: U(admin) }).respostas.find((r) => r.id === rBia)?.oculto === true);

const tBia = topico(bia, 'Outro tópico qualquer', 'Falando de cartas de água e de fogo no jogo.');
denuncias.criar({ autorId: menor.id, alvoTipo: 'topico', alvoId: tBia, motivo: 'seguranca_menor' });
ok('vale também para tópico', forum.obterTopico(tBia, { usuario: U(menor) }) === null);
const tTrote = topico(bia, 'Tópico denunciado por outro motivo', 'Conversa comum sobre o jogo de cartas.');
denuncias.criar({ autorId: menor.id, alvoTipo: 'topico', alvoId: tTrote, motivo: 'outro' });
ok('denúncia comum NÃO oculta (só a de segurança de menor, para não virar arma de trote)', forum.obterTopico(tTrote, { usuario: U(menor) }) !== null);

const fila = denuncias.listar('aberta');
ok('a fila mostra as urgentes primeiro', fila[0].motivo === 'seguranca_menor' && fila.findIndex((x) => x.motivo === 'outro') > fila.findLastIndex((x) => x.motivo === 'seguranca_menor'));
const resumo = moderacao.resumoParaModerador();
ok('o resumo do moderador conta abertas, urgentes e tentativas graves', resumo.denunciasAbertas === fila.length && resumo.denunciasUrgentes >= 3 && resumo.bloqueiosGraves24h >= 3);

/* ---------- painel: mensagens recentes ---------- */
// um adulto (que não foi suspenso) responde em tópico de menor: tem que ficar em destaque
const carlos = novo('Carlos', 'carlos');
forum.responder(U(carlos), tMenor, 'Eu pagaria uns 80 reais nessa carta, depende da condição.');
const recentes = moderacao.mensagensRecentes();
const dest = recentes.find((m) => m.autor === 'carlos');
ok('o painel destaca "adulto respondendo em tópico de menor"', dest.adultoEmTopicoDeMenor === true && dest.autorFaixa === 'adulto');
ok('resposta de menor em tópico de menor NÃO é destacada', !recentes.find((m) => m.tipo === 'topico' && m.autor === 'menino').adultoEmTopicoDeMenor);
ok('o painel traz mensagens ocultas também (o moderador precisa ver)', recentes.some((m) => m.oculto));
ok('o painel mostra o nome de usuário e a faixa de idade, não a data de nascimento', !JSON.stringify(recentes).includes('2011-02-02'));

/* ---------- só adulto é administrador ---------- */
ok('menor de idade não vira administrador', Boolean(lanca(() => usuarios.definirAdmin(menor.id, true))));
const semData = novo('Sem Data', 'semdata');
db.prepare('UPDATE usuarios SET nascimento = NULL WHERE id = ?').run(semData.id);
ok('conta sem data de nascimento não vira administradora', Boolean(lanca(() => usuarios.definirAdmin(semData.id, true))));
ok('adulto vira administrador normalmente', !lanca(() => usuarios.definirAdmin(carlos.id, true)));
ok('o administrador não pode ser suspenso por engano (nem pela suspensão automática)', Boolean(lanca(() => usuarios.suspender(carlos.id, 'x'))));

/* ---------- retenção dos registros ---------- */
db.prepare("UPDATE bloqueios_conteudo SET criado_em = datetime('now', '-100 days') WHERE id = (SELECT MIN(id) FROM bloqueios_conteudo)").run();
const antes = db.prepare('SELECT COUNT(*) AS n FROM bloqueios_conteudo').get().n;
ok('registros de mensagens bloqueadas com mais de 90 dias são apagados', moderacao.apagarBloqueiosAntigos() === 1 && db.prepare('SELECT COUNT(*) AS n FROM bloqueios_conteudo').get().n === antes - 1);

db.close();
try {
  fs.rmSync(pastaTemp, { recursive: true, force: true });
} catch {
  // pasta fica para trás em %TEMP% — sem impacto no resultado do teste.
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nOK — tudo passou\n');
process.exit(falhas > 0 ? 1 : 0);
