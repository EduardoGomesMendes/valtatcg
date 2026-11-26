import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'valtatcg-teste-'));
process.env.DATA_DIR = pastaTemp;
process.env.PORT = '0';

const { db } = await import('../src/db/index.js');
const { criarServidor } = await import('../src/api/servidor.js');
const { config } = await import('../src/config.js');
const { modoDeInstalacao } = await import('../public/assets/js/app-instalavel.js');

let falhas = 0;
function ok(nome, condicao, detalhe = '') {
  console.log(`${condicao ? '  OK  ' : ' FALHA'} ${nome}${detalhe ? ` → ${detalhe}` : ''}`);
  if (!condicao) falhas += 1;
}

const servidor = criarServidor().listen(0);
await new Promise((r) => servidor.once('listening', r));
const base = `http://127.0.0.1:${servidor.address().port}`;
const publico = path.join(config.raiz, 'public');

console.log('\n--- app: manifesto e ícones (sem login) ---');
const rm = await fetch(`${base}/manifest.webmanifest`);
ok('o manifesto abre sem login, com o tipo certo', rm.status === 200 && (rm.headers.get('content-type') ?? '').includes('manifest+json'), rm.headers.get('content-type'));
const m = await rm.json();
ok('abre como app, direto na coleção, com nome', m.display === 'standalone' && m.start_url === '/colecao/' && m.short_name === 'ValtaTCG' && m.scope === '/');
ok('o manifesto não menciona o fórum (é público)', !/f[oó]rum/i.test(JSON.stringify(m)));
ok('tem ícone 192, 512 e um para recorte (Android)', ['192x192', '512x512'].every((t) => m.icons.some((i) => i.sizes === t && i.purpose === 'any')) && m.icons.some((i) => i.purpose === 'maskable'));

/** Largura e altura direto do cabeçalho do PNG. */
async function medidasDoPng(url) {
  const r = await fetch(`${base}${url}`);
  const b = Buffer.from(await r.arrayBuffer());
  if (r.status !== 200 || b.subarray(1, 4).toString() !== 'PNG') return null;
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
}
for (const icone of m.icons) {
  ok(`${icone.src} é um PNG de ${icone.sizes} de verdade`, (await medidasDoPng(icone.src)) === icone.sizes);
}
ok('o ícone do iPhone é um PNG 180x180', (await medidasDoPng('/assets/img/apple-touch-icon.png')) === '180x180');
for (const atalho of m.shortcuts) {
  ok(`o atalho "${atalho.name}" aponta para página que existe`, fs.existsSync(path.join(publico, atalho.url, 'index.html')));
}

console.log('\n--- app: todas as páginas ---');
const paginas = [];
(function andar(pasta) {
  for (const item of fs.readdirSync(pasta, { withFileTypes: true })) {
    const caminho = path.join(pasta, item.name);
    if (item.isDirectory() && item.name !== 'vendor') andar(caminho);
    else if (item.name === 'index.html') paginas.push(caminho);
  }
})(publico);
const semAlgo = paginas.filter((p) => {
  const t = fs.readFileSync(p, 'utf8');
  return !(t.includes('rel="manifest"') && t.includes('name="theme-color"') && t.includes('rel="apple-touch-icon"'));
});
ok(`as ${paginas.length} páginas têm manifesto, cor e ícone do iPhone`, paginas.length >= 20 && semAlgo.length === 0, semAlgo.join(', '));
const home = await (await fetch(`${base}/`)).text();
ok('a home tem o botão de instalar, escondido até dar para instalar', /class="[^"]*hidden[^"]*" data-instalar-app/.test(home));

console.log('\n--- app: oferta de instalação ---');
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
ok('com convite do navegador, oferece o convite', modoDeInstalacao({ temConvite: true, instalado: false }) === 'convite');
ok('iPhone sem convite: passo a passo', modoDeInstalacao({ temConvite: false, instalado: false, userAgent: IPHONE }) === 'ios');
ok('iPad que se diz Mac é pego pela tela de toque', modoDeInstalacao({ temConvite: false, instalado: false, userAgent: MAC, plataforma: 'MacIntel', toques: 5 }) === 'ios');
ok('Mac de verdade não ganha passo a passo de iPhone', modoDeInstalacao({ temConvite: false, instalado: false, userAgent: MAC, plataforma: 'MacIntel', toques: 0 }) === null);
ok('já instalado não oferece nada', modoDeInstalacao({ temConvite: true, instalado: true, userAgent: IPHONE }) === null);
ok('navegador sem como instalar não mostra botão', modoDeInstalacao({ temConvite: false, instalado: false, userAgent: 'Mozilla/5.0 (Android 14) Firefox/130' }) === null);

