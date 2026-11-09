import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'valtatcg-teste-'));
Object.assign(process.env, {
  DATA_DIR: pastaTemp, PORT: '0', EMAIL_MODO: 'memoria', CADASTRO_CHECAR_DOMINIO: 'nao', CADASTRO_PEDIDOS_POR_IP_HORA: '1000',
  DIAS_DE_TESTE: '7', // as contas daqui cadastram várias cartas: o limite diário do grátis é testado em plano-gratis.teste.js
});

const { db } = await import('../src/db/index.js');
const { config } = await import('../src/config.js');
const { criarServidor } = await import('../src/api/servidor.js');
const { caixaDeSaida } = await import('../src/email/enviador.js');
const cartasRepo = await import('../src/portfolio/cartas.repo.js');
const colecaoRepo = await import('../src/portfolio/colecao.repo.js');
const precosRepo = await import('../src/portfolio/precos.repo.js');
const estados = await import('../src/portfolio/estados.js');
const { calcularResumo } = await import('../src/portfolio/resumo.js');

let falhas = 0;
function ok(nome, condicao, detalhe = '') {
  console.log(`${condicao ? '  OK  ' : ' FALHA'} ${nome}${detalhe ? ` → ${detalhe}` : ''}`);
  if (!condicao) falhas += 1;
}
const perto = (a, b) => Math.abs(a - b) < 1e-6;

console.log('\n--- estados da carta, preço por variante e busca ---');

/* ---------- a escala de estados ---------- */
ok('a escala tem os seis estados, na ordem do melhor para o pior', estados.listarEstados().map((e) => e.valor).join(',') === 'Mint,Near Mint,Lightly Played,Moderately Played,Heavily Played,Damaged');
ok('Mint e Near Mint valem o preço de mercado (Mint não é degrau de preço)', estados.fatorDoEstado('Mint') === 1 && estados.fatorDoEstado('Near Mint') === 1);
ok('os fatores descem a cada estado', estados.fatorDoEstado('Lightly Played') > estados.fatorDoEstado('Moderately Played')
  && estados.fatorDoEstado('Moderately Played') > estados.fatorDoEstado('Heavily Played') && estados.fatorDoEstado('Heavily Played') > estados.fatorDoEstado('Damaged'));
ok('os fatores padrão são os pontos médios dos guias (80 / 60 / 35 / 15 %)', [0.8, 0.6, 0.35, 0.15].every((f, i) => perto(estados.fatorDoEstado(['Lightly Played', 'Moderately Played', 'Heavily Played', 'Damaged'][i]), f)));
ok('sem estado, ou estado desconhecido, não há desconto', estados.fatorDoEstado(null) === 1 && estados.fatorDoEstado('qualquer coisa') === 1);
ok('maiúscula/minúscula não importa', estados.estadoCanonico('near mint') === 'Near Mint' && estados.estadoCanonico('  DAMAGED ') === 'Damaged');
ok('os nomes antigos viram os da escala nova', estados.estadoCanonico('Lacrado') === 'Mint' && estados.estadoCanonico('Excelente') === 'Near Mint'
  && estados.estadoCanonico('Jogado') === 'Moderately Played' && estados.estadoCanonico('Danificado') === 'Damaged');
config.estados.lightlyPlayed = 0.9;
ok('o fator é ajustável pela configuração', perto(estados.fatorDoEstado('Lightly Played'), 0.9));
config.estados.lightlyPlayed = 0.8;
ok('"High Played" não é um estado (o do mercado é Heavily Played)', estados.estadoCanonico('High Played') === null);

