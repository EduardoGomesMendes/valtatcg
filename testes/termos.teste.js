import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'valtatcg-teste-'));
process.env.DATA_DIR = pastaTemp;
process.env.PORT = '0';
process.env.EMAIL_MODO = 'memoria';
process.env.CADASTRO_CHECAR_DOMINIO = 'nao';
process.env.CADASTRO_PEDIDOS_POR_IP_HORA = '100';

const { db } = await import('../src/db/index.js');
const { config } = await import('../src/config.js');
const { criarServidor } = await import('../src/api/servidor.js');
const { caixaDeSaida } = await import('../src/email/enviador.js');
const { LIMITES } = await import('../src/comunidade/moderacao.js');
const cadastrosRepo = await import('../src/auth/cadastros.repo.js');

let falhas = 0;
function ok(nome, condicao, detalhe = '') {
  console.log(`${condicao ? '  OK  ' : ' FALHA'} ${nome}${detalhe ? ` → ${detalhe}` : ''}`);
  if (!condicao) falhas += 1;
}

const servidor = criarServidor().listen(0);
await new Promise((r) => servidor.once('listening', r));
const base = `http://127.0.0.1:${servidor.address().port}`;
const buscar = async (caminho, opcoes) => {
  const r = await fetch(`${base}${caminho}`, { redirect: 'manual', ...opcoes });
  return { status: r.status, texto: await r.text() };
};
const reais = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\s/g, ' ');
const semTags = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

console.log('\n--- termos de uso e política de privacidade do ValtaTCG ---');

const termos = await buscar('/termos/');
const privacidade = await buscar('/privacidade/');
ok('os Termos abrem para visitante, sem login', termos.status === 200 && termos.texto.includes('Termos de Uso'));
ok('a Política de Privacidade abre para visitante, sem login', privacidade.status === 200 && privacidade.texto.includes('Política de Privacidade'));

const tTermos = semTags(termos.texto);
const tPriv = semTags(privacidade.texto);

/* ---------- os números do texto são os do sistema ---------- */
ok(`os Termos citam o plano em vigor (${reais(config.assinatura.precoMensal)})`, tTermos.includes(reais(config.assinatura.precoMensal)));
ok(`os Termos citam a mensalidade da loja em vigor (${reais(config.lojas.precoMensal)})`, tTermos.includes(reais(config.lojas.precoMensal)));
ok(`os Termos citam os ${config.assinatura.diasDeTeste} dias de teste`, tTermos.includes(`${config.assinatura.diasDeTeste} dias de teste`));
ok(`os Termos citam o prazo de ${config.lojas.prazoRevisaoHoras} horas para liberar a loja`, tTermos.includes(`em até ${config.lojas.prazoRevisaoHoras} horas`));
ok(`os Termos citam a idade mínima (${config.idade.minima} anos) e a maioridade (${config.idade.maioridade})`, tTermos.includes(`${config.idade.minima} anos`) && tTermos.includes(`${config.idade.maioridade} anos`));
ok(`os Termos citam a suspensão automática (${LIMITES.gravesEm24h} em 24 horas)`, tTermos.includes('Três delas em 24 horas') && LIMITES.gravesEm24h === 3);
ok(`os Termos e a Política citam os ${LIMITES.retencaoDias} dias de registro das mensagens barradas`, tTermos.includes(`${LIMITES.retencaoDias} dias`) && tPriv.includes(`${LIMITES.retencaoDias} dias`));
ok('a Política cita sessão de 30 minutos / 12 horas como o sistema', tPriv.includes(`${config.sessao.inatividadeMinutos} minutos`) && tPriv.includes(`${config.sessao.duracaoHoras} horas`));
ok('a Política cita os 7 dias de limpeza do cadastro', tPriv.includes('7 dias'));

/* ---------- conteúdo essencial ---------- */
for (const [nome, fragmento] of [
  ['a empresa e o CNPJ', 'CNPJ 69.724.570/0001-20'],
  ['que não é loja nem marketplace', 'não é uma loja nem um marketplace'],
  ['que não há afiliação com a Pokémon', 'não é afiliado, patrocinado nem aprovado'],
  ['que preço é referência', 'Os preços são de referência'],
  ['o direito de arrependimento', 'art. 49 do Código de Defesa do Consumidor'],
  ['as regras do fórum (contatos)', 'Sem contatos'],
  ['o Disque 100', 'Disque 100'],
  ['a seção de menores', 'Menores de 18 anos'],
  ['o foro', 'Porto Alegre/RS'],
  ['o contato', 'contato@omva.com.br'],
]) ok(`os Termos tratam de: ${nome}`, tTermos.includes(fragmento));
for (const [nome, fragmento] of [
  ['a controladora', 'OMVA ATENDIMENTO CONTINUO LTDA'],
  ['a LGPD', 'Lei 13.709/2018'],
  ['os direitos do titular', 'Seus direitos'],
  ['crianças e adolescentes (art. 14)', 'art. 14'],
  ['a foto lida no aparelho', 'dentro do seu aparelho'],
  ['que a coleção é privada', 'privada'],
  ['o Asaas', 'Asaas'],
  ['a ANPD', 'ANPD'],
  ['que não há rastreadores', 'apenas o cookie essencial de sessão'],
]) ok(`a Política trata de: ${nome}`, tPriv.includes(fragmento));