console.log('\n--- app: service worker (simulado) ---');
const rs = await fetch(`${base}/sw.js`);
ok('o sw.js é servido como JavaScript, na raiz', rs.status === 200 && (rs.headers.get('content-type') ?? '').includes('javascript'));
const fonte = await rs.text();

const ORIGEM = 'https://valtatcg.com.br';
const ouvintes = {};
const guardado = new Map();
let semRede = false;
const idasARede = [];
const contexto = {
  URL,
  Promise,
  self: { location: { origin: ORIGEM }, addEventListener: (tipo, f) => { ouvintes[tipo] = f; }, skipWaiting() {}, clients: { claim: async () => {} } },
  caches: {
    open: async () => ({ addAll: async (urls) => urls.forEach((u) => guardado.set(u, `guardado:${u}`)) }),
    keys: async () => ['velho', 'valtatcg-sem-internet-v1'],
    delete: async (nome) => { guardado.set(`apagado:${nome}`, true); return true; },
    match: async (url) => guardado.get(url),
  },
  fetch: async (pedido) => {
    idasARede.push(pedido.url);
    if (semRede) throw new TypeError('Failed to fetch');
    return `rede:${pedido.url}`;
  },
};
vm.runInNewContext(fonte, contexto);

let espera;
ouvintes.install({ waitUntil: (p) => { espera = p; } });
await espera;
ouvintes.activate({ waitUntil: (p) => { espera = p; } });
await espera;
const guardados = [...guardado.keys()].filter((k) => !k.startsWith('apagado:'));
ok('guarda só a tela sem internet e os arquivos dela', guardados.length === 4 && guardados.includes('/offline.html') && guardados.every((u) => !u.startsWith('/api') && u !== '/colecao/'), guardados.join(', '));
ok('apaga só as versões antigas guardadas', guardado.has('apagado:velho') && !guardado.has('apagado:valtatcg-sem-internet-v1'));
for (const arquivo of guardados) {
  ok(`o arquivo guardado ${arquivo} existe`, fs.existsSync(path.join(publico, arquivo)));
}

async function pedir(caminho, { modo = 'cors', metodo = 'GET', origem = ORIGEM } = {}) {
  let resposta;
  let interceptou = false;
  ouvintes.fetch({
    request: { url: `${origem}${caminho}`, method: metodo, mode: modo },
    respondWith: (p) => { interceptou = true; resposta = p; },
  });
  return { interceptou, resposta: await resposta };
}

ok('a API nunca é interceptada (dado da conta não passa pelo cache)', !(await pedir('/api/colecao')).interceptou && !(await pedir('/api/colecao/resumo')).interceptou);
ok('envio de dados (POST) nunca é interceptado', !(await pedir('/api/colecao', { metodo: 'POST' })).interceptou);
ok('imagens e fontes de outros sites não são interceptadas', !(await pedir('/sv/001.png', { origem: 'https://images.scrydex.com' })).interceptou);
ok('os scripts do app vêm sempre direto da rede', !(await pedir('/assets/js/colecao.js')).interceptou);
const comRede = await pedir('/colecao/', { modo: 'navigate' });
ok('com internet, a página vem da rede', comRede.interceptou && comRede.resposta === `rede:${ORIGEM}/colecao/`);
semRede = true;
const semInternet = await pedir('/colecao/', { modo: 'navigate' });
ok('sem internet, aparece a tela "sem internet"', semInternet.resposta === 'guardado:/offline.html', String(semInternet.resposta));
ok('sem internet, o estilo da tela também vem do guardado', (await pedir('/assets/css/project/project.css')).resposta === 'guardado:/assets/css/project/project.css');

const offline = await (await fetch(`${base}/offline.html`)).text();
ok('a tela sem internet não usa script nem estilo embutido (a CSP bloquearia)', !/<script|<style|style=/i.test(offline));
ok('a tela sem internet não menciona o fórum', !/f[oó]rum/i.test(offline));

servidor.close();
db.close();
try {
  fs.rmSync(pastaTemp, { recursive: true, force: true });
} catch {
  // pasta fica para trás em %TEMP% — sem impacto no resultado do teste.
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nOK — tudo passou\n');
process.exit(falhas > 0 ? 1 : 0);