/* ---------- preço por variante ---------- */
const pikachuLegendary = {
  id: 'ev-1', name: 'Pikachu', set: { id: 'ev', name: 'Legendary Collection' }, number: '81',
  tcgplayer: { updatedAt: '2026/10/12', prices: { normal: { market: 6.7 }, reverseHolofoil: { market: 1574.99 } } },
};
const salvo = cartasRepo.salvar(pikachuLegendary);
ok('o preço padrão é o da versão comum (US$ 6,70), não o da reverse holo (US$ 1.574,99)', perto(salvo.preco_mercado_usd, 6.7));
ok('guarda o preço de CADA variante', JSON.parse(salvo.precos_variantes).reverseHolofoil === 1574.99 && JSON.parse(salvo.precos_variantes).normal === 6.7);
ok('guarda a data do preço na API, em AAAA-MM-DD', salvo.preco_data_api === '2026-10-12');
ok('precoDaVariante devolve o da variante pedida', perto(cartasRepo.precoDaVariante(salvo, 'reverseHolofoil'), 1574.99));
ok('variante que a carta não tem cai no preço padrão', perto(cartasRepo.precoDaVariante(salvo, 'holofoil'), 6.7) && perto(cartasRepo.precoDaVariante(salvo, null), 6.7));
cartasRepo.salvar({ id: 'ev-2', name: 'Sem Preço', set: { id: 'ev', name: 'Set' } });
ok('carta sem preço não quebra (padrão nulo, variantes vazias)', cartasRepo.obter('ev-2').preco_mercado_usd === null && cartasRepo.obter('ev-2').precos_variantes === '{}');

/* ---------- migração do cache antigo ---------- */
const antiga = { id: 'ev-3', name: 'Charizard', set: { id: 'ev', name: 'Set' }, tcgplayer: { prices: { normal: { market: 149 }, reverseHolofoil: { market: 450 } } } };
db.prepare("INSERT INTO carta_cache (id, nome, preco_mercado_usd, dados_json) VALUES ('ev-3', 'Charizard', 450, ?)").run(JSON.stringify(antiga));
const estavel = { id: 'ev-4', name: 'Eevee', set: { id: 'ev', name: 'Set' }, tcgplayer: { prices: { holofoil: { market: 8 } } } };
db.prepare("INSERT INTO carta_cache (id, nome, preco_mercado_usd, dados_json) VALUES ('ev-4', 'Eevee', 8, ?)").run(JSON.stringify(estavel));
for (const id of ['ev-3', 'ev-4']) precosRepo.registrarSnapshot(id, id === 'ev-3' ? 450 : 8, '2026-10-20');
const m1 = cartasRepo.migrarPrecosDoCache();
ok('a migração confere as cartas antigas e diz quantas mudaram de preço padrão', m1.conferidas === 2 && m1.padraoMudou === 1, JSON.stringify(m1));
ok('o preço padrão da carta antiga passa a ser o da versão comum', perto(cartasRepo.obter('ev-3').preco_mercado_usd, 149));
ok('o histórico da carta cujo padrão mudou é apagado (senão apareceria uma queda falsa de 67%)', precosRepo.historico('ev-3', 3650).length === 0);
ok('o histórico de quem NÃO mudou é preservado', precosRepo.historico('ev-4', 3650).length === 1);
ok('a migração é idempotente: rodar de novo não mexe em nada', cartasRepo.migrarPrecosDoCache().conferidas === 0);

/* ---------- itens da coleção: variante e estado ---------- */
const servidor = criarServidor().listen(0);
await new Promise((r) => servidor.once('listening', r));
const base = `http://127.0.0.1:${servidor.address().port}/api`;
const fetchOriginal = globalThis.fetch;
const chamadasPokemon = [];
let respostaPokemon = null;
// A API externa é trocada por uma resposta controlada; o resto (nosso próprio servidor) passa direto.
globalThis.fetch = async (url, opcoes) => {
  if (String(url).startsWith('https://api.pokemontcg.io')) {
    chamadasPokemon.push(String(url));
    return respostaPokemon();
  }
  return fetchOriginal(url, opcoes);
};

