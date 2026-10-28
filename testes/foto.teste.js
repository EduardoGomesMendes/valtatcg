import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'valtatcg-teste-'));
process.env.DATA_DIR = pastaTemp;
process.env.PORT = '0';

const { db } = await import('../src/db/index.js');
const { criarServidor } = await import('../src/api/servidor.js');
const usuarios = await import('../src/auth/usuarios.repo.js');
const { interpretarBusca, interpretarRodape, interpretarTopo, pontuarNome, ordenarPorNome, recorteDaGuia } =
  await import('../public/assets/js/leitura-carta.js');

let falhas = 0;
function ok(nome, condicao, detalhe = '') {
  console.log(`${condicao ? '  OK  ' : ' FALHA'} ${nome}${detalhe ? ` → ${detalhe}` : ''}`);
  if (!condicao) falhas += 1;
}

console.log('\n--- foto da carta: número impresso ---');
ok('025/165 vira número e total', JSON.stringify(interpretarRodape('025/165')) === '{"numero":"025","total":"165"}');
ok('acha o número no meio de lixo do rodapé', interpretarRodape('Illus. Mitsuhiro Arita  © 2023 Pokémon  025 / 165 C')?.total === '165');
ok('barra lida como "I" ainda vale entre dígitos', interpretarRodape('025I165')?.numero === '025');
ok('barra lida como "|" ainda vale', interpretarRodape('4 | 102')?.total === '102');
ok('raridade secreta (número maior que o total) é aceita', interpretarRodape('199/165')?.numero === '199');
ok('número absurdo é recusado', interpretarRodape('900/165') === null);
ok('total pequeno demais é recusado (ano, preço…)', interpretarRodape('1/5') === null);
ok('texto sem número devolve null', interpretarRodape('Pikachu ex Basic') === null && interpretarRodape('') === null && interpretarRodape(undefined) === null);
ok('promo SWSH123 vira código sem total', JSON.stringify(interpretarRodape('SWSH 123')) === '{"numero":"SWSH123","total":""}');

console.log('\n--- foto da carta: nome ---');
ok('nome simples', interpretarTopo('Pikachu')?.chave === 'Pikachu');
ok('tira "Basic" e "HP 60" da linha', interpretarTopo('Basic Pikachu HP 60')?.nome === 'Pikachu');
ok('carta em português: "Básico", "PS"', interpretarTopo('Básico Pikachu PS 60')?.chave === 'Pikachu');
ok('mantém o "ex" no nome e a chave é a palavra longa', (() => { const t = interpretarTopo('Pikachu ex HP 190'); return t?.nome === 'Pikachu ex' && t?.chave === 'Pikachu'; })());
ok('lixo curto no começo não vira a chave', interpretarTopo('Ba Charizard HP 120')?.chave === 'Charizard');
ok('a linha "Evolui de" não vence o nome (cartas antigas)', interpretarTopo('Stage 2 Charizard HP 120\nEvolves from Charmeleon. Put Charizard on the Charmeleon card')?.chave === 'Charizard');
ok('pula a linha de lixo e acha o nome na seguinte', interpretarTopo('  \n12\nMewtwo')?.chave === 'Mewtwo');
ok('nome com apóstrofo e hífen continua inteiro', interpretarTopo("Farfetch'd")?.chave === "Farfetch'd" && interpretarTopo('Ho-Oh ex')?.chave === 'Ho-Oh');
ok('nada que pareça nome devolve null', interpretarTopo('12 34\n--') === null && interpretarTopo('') === null && interpretarTopo(null) === null);
ok('só palavras do topo (sem nome) devolve null', interpretarTopo('Basic HP 70') === null);

console.log('\n--- foto da carta: ordenar candidatas pelo nome lido ---');
ok('começa com o nome vale mais que contém', pontuarNome('Pikachu', 'Pika') > pontuarNome('Detective Pikachu', 'Pika'));
ok('ignora acento e maiúscula', pontuarNome('Pokémon', 'pokemon') === 3);
ok('uma letra errada ainda pontua', pontuarNome('Charizard', 'Charizrd') > 0.5);
ok('nome sem relação pontua perto de zero', pontuarNome('Maractus', 'ria') < 0.3);
const cartas = [{ name: 'Raichu' }, { name: 'Pikachu' }, { name: 'Pikachu ex' }];
ok('ordenarPorNome põe a mais parecida primeiro', ordenarPorNome(cartas, 'Pikachu')[0].name === 'Pikachu');
ok('sem pista a ordem original fica', ordenarPorNome(cartas, '')[0].name === 'Raichu');
ok('empate mantém a ordem da API', ordenarPorNome([{ name: 'Aaa' }, { name: 'Bbb' }], 'zzz')[0].name === 'Aaa');

console.log('\n--- campo de busca: nome, número ou os dois ---');
const b = (t) => JSON.stringify(interpretarBusca(t));
ok('só nome', b('pikachu') === '{"nome":"pikachu","numero":"","total":""}');
ok('nome com várias palavras', b('Pikachu V') === '{"nome":"Pikachu V","numero":"","total":""}');
ok('número com total', b('025/165') === '{"nome":"","numero":"025","total":"165"}');
ok('número sozinho', b('25') === '{"nome":"","numero":"25","total":""}');
ok('nome + número', b('pikachu 25') === '{"nome":"pikachu","numero":"25","total":""}');
ok('número antes do nome', b('25/165 pikachu') === '{"nome":"pikachu","numero":"25","total":"165"}');
ok('espaços sobrando não atrapalham', b('  pikachu   25/165  ') === '{"nome":"pikachu","numero":"25","total":"165"}');
ok('promo SWSH123 e swsh-123', b('SWSH123') === '{"nome":"","numero":"SWSH123","total":""}' && b('swsh-123') === '{"nome":"","numero":"SWSH123","total":""}');
ok('nome com dígito colado não vira número ("Porygon2")', b('Porygon2') === '{"nome":"Porygon2","numero":"","total":""}');
ok('número grande demais (ano) não vira número', b('2023') === '{"nome":"2023","numero":"","total":""}');
ok('vazio não quebra', b('') === '{"nome":"","numero":"","total":""}' && b(undefined) === '{"nome":"","numero":"","total":""}');

