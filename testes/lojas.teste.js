import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'valtatcg-teste-'));
process.env.DATA_DIR = pastaTemp;

const { db } = await import('../src/db/index.js');
const usuarios = await import('../src/auth/usuarios.repo.js');
const lojas = await import('../src/lojas/lojas.repo.js');
const { semAcento } = await import('../src/lojas/regioes.js');
const { ProvedorAsaas } = await import('../src/pagamento/asaas.provedor.js');

let falhas = 0;
function ok(nome, condicao, detalhe = '') {
  console.log(`${condicao ? '  OK  ' : ' FALHA'} ${nome}${detalhe ? ` → ${detalhe}` : ''}`);
  if (!condicao) falhas += 1;
}
function lanca(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}

console.log('\n--- lojas: cadastro, vitrine, busca por região e mensalidade ---');

const base = { senha: 'Senha1234', aceiteTermos: true };
const dono = usuarios.criar({ ...base, nome: 'Dono Loja', email: 'dono@loja.teste', usuario: 'donoloja', nascimento: '1985-03-20' });
const outro = usuarios.criar({ ...base, nome: 'Outro Dono', email: 'outro@loja.teste', usuario: 'outrodono', nascimento: '1990-01-01' });
const menor = usuarios.criar({
  ...base, nome: 'Menor', email: 'menor@loja.teste', usuario: 'menorzin', nascimento: '2010-01-15',
  responsavelNome: 'Responsável', responsavelEmail: 'resp@loja.teste',
});
const antigo = usuarios.criar({ ...base, nome: 'Antigo', email: 'antigo@loja.teste', usuario: 'antigo', nascimento: '1980-01-01' });
db.prepare('UPDATE usuarios SET nascimento = NULL WHERE id = ?').run(antigo.id);

const CNPJ = '11.222.333/0001-81';
const dados = {
  nome: 'Cards do Sul', cnpj: CNPJ, uf: 'RS', cidade: 'Porto Alegre', descricao: 'Cartas Pokémon, boosters e acessórios.',
  whatsapp: '(51) 99999-8888', instagram: '@cardsdosul', site: 'cardsdosul.com.br',
};

/* ---------- quem pode ---------- */
ok('menor de 18 não abre loja', Boolean(lanca(() => lojas.criar(usuarios.buscarPorId(menor.id), dados))));
ok('conta sem data de nascimento não abre loja', Boolean(lanca(() => lojas.criar(usuarios.buscarPorId(antigo.id), dados))));
ok('conta suspensa não abre loja', (() => {
  usuarios.suspender(outro.id, 'teste');
  const e = lanca(() => lojas.criar(usuarios.buscarPorId(outro.id), dados));
  usuarios.reativar(outro.id);
  return Boolean(e);
})());

/* ---------- validação ---------- */
const u = usuarios.buscarPorId(dono.id);
ok('CNPJ inválido é recusado', Boolean(lanca(() => lojas.criar(u, { ...dados, cnpj: '11.222.333/0001-82' }))));
ok('CPF no lugar do CNPJ é recusado', Boolean(lanca(() => lojas.criar(u, { ...dados, cnpj: '111.444.777-35' }))));
ok('estado inexistente é recusado', Boolean(lanca(() => lojas.criar(u, { ...dados, uf: 'XX' }))));
ok('exige ao menos um contato', Boolean(lanca(() => lojas.criar(u, { ...dados, whatsapp: '', instagram: '', site: '' }))));
ok('site "javascript:" é recusado', Boolean(lanca(() => lojas.criar(u, { ...dados, site: 'javascript:alert(1)' }))));
ok('instagram com símbolos estranhos é recusado', Boolean(lanca(() => lojas.criar(u, { ...dados, instagram: '@a b<script>' }))));
ok('WhatsApp curto demais é recusado', Boolean(lanca(() => lojas.criar(u, { ...dados, whatsapp: '1234' }))));

const loja = lojas.criar(u, dados);
ok('cadastro válido nasce pendente', loja.status === 'pendente');
ok('CNPJ é guardado só com dígitos', loja.cnpj === '11222333000181');
ok('WhatsApp ganha o código do país', loja.whatsapp === '5551999998888');
ok('@ do Instagram é normalizado', loja.instagram === 'cardsdosul');
ok('site ganha https://', loja.site === 'https://cardsdosul.com.br/');
ok('cidade é guardada sem acento/maiúscula para a busca', loja.cidade_busca === 'porto alegre');
ok('uma loja por dono', Boolean(lanca(() => lojas.criar(u, { ...dados, cnpj: '11444777000161' }))));
ok('CNPJ não pode repetir entre donos', Boolean(lanca(() => lojas.criar(usuarios.buscarPorId(outro.id), dados))));

/* ---------- visibilidade ---------- */
ok('pendente não aparece no diretório', lojas.buscar({}).total === 0);
lojas.mudarStatus(loja.id, 'ativa');
ok('aprovada sem mensalidade ainda não aparece', lojas.buscar({}).total === 0);
ok('mensalidade padrão da loja é R$ 49,77', lojas.precoMensal() === 49.77);

lojas.ativarAssinatura(loja.id, 30);
const r = lojas.buscar({});
ok('aprovada + mensalidade em dia aparece', r.total === 1 && r.lojas[0].nome === 'Cards do Sul');
ok('o público nunca recebe CNPJ nem dados do dono', !('cnpj' in r.lojas[0]) && !('dono_id' in r.lojas[0]) && !('asaas_cliente_id' in r.lojas[0]));