class Cli {
  cookie = '';
  async req(metodo, caminho, corpo) {
    const r = await globalThis.fetch(`${base}${caminho}`, {
      method: metodo,
      headers: { 'content-type': 'application/json', ...(this.cookie ? { cookie: this.cookie } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const sc = r.headers.get('set-cookie');
    if (sc) this.cookie = sc.split(';')[0];
    const texto = await r.text();
    let j = {};
    try { j = texto ? JSON.parse(texto) : {}; } catch { j = {}; }
    return { s: r.status, j };
  }
  get(p) { return this.req('GET', p); }
  post(p, b = {}) { return this.req('POST', p, b); }
  patch(p, b = {}) { return this.req('PATCH', p, b); }
}
const ana = new Cli();
await ana.post('/cadastro', { nome: 'Ana Lima', usuario: 'ana_estados', email: 'ana@exemplo.com.br', nascimento: '1990-03-15', aceiteTermos: true });
const token = /confirmar\/\?t=([\w-]+)/.exec(caixaDeSaida.at(-1).texto)[1];
const anaId = (await ana.post('/cadastro/concluir', { token, senha: 'Senha1234' })).j.usuario.id;

let r = await ana.get('/colecao/estados');
ok('a API entrega a escala de estados com explicação e fator (a tela monta o campo daqui)', r.s === 200 && r.j.estados.length === 6 && r.j.estados.every((e) => e.descricao && typeof e.fator === 'number'));

r = await ana.post('/colecao', { cartaId: 'ev-1', quantidade: 2, variante: 'reverseHolofoil', condicao: 'Lightly Played', precoPagoBrl: 900 });
ok('cadastra a carta com variante e estado', r.s === 201 && r.j.item.variante === 'reverseHolofoil' && r.j.item.condicao === 'Lightly Played', JSON.stringify(r.j).slice(0, 120));
ok('estado fora da escala é recusado ("High Played")', (await ana.post('/colecao', { cartaId: 'ev-1', quantidade: 1, condicao: 'High Played' })).s === 400);
ok('estado inventado é recusado', (await ana.post('/colecao', { cartaId: 'ev-1', quantidade: 1, condicao: 'Meio amassada' })).s === 400);
r = await ana.post('/colecao', { cartaId: 'ev-1', quantidade: 1, condicao: 'Lacrado' });
ok('nome antigo ("Lacrado") ainda é aceito e vira Mint', r.s === 201 && r.j.item.condicao === 'Mint', JSON.stringify(r.j.item?.condicao));
ok('variante inventada é recusada', (await ana.post('/colecao', { cartaId: 'ev-1', quantidade: 1, variante: 'dourada' })).s === 400);
r = await ana.post('/colecao', { cartaId: 'ev-1', quantidade: 1, variante: '', condicao: '' });
ok('"não sei" e "sem estado" (vazios) passam', r.s === 201 && r.j.item.variante === null && r.j.item.condicao === null);
const semMarcar = r.j.item.id;

let itens = (await ana.get('/colecao')).j.itens;
const reverseLP = itens.find((i) => i.variante === 'reverseHolofoil');
ok('o item vale o preço DA VARIANTE × fator do estado: 1574,99 × 80%', perto(reverseLP.preco_estimado_usd, 1574.99 * 0.8) && perto(reverseLP.preco_variante_usd, 1574.99) && perto(reverseLP.fator_estado, 0.8));
ok('...e o preço padrão da carta continua o da versão comum', perto(reverseLP.preco_mercado_usd, 6.7));
const normalSemEstado = itens.find((i) => i.id === semMarcar);
ok('sem variante nem estado, vale o preço padrão, sem desconto', perto(normalSemEstado.preco_estimado_usd, 6.7) && normalSemEstado.fator_estado === 1);
ok('o item traz a data do preço', reverseLP.preco_data === '2026-10-12');

// nome antigo já gravado no banco aparece com o nome novo
db.prepare("UPDATE colecao_item SET condicao = 'Excelente' WHERE id = ?").run(semMarcar);
ok('item com nome antigo no banco aparece com o nome da escala nova', (await ana.get('/colecao')).j.itens.find((i) => i.id === semMarcar).condicao === 'Near Mint');
db.prepare('UPDATE colecao_item SET condicao = NULL WHERE id = ?').run(semMarcar);

r = await ana.patch(`/colecao/${semMarcar}`, { condicao: 'Heavily Played', variante: 'normal' });
ok('editar o estado e a variante funciona', r.s === 200 && r.j.item.condicao === 'Heavily Played');
ok('editar com estado inválido é recusado', (await ana.patch(`/colecao/${semMarcar}`, { condicao: 'High Played' })).s === 400);

/* ---------- resumo e gráfico seguem a variante e o estado ---------- */
const hoje = new Date().toISOString().slice(0, 10);
precosRepo.registrarSnapshot('ev-1', 6.7, hoje);
db.prepare("UPDATE colecao_item SET adquirido_em = NULL, criado_em = datetime('now', '-3 days') WHERE usuario_id = ?").run(anaId);
const lista = colecaoRepo.listar(anaId);
const resumo = calcularResumo({ itens: lista, taxa: 5, serie: precosRepo.serieDoPortfolio(anaId, 30), taxaDoDia: () => null });
const esperadoUsd = lista.reduce((soma, i) => soma + (i.preco_estimado_usd ?? 0) * i.quantidade, 0);
ok('o valor atual da coleção soma os valores ESTIMADOS (variante × estado), não o preço padrão', perto(resumo.valorAtual, esperadoUsd * 5), `${resumo.valorAtual} x ${esperadoUsd * 5}`);
const ultimo = precosRepo.serieDoPortfolio(anaId, 30).at(-1);
ok('o último ponto do gráfico bate com o valor atual (mesma variante e estado)', perto(ultimo.valor, esperadoUsd), `${ultimo.valor} x ${esperadoUsd}`);

/* ---------- busca: mensagem amigável, preços e páginas ---------- */
respostaPokemon = () => new Response('Bad Gateway: https://api.pokemontcg.io/v2/cards?q=name:pikachu*', { status: 502 });
r = await ana.get('/cartas/buscar?nome=pikachu');
ok('quando a API de cartas falha, a mensagem é curta e amigável (sem endereço, código nem consulta)', r.s === 502 && /instável/.test(r.j.erro) && !/pokemontcg|502|https?:|cards\?q/.test(r.j.erro), r.j.erro);

respostaPokemon = () => new Response(JSON.stringify({ data: [pikachuLegendary], totalCount: 45 }), { status: 200, headers: { 'content-type': 'application/json' } });
chamadasPokemon.length = 0;
r = await ana.get('/cartas/buscar?nome=pikachu&pagina=2');
ok('a busca entrega o total e a página (para o "Ver mais")', r.s === 200 && r.j.total === 45 && r.j.pagina === 2 && r.j.porPagina === 20);
ok('...e pede a página certa à API', chamadasPokemon.some((u) => /page=2/.test(u)), chamadasPokemon.join(' '));
ok('cada carta da busca traz o preço padrão, o de cada variante e a data (calculados no servidor)',
  perto(r.j.cartas[0].valtatcg.padrao, 6.7) && r.j.cartas[0].valtatcg.variantes.reverseHolofoil === 1574.99 && r.j.cartas[0].valtatcg.data === '2026-10-12');

respostaPokemon = () => new Response(JSON.stringify({ data: [], totalCount: 0 }), { status: 200, headers: { 'content-type': 'application/json' } });
r = await ana.get('/cartas/buscar?nome=bulbassauro');
ok('nome que não existe devolve lista vazia (a tela diz "carta não encontrada")', r.s === 200 && r.j.cartas.length === 0);

globalThis.fetch = fetchOriginal;

/* ---------- as telas ---------- */
const ler = (arquivo) => fs.readFileSync(path.join(config.raiz, 'public', arquivo), 'utf8');
const opcoes = ler('assets/js/opcoes-carta.js');
const variantesDaTela = [...opcoes.matchAll(/\['(\w+)', '[^']+'\]/g)].map((m) => m[1]).filter(Boolean);
ok('as variantes da tela são as mesmas que o servidor aceita', variantesDaTela.sort().join(',') === [...cartasRepo.ORDEM_VARIANTES].sort().join(','), variantesDaTela.join(','));
ok('a tela não tem mais a lista antiga de condições (a escala vem do servidor)', !/Lacrado|Excelente|Danificado|CONDICOES/.test(opcoes + ler('assets/js/buscar.js') + ler('assets/js/colecao.js')));
ok('a busca tem o botão "Ver mais cartas"', ler('buscar/index.html').includes('id="btn-mais"') && ler('assets/js/buscar.js').includes('pagina='));
ok('a busca não mostra erro técnico: mensagem de carta não encontrada orienta (nomes em inglês)', /Carta não encontrada/.test(ler('assets/js/buscar.js')) && /em inglês/.test(ler('assets/js/buscar.js')));
ok('o campo que estourava foi contido (min-width 0 nos campos que dividem a linha)', /\.campo--seguro\s*{[^}]*min-width:\s*0/.test(ler('assets/css/project/project.css')));

servidor.close();
db.close();
try {
  fs.rmSync(pastaTemp, { recursive: true, force: true });
} catch {
  // pasta fica para trás em %TEMP% — sem impacto no resultado do teste.
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nOK — tudo passou\n');
process.exit(falhas > 0 ? 1 : 0);
