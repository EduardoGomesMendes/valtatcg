import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'valtatcg-teste-'));
process.env.DATA_DIR = pastaTemp;

const { db } = await import('../src/db/index.js');
const { config } = await import('../src/config.js');
const usuarios = await import('../src/auth/usuarios.repo.js');
const forum = await import('../src/comunidade/forum.repo.js');
const denuncias = await import('../src/seguranca/denuncias.repo.js');
const { exigirResponsavel } = await import('../src/api/autenticacao.js');

let falhas = 0;
function ok(nome, condicao, detalhe = '') {
  console.log(`${condicao ? '  OK  ' : ' FALHA'} ${nome}${detalhe ? ` → ${detalhe}` : ''}`);
  if (!condicao) falhas += 1;
}
const lanca = (fn) => { try { fn(); } catch (e) { return e; } return null; };

console.log('\n--- cadastro aberto: sem responsável, com data de nascimento controlando o fórum ---');

const base = { senha: 'Senha1234', aceiteTermos: true };
// Estes testes são das outras regras do fórum: quem escreve aqui já aceitou o termo (o aceite tem teste próprio).
const U = (u) => { forum.registrarAceite(u.id); return { ...usuarios.buscarPorId(u.id) }; };
const TEXTO = 'Quanto vale uma Charizard holo da coleção base?';
const topico = (u) => forum.criarTopico(U(u), { categoria: 'cartas', titulo: 'Dúvida sobre preço', corpo: TEXTO });

ok('o padrão é cadastro aberto (responsável desligado)', config.responsavel.obrigatorio === false && config.forum.menoresEscrevem === true);

/* ---------- cadastro ---------- */
const menor = usuarios.criar({ ...base, nome: 'Hugo', email: 'hugo@teste.local', usuario: 'hugo', nascimento: '2010-06-01' });
ok('menor se cadastra SEM responsável', menor.nascimento === '2010-06-01' && menor.responsavel_status === null && menor.responsavel_email === null);
ok('a data de nascimento continua obrigatória', Boolean(lanca(() => usuarios.criar({ ...base, nome: 'Sem Data', email: 'sd@teste.local', usuario: 'semdata', nascimento: '' }))));
ok('menor de 13 anos continua recusado', Boolean(lanca(() => usuarios.criar({ ...base, nome: 'Criança', email: 'cr@teste.local', usuario: 'crianca', nascimento: '2020-01-01' }))));
ok('aceitar os termos continua obrigatório', Boolean(lanca(() => usuarios.criar({ senha: 'Senha1234', nome: 'Sem Termo', email: 'st@teste.local', usuario: 'semtermo', nascimento: '2010-06-01' }))));
const adulto = usuarios.criar({ ...base, nome: 'Adulta', email: 'adulta@teste.local', usuario: 'adulta', nascimento: '1985-03-20' });
ok('dados de responsável enviados por engano são ignorados (não guardamos o que não usamos)', (() => {
  const m = usuarios.criar({ ...base, nome: 'Outro', email: 'o@teste.local', usuario: 'outro', nascimento: '2011-01-01', responsavelNome: 'Fulana de Tal', responsavelEmail: 'fulana@teste.local' });
  return m.responsavel_email === null && m.responsavel_status === null;
})());

/* ---------- nada bloqueia o menor ---------- */
const chamar = (usuario) => {
  let barrou = false;
  const res = { status: () => ({ json: () => { barrou = true; } }) };
  exigirResponsavel({ method: 'POST', usuario }, res, () => {});
  return barrou;
};
ok('o menor não é barrado nas escritas', chamar(U(menor)) === false);
db.prepare("UPDATE usuarios SET responsavel_status = 'pendente' WHERE id = ?").run(menor.id);
ok('conta antiga que ficou "aguardando responsável" é liberada', chamar(U(menor)) === false);
config.responsavel.obrigatorio = true;
ok('ligando o interruptor, a mesma conta volta a ser barrada', chamar(U(menor)) === true);
ok('ligado, o cadastro de menor volta a exigir o responsável', Boolean(lanca(() => usuarios.criar({ ...base, nome: 'Exige', email: 'ex@teste.local', usuario: 'exige', nascimento: '2010-06-01' }))));
config.responsavel.obrigatorio = false;
db.prepare("UPDATE usuarios SET responsavel_status = NULL WHERE id = ?").run(menor.id);