/* ---------- busca por região ---------- */
// segunda loja, em outra região
const dono2 = usuarios.criar({ ...base, nome: 'Dono Dois', email: 'dois@loja.teste', usuario: 'donodois', nascimento: '1988-08-08' });
const loja2 = lojas.criar(usuarios.buscarPorId(dono2.id), {
  nome: 'Pokémon Center SP', cnpj: '11.444.777/0001-61', uf: 'SP', cidade: 'São Paulo', whatsapp: '11988887777',
});
lojas.mudarStatus(loja2.id, 'ativa');
lojas.ativarAssinatura(loja2.id, 30);

ok('semAcento tira acento e caixa', semAcento('  São   PAULO ') === 'sao paulo');
ok('filtra por estado', lojas.buscar({ uf: 'sp' }).total === 1 && lojas.buscar({ uf: 'RS' }).total === 1);
ok('cidade sem acento acha cidade acentuada', lojas.buscar({ cidade: 'sao paulo' }).lojas[0]?.nome === 'Pokémon Center SP');
ok('cidade parcial acha', lojas.buscar({ cidade: 'porto' }).total === 1);
ok('estado + cidade que não combinam não acham', lojas.buscar({ uf: 'RS', cidade: 'sao paulo' }).total === 0);
ok('busca por texto no nome', lojas.buscar({ q: 'center' }).total === 1);
ok('estado inválido na busca devolve vazio, sem erro', lojas.buscar({ uf: 'ZZ' }).total === 0);
ok('"%" na busca é texto, não curinga', lojas.buscar({ q: '%' }).total === 0);
ok('contagem por estado só considera lojas visíveis', lojas.contarPorUf().length === 2);

/* ---------- edição volta para revisão ---------- */
lojas.atualizar(dono.id, { ...dados, descricao: 'mudou a descrição' });
ok('mudar a vitrine tira a loja do ar até nova revisão', lojas.obterPorDono(dono.id).status === 'pendente' && lojas.buscar({ uf: 'RS' }).total === 0);
lojas.mudarStatus(loja.id, 'ativa');
const cnpjAntes = lojas.obterPorDono(dono.id).cnpj;
lojas.atualizar(dono.id, { ...dados, descricao: 'mudou a descrição', cnpj: '11444777000161' });
ok('o CNPJ não muda pela edição', lojas.obterPorDono(dono.id).cnpj === cnpjAntes);
ok('reenviar os mesmos dados não derruba a loja', lojas.obterPorDono(dono.id).status === 'ativa');

/* ---------- mensalidade ---------- */
lojas.cancelarAssinatura(loja.id);
ok('cancelada continua no ar até o fim do período pago', lojas.buscar({ uf: 'RS' }).total === 1);
lojas.cancelarAssinatura(loja.id, { imediato: true });
ok('estorno tira a loja do ar na hora', lojas.buscar({ uf: 'RS' }).total === 0);

lojas.ativarAssinatura(loja.id, 30);
const antes = new Date(`${lojas.obterPorId(loja.id).assinatura_expira_em.replace(' ', 'T')}Z`).getTime();
lojas.ativarAssinatura(loja.id, 30);
const depois = new Date(`${lojas.obterPorId(loja.id).assinatura_expira_em.replace(' ', 'T')}Z`).getTime();
ok('renovar antes de vencer soma ao saldo', depois - antes > 29 * 86400000);

lojas.mudarStatus(loja2.id, 'suspensa', 'denúncia procedente');
ok('loja suspensa some do diretório', lojas.buscar({ uf: 'SP' }).total === 0);

/* ---------- admin ---------- */
ok('admin lista por status', lojas.listarParaAdmin('suspensa').length === 1 && lojas.listarParaAdmin('suspensa')[0].dono_email === 'dois@loja.teste');
ok('status inválido é recusado', Boolean(lanca(() => lojas.mudarStatus(loja.id, 'inventado'))));
ok('o dono não vê ids do gateway', !('asaas_cliente_id' in lojas.paraODono(lojas.obterPorId(loja.id))));

/* ---------- webhook reconhece loja x usuário ---------- */
const asaas = new ProvedorAsaas({ chave: 'x', ambiente: 'sandbox', tokenWebhook: 't' });
const deLoja = asaas.interpretarWebhook({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1', externalReference: 'loja:7', value: 49.9 } });
ok('"loja:7" vira lojaId', deLoja.lojaId === 7 && deLoja.usuarioId === null && deLoja.acao === 'pagou');
const deUsuario = asaas.interpretarWebhook({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_2', externalReference: 'usuario:3' } });
ok('"usuario:3" continua vindo como usuarioId', deUsuario.usuarioId === 3 && deUsuario.lojaId === null);
const lixo = asaas.interpretarWebhook({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_3', externalReference: 'qualquer-coisa' } });
ok('referência fora do padrão não casa com ninguém', lixo.usuarioId === null && lixo.lojaId === null);

db.close();
try {
  fs.rmSync(pastaTemp, { recursive: true, force: true });
} catch {
  // pasta fica para trás em %TEMP% — sem impacto no resultado do teste.
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nOK — tudo passou\n');
process.exit(falhas > 0 ? 1 : 0);
