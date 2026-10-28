import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'valtatcg-teste-'));
Object.assign(process.env, {
  DATA_DIR: pastaTemp, PORT: '0', EMAIL_MODO: 'memoria', CADASTRO_CHECAR_DOMINIO: 'nao', CADASTRO_PEDIDOS_POR_IP_HORA: '1000',
});

const { db } = await import('../src/db/index.js');
const { config } = await import('../src/config.js');
const { criarServidor } = await import('../src/api/servidor.js');
const { caixaDeSaida } = await import('../src/email/enviador.js');
const forum = await import('../src/comunidade/forum.repo.js');

let falhas = 0;
function ok(nome, condicao, detalhe = '') {
  console.log(`${condicao ? '  OK  ' : ' FALHA'} ${nome}${detalhe ? ` → ${detalhe}` : ''}`);
  if (!condicao) falhas += 1;
}

const servidor = criarServidor().listen(0);
await new Promise((r) => servidor.once('listening', r));
const base = `http://127.0.0.1:${servidor.address().port}/api`;

class Cli {
  cookie = '';
  async req(metodo, caminho, corpo) {
    const r = await fetch(`${base}${caminho}`, {
      method: metodo,
      headers: { 'content-type': 'application/json', ...(this.cookie ? { cookie: this.cookie } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const sc = r.headers.get('set-cookie');
    if (sc) this.cookie = sc.split(';')[0];
    return { s: r.status, j: await r.json().catch(() => ({})) };
  }
  get(p) { return this.req('GET', p); }
  post(p, b = {}) { return this.req('POST', p, b); }
}
const anosAtras = (a) => `${new Date().getFullYear() - a}-03-15`;
async function conta(nome, email, usuario, nascimento = '1990-03-15') {
  const c = new Cli();
  await c.post('/cadastro', { nome, email, usuario, nascimento, aceiteTermos: true });
  const token = /confirmar\/\?t=([\w-]+)/.exec(caixaDeSaida.at(-1).texto)[1];
  const f = await c.post('/cadastro/concluir', { token, senha: 'Senha1234' });
  return { c, id: f.j.usuario.id };
}
const V = forum.VERSAO_REGRAS;
const topico = (c, extra = {}) => c.post('/forum/topicos', { categoria: 'cartas', titulo: 'Quanto vale a Charizard base?', corpo: 'Vi uma Charizard holo da coleção base e queria saber o valor.', ...extra });

console.log('\n--- termo de aceite do fórum ---');

const ana = await conta('Ana Lima', 'ana@exemplo.com.br', 'ana_aceite');
const admin = await conta('Admin', 'admin@exemplo.com.br', 'admin_aceite');
db.prepare('UPDATE usuarios SET admin = 1 WHERE id = ?').run(admin.id);

/* ---------- antes de aceitar ---------- */
let r = await ana.c.get('/forum/categorias');
ok('conta nova: o fórum informa que falta aceitar as regras', r.j.permissao?.ok === false && r.j.permissao?.precisaAceitar === true && r.j.regras?.aceito === false, JSON.stringify(r.j.permissao));
ok('...e entrega a versão das regras que a tela vai mostrar', r.j.regras?.versao === V);
ok('ler o fórum continua liberado sem aceite', (await ana.c.get('/forum/topicos')).s === 200 && (await ana.c.get('/forum/categorias')).s === 200);

r = await topico(ana.c);
ok('criar tópico sem aceite é barrado com 403 e o sinal para a tela', r.s === 403 && r.j.precisaAceitarRegras === true, `${r.s} ${JSON.stringify(r.j)}`);
const tAdmin = (await admin.c.post('/forum/topicos', { categoria: 'avisos', titulo: 'Bem-vindos ao fórum', corpo: 'Leiam as regras antes de escrever.' })).j.id;
ok('a equipe (admin) escreve sem passar pelo aceite', Number.isInteger(tAdmin));
r = await ana.c.post(`/forum/topicos/${tAdmin}/respostas`, { corpo: 'Olá, tudo bem com vocês?' });
ok('responder sem aceite também é barrado (403)', r.s === 403 && r.j.precisaAceitarRegras === true);
ok('nada foi gravado por tentativas barradas', db.prepare('SELECT COUNT(*) AS n FROM forum_topicos WHERE autor_id = ?').get(ana.id).n === 0);

/* ---------- aceitar ---------- */
r = await ana.c.post('/forum/aceitar', { versao: V });
ok('aceitar sem marcar "li e concordo" é recusado', r.s === 400, JSON.stringify(r.j));
r = await ana.c.post('/forum/aceitar', { aceito: true });
ok('aceitar sem informar a versão que leu é recusado', r.s === 400);
r = await ana.c.post('/forum/aceitar', { aceito: true, versao: '1999-01-01' });
ok('aceitar uma versão antiga das regras é recusado', r.s === 400 && /atualizadas/.test(r.j.erro ?? ''), JSON.stringify(r.j));
ok('as tentativas recusadas não gravam aceite', db.prepare('SELECT aceite_forum_versao FROM usuarios WHERE id = ?').get(ana.id).aceite_forum_versao === null);

r = await ana.c.post('/forum/aceitar', { aceito: true, versao: V });
ok('aceitar com a versão em vigor funciona', r.s === 200 && r.j.ok === true, JSON.stringify(r.j));
const linha = db.prepare('SELECT aceite_forum_em, aceite_forum_versao FROM usuarios WHERE id = ?').get(ana.id);
ok('o aceite guarda data/hora e a versão', Boolean(linha.aceite_forum_em) && linha.aceite_forum_versao === V, JSON.stringify(linha));
r = await ana.c.get('/forum/categorias');
ok('depois de aceitar, a permissão libera e o aceite consta', r.j.permissao?.ok === true && r.j.regras?.aceito === true);
r = await topico(ana.c);
ok('agora o tópico é publicado', r.s === 201, `${r.s} ${JSON.stringify(r.j)}`);
const idTopico = r.j.id;
ok('e a resposta também', (await ana.c.post(`/forum/topicos/${idTopico}/respostas`, { corpo: 'Complementando: a carta está em ótimo estado.' })).s === 201);

/* ---------- regras mudaram: aceita de novo ---------- */
db.prepare("UPDATE usuarios SET aceite_forum_versao = '1999-01-01' WHERE id = ?").run(ana.id);
r = await ana.c.get('/forum/categorias');
ok('quem aceitou uma versão antiga volta a precisar aceitar', r.j.permissao?.precisaAceitar === true && r.j.regras?.aceito === false);
ok('...e fica sem escrever até aceitar de novo', (await topico(ana.c, { titulo: 'Outro tópico de teste' })).s === 403);
ok('...mas continua lendo', (await ana.c.get(`/forum/topicos/${idTopico}`)).s === 200);
await ana.c.post('/forum/aceitar', { aceito: true, versao: V });
ok('aceitando a versão nova, volta a escrever', (await topico(ana.c, { titulo: 'Outro tópico de teste' })).s === 201);

/* ---------- menor de idade ---------- */
const hugo = await conta('Hugo Menor', 'hugo@exemplo.com.br', 'hugo_aceite', anosAtras(15));
ok('menor também precisa aceitar antes de escrever', (await topico(hugo.c)).s === 403);
r = await hugo.c.post('/forum/aceitar', { aceito: true, versao: V });
ok('menor SEM declarar a ciência do responsável não aceita', r.s === 400 && /responsável/.test(r.j.erro ?? ''), JSON.stringify(r.j));
ok('...e nada foi gravado', db.prepare('SELECT aceite_forum_versao FROM usuarios WHERE id = ?').get(hugo.id).aceite_forum_versao === null);
r = await hugo.c.post('/forum/aceitar', { aceito: true, versao: V, ciencia: true });
ok('menor declarando a ciência do responsável aceita', r.s === 200, JSON.stringify(r.j));
ok('...e passa a escrever (regra atual: menores escrevem)', (await topico(hugo.c, { titulo: 'Sou novo nas cartas' })).s === 201);

/* ---------- sem data de nascimento não aceita ---------- */
const bia = await conta('Bia Souza', 'bia@exemplo.com.br', 'bia_aceite');
db.prepare('UPDATE usuarios SET nascimento = NULL WHERE id = ?').run(bia.id);
r = await bia.c.post('/forum/aceitar', { aceito: true, versao: V });
ok('sem data de nascimento informada ninguém aceita (a idade define as regras)', r.s === 400 && /nascimento/.test(r.j.erro ?? ''), JSON.stringify(r.j));

/* ---------- novas regras no filtro: dinheiro e negócio ---------- */
r = await topico(ana.c, { titulo: 'Troco carta rara aqui', corpo: 'Me manda o pix que eu envio a carta pelo correio hoje.' });
ok('pedir/passar Pix é barrado pelo filtro', r.s === 400 && /Pix/.test(r.j.erro ?? ''), JSON.stringify(r.j));
r = await topico(ana.c, { titulo: 'Dados para pagamento', corpo: 'Faça a transferência bancária para a minha conta corrente.' });
ok('dados bancários são barrados', r.s === 400);
for (let i = 0; i < 4; i += 1) await topico(ana.c, { titulo: `Tentativa ${i} de Pix`, corpo: 'Minha chave pix é a do meu cadastro, pode pagar.' });
ok('Pix NÃO conta como infração grave: 4 tentativas não suspendem a conta', db.prepare('SELECT suspenso FROM usuarios WHERE id = ?').get(ana.id).suspenso === 0);
ok('conversa normal sobre preço continua passando', (await ana.c.post(`/forum/topicos/${idTopico}/respostas`, { corpo: 'Uma Charizard dessas costuma sair por uns 500 reais.' })).s === 201);

/* ---------- as telas e os documentos ---------- */
const lerPagina = (arquivo) => fs.readFileSync(path.join(config.raiz, 'public', arquivo), 'utf8');
const htmlForum = lerPagina('forum/index.html');
const jsForum = lerPagina('assets/js/forum.js');
const idsDoHtml = new Set([...htmlForum.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const idsUsados = [...jsForum.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);
ok('todo elemento que o forum.js procura existe na página (inclui o termo de aceite)', idsUsados.every((i) => idsDoHtml.has(i)), idsUsados.filter((i) => !idsDoHtml.has(i)).join(','));
ok('a página do fórum traz o termo de aceite com a caixa de confirmação', htmlForum.includes('id="cartao-aceite"') && htmlForum.includes('id="aceite-regras"') && htmlForum.includes('Termo de aceite do fórum'));
ok('o termo de aceite fala de negócio e de Pix', /compra, venda ou troca/.test(htmlForum) && /Pix/.test(htmlForum));
ok('a página do tópico leva quem não aceitou ao termo', lerPagina('forum/topico/index.html').includes('href="/forum/#aceite"'));
const termos = lerPagina('termos/index.html');
ok('os Termos descrevem o termo de aceite e as novas regras', termos.includes('Termo de aceite.') && termos.includes('Sem compra, venda ou troca') && termos.includes('Jogo limpo') && termos.includes('mensagens privadas'));
ok('a Política informa que guarda o registro do aceite', lerPagina('privacidade/index.html').includes('registro do seu aceite das regras'));

servidor.close();
db.close();
try {
  fs.rmSync(pastaTemp, { recursive: true, force: true });
} catch {
  // pasta fica para trás em %TEMP% — sem impacto no resultado do teste.
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nOK — tudo passou\n');
process.exit(falhas > 0 ? 1 : 0);