/* ---------- a data de nascimento controla o fórum ---------- */
ok('adulto escreve no fórum', forum.podeEscrever(U(adulto)).ok === true && Number.isInteger(topico(adulto)));
ok('menor escreve no fórum por padrão', forum.podeEscrever(U(menor)).ok === true && Number.isInteger(topico(menor)));

const antiga = usuarios.criar({ ...base, nome: 'Antiga', email: 'antiga@teste.local', usuario: 'antiga', nascimento: '1980-01-01' });
db.prepare('UPDATE usuarios SET nascimento = NULL WHERE id = ?').run(antiga.id);
ok('conta sem data de nascimento NÃO escreve (mas lê)', forum.podeEscrever(U(antiga)).ok === false
  && Boolean(lanca(() => topico(antiga)))
  && forum.listarTopicos({}).total >= 2);
ok('a razão pede a data de nascimento', forum.podeEscrever(U(antiga)).motivo.includes('data de nascimento'));
ok('também não responde', Boolean(lanca(() => forum.responder(U(antiga), 1, 'tentando responder'))));

config.forum.menoresEscrevem = false;
ok('com FORUM_MENORES_ESCREVEM=nao o menor só lê', forum.podeEscrever(U(menor)).ok === false && Boolean(lanca(() => topico(menor))) && Boolean(lanca(() => forum.responder(U(menor), 1, 'resposta'))));
ok('e o adulto continua escrevendo', forum.podeEscrever(U(adulto)).ok === true && !lanca(() => forum.responder(U(adulto), 1, 'resposta do adulto')));
ok('o menor continua LENDO', forum.listarTopicos({}).total >= 2 && forum.obterTopico(1, { usuario: U(menor) }) !== null);
config.forum.menoresEscrevem = true;

/* ---------- o admin vê quando o autor é menor ---------- */
const admin = usuarios.criar({ ...base, nome: 'Equipe', email: 'eq@teste.local', usuario: 'equipe', nascimento: '1985-01-01' });
db.prepare('UPDATE usuarios SET admin = 1 WHERE id = ?').run(admin.id);
const t = forum.obterTopico(1, { usuario: U(admin) });
ok('o admin vê a faixa do autor', t.autorFaixa === 'menor' || t.autorFaixa === 'adulto');
const idDoMenor = db.prepare("SELECT id FROM forum_topicos WHERE autor_id = ?").get(menor.id).id;
ok('o admin vê "menor" no tópico escrito por menor', forum.obterTopico(idDoMenor, { usuario: U(admin) }).autorFaixa === 'menor');
ok('quem não é admin não recebe a faixa', !('autorFaixa' in forum.obterTopico(idDoMenor, { usuario: U(adulto) })));
denuncias.criar({ autorId: adulto.id, alvoTipo: 'topico', alvoId: idDoMenor, motivo: 'assedio' });
const alvo = denuncias.listar('aberta')[0].alvo;
ok('a denúncia mostra a faixa do autor, sem vazar a data de nascimento', alvo.autorFaixa === 'menor' && !('autorNascimento' in alvo) && !JSON.stringify(alvo).includes('2010'));

db.close();
try {
  fs.rmSync(pastaTemp, { recursive: true, force: true });
} catch {
  // pasta fica para trás em %TEMP% — sem impacto no resultado do teste.
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nOK — tudo passou\n');
process.exit(falhas > 0 ? 1 : 0);