console.log('\n--- câmera: quadro-guia → região do vídeo (object-fit: cover) ---');
{
  // Vídeo 1080x1920 numa tela 375x812: escala 0,4229; sobra de 41 px de cada lado na horizontal.
  const r = recorteDaGuia({
    video: { largura: 1080, altura: 1920 },
    caixa: { largura: 375, altura: 812 },
    guia: { x: 41.25, y: 169.2, largura: 292.5, altura: 408.6 },
  });
  ok('largura do recorte é a do quadro dividida pela escala', Math.abs(r.largura - 292.5 / (812 / 1920)) < 0.01, r.largura.toFixed(1));
  ok('o recorte cabe dentro do vídeo', r.x >= 0 && r.y >= 0 && r.x + r.largura <= 1080 && r.y + r.altura <= 1920, JSON.stringify(r));
  ok('o recorte mantém o formato da carta (63x88)', Math.abs(r.largura / r.altura - 63 / 88) < 0.01, (r.largura / r.altura).toFixed(3));
  ok('quadro centrado na tela dá recorte centrado no vídeo', Math.abs(r.x + r.largura / 2 - 540) < 1);

  // Vídeo largo numa tela estreita: o corte é nas laterais, a conta tem que acompanhar.
  const larg = recorteDaGuia({ video: { largura: 1920, altura: 1080 }, caixa: { largura: 400, altura: 800 }, guia: { x: 0, y: 0, largura: 400, altura: 800 } });
  ok('vídeo deitado: a tela inteira mostra só a faixa do meio', Math.abs(larg.largura - 540) < 0.01 && Math.abs(larg.x - 690) < 0.01 && Math.abs(larg.altura - 1080) < 0.01, JSON.stringify(larg));
}

console.log('\n--- servidor: busca por número e arquivos do leitor ---');
const servidor = criarServidor().listen(0);
await new Promise((r) => servidor.once('listening', r));
const base = `http://127.0.0.1:${servidor.address().port}`;

const u = usuarios.criar({ nome: 'Ana', email: 'ana@teste.local', usuario: 'ana_cards', senha: 'Senha1234', nascimento: '1990-01-01', aceiteTermos: true });
const cookie = `valtatcg_sessao=${encodeURIComponent(usuarios.abrirSessao(u.id))}`;
const pedir = (caminho) => fetch(`${base}${caminho}`, { headers: { cookie } });

// Entradas inválidas são barradas antes de montar a consulta da API externa (nada vai para a rede).
for (const ruim of ['25%20or%20name:*', '12345', 'abc', '25;', '%3Cscript%3E', 'ABCDEFG1']) {
  const r = await pedir(`/api/cartas/buscar?numero=${ruim}&total=165`);
  ok(`numero "${decodeURIComponent(ruim)}" é recusado com 400`, r.status === 400, String(r.status));
}
const totalRuim = await pedir('/api/cartas/buscar?numero=25&total=16x5');
ok('total inválido é recusado com 400', totalRuim.status === 400, String(totalRuim.status));
ok('sem login a busca por número também exige sessão', (await fetch(`${base}/api/cartas/buscar?numero=25&total=165`)).status === 401);

const csp = (await pedir('/buscar/')).headers.get('content-security-policy') ?? '';
const diretivaScript = csp.split(';').map((s) => s.trim()).find((s) => s.startsWith('script-src')) ?? '';
ok("a CSP libera compilar WebAssembly ('wasm-unsafe-eval')", diretivaScript.includes("'wasm-unsafe-eval'"), diretivaScript);
ok("a CSP continua sem 'unsafe-eval' nem 'unsafe-inline' nos scripts", !/'unsafe-eval'|'unsafe-inline'/.test(diretivaScript));
ok('a CSP não abriu a rede para terceiros', csp.includes("connect-src 'self'") && !/https?:\/\/(?!fonts|images)/.test(csp.replace(/https:\/\/(fonts\.[a-z.]+|images\.[a-z.]+)/g, '')));

for (const arquivo of [
  'tesseract.min.js',
  'worker.min.js',
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'lang/eng.traineddata.gz',
]) {
  const r = await pedir(`/vendor/tesseract/${arquivo}`);
  const tamanho = (await r.arrayBuffer()).byteLength;
  ok(`o leitor serve ${arquivo}`, r.status === 200 && tamanho > 50_000, `${r.status} ${tamanho} bytes`);
}
for (const arquivo of ['foto-carta.js', 'camera-carta.js', 'leitura-carta.js']) {
  const r = await pedir(`/assets/js/${arquivo}`);
  ok(`${arquivo} é servido como JavaScript`, r.status === 200 && (r.headers.get('content-type') ?? '').includes('javascript'));
}
const html = await (await pedir('/buscar/')).text();
ok('a tela de busca tem o botão da câmera e o seletor de foto', html.includes('id="btn-foto"') && html.includes('id="entrada-foto"'));
ok('o seletor aceita só imagem', /id="entrada-foto"/.test(html) && html.includes('accept="image/*"'));

servidor.close();
db.close();
try {
  fs.rmSync(pastaTemp, { recursive: true, force: true });
} catch {
  // pasta fica para trás em %TEMP% — sem impacto no resultado do teste.
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nOK — tudo passou\n');
process.exit(falhas > 0 ? 1 : 0);