/* ---------- âncoras e links ---------- */
const ids = (html) => new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const idsTermos = ids(termos.texto);
const idsPriv = ids(privacidade.texto);
const ancorasLocais = (html) => [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
ok('todo link do índice dos Termos leva a uma seção que existe', ancorasLocais(termos.texto).every((a) => idsTermos.has(a)), ancorasLocais(termos.texto).filter((a) => !idsTermos.has(a)).join(','));
ok('todo link da Política leva a uma seção que existe', ancorasLocais(privacidade.texto).every((a) => idsPriv.has(a)));
ok('a Política aponta para a seção do fórum nos Termos, que existe', privacidade.texto.includes('/termos/#forum') && idsTermos.has('forum'));
ok('os documentos se ligam entre si', termos.texto.includes('href="/privacidade/"') && privacidade.texto.includes('href="/termos/"'));
ok('os documentos NÃO mandam ninguém para os termos de outros produtos da Omva', !/omva\.com\.br\/(termos|privacidade)/.test(termos.texto + privacidade.texto));

/* ---------- onde aparecem ---------- */
const entrar = await buscar('/entrar/');
ok('o cadastro pede aceite dos Termos e da Política DO VALTATCG', entrar.texto.includes('href="/termos/"') && entrar.texto.includes('href="/privacidade/"') && !/omva\.com\.br\/(termos|privacidade)/.test(entrar.texto));
const comRodape = [];
for (const p of ['/', '/entrar/', '/lojas/', '/eventos/', '/esqueci-senha/', '/redefinir-senha/', '/confirmar/', '/termos/', '/privacidade/']) {
  const r = await buscar(p);
  if (r.status === 200 && r.texto.includes('href="/termos/"') && r.texto.includes('href="/privacidade/"')) comRodape.push(p);
}
ok('o rodapé das páginas públicas leva aos dois documentos', comRodape.length === 9, comRodape.join(' '));
const paginas = fs.readdirSync(path.join(config.raiz, 'public'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && !['assets', 'vendor'].includes(d.name))
  .map((d) => path.join(config.raiz, 'public', d.name, 'index.html'))
  .filter((f) => fs.existsSync(f));
const semLinks = paginas.filter((f) => !fs.readFileSync(f, 'utf8').includes('href="/termos/"'));
ok('TODAS as páginas do sistema têm o rodapé com os documentos', semLinks.length === 0, semLinks.map((f) => path.basename(path.dirname(f))).join(' '));

/* ---------- o que a Política promete sobre cadastro e IP ---------- */
async function post(caminho, corpo) {
  const r = await fetch(`${base}/api${caminho}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
  return { s: r.status, j: await r.json().catch(() => ({})) };
}
await post('/cadastro', { nome: 'Ana Lima', usuario: 'ana_termos', email: 'ana@exemplo.com.br', nascimento: '1990-01-01', aceiteTermos: true });
ok('o pedido de cadastro guarda o IP enquanto espera a confirmação', db.prepare('SELECT ip FROM cadastros_pendentes').get().ip !== null);
const token = /confirmar\/\?t=([\w-]+)/.exec(caixaDeSaida.at(-1).texto)[1];
await post('/cadastro/concluir', { token, senha: 'Senha1234' });
const aposConfirmar = db.prepare('SELECT ip, nascimento FROM cadastros_pendentes').get();
ok('depois de confirmado, o pedido esquece o IP e a data de nascimento', aposConfirmar.ip === null && aposConfirmar.nascimento === null);

db.prepare("UPDATE cadastros_pendentes SET confirmado_em = datetime('now', '-8 days')").run();
cadastrosRepo.limparAntigos();
ok('pedido confirmado há mais de 7 dias é apagado', db.prepare('SELECT COUNT(*) AS n FROM cadastros_pendentes').get().n === 0);

await post('/cadastro', { nome: 'Beto Dias', usuario: 'beto_termos', email: 'beto@exemplo.com.br', nascimento: '1990-01-01', aceiteTermos: true });
db.prepare("UPDATE cadastros_pendentes SET expira_em = datetime('now', '-8 days')").run();
cadastrosRepo.limparAntigos();
ok('pedido NÃO confirmado, vencido há mais de 7 dias, é apagado (some a data de nascimento)', db.prepare('SELECT COUNT(*) AS n FROM cadastros_pendentes').get().n === 0);

servidor.close();
db.close();
try {
  fs.rmSync(pastaTemp, { recursive: true, force: true });
} catch {
  // pasta fica para trás em %TEMP% — sem impacto no resultado do teste.
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nOK — tudo passou\n');
process.exit(falhas > 0 ? 1 : 0);
