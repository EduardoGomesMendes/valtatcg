import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'valtatcg-teste-'));
process.env.DATA_DIR = pastaTemp;

const { db } = await import('../src/db/index.js');
const usuarios = await import('../src/auth/usuarios.repo.js');
const forum = await import('../src/comunidade/forum.repo.js');
const { validarTexto, nomePublico } = await import('../src/comunidade/texto.js');
const denuncias = await import('../src/seguranca/denuncias.repo.js');

let falhas = 0;
function ok(nome, condicao, detalhe = '') {
  console.log(`${condicao ? '  OK  ' : ' FALHA'} ${nome}${detalhe ? ` → ${detalhe}` : ''}`);
  if (!condicao) falhas += 1;
}
const lanca = (fn) => { try { fn(); } catch (e) { return e; } return null; };

console.log('\n--- fórum: texto seguro, moderação e privacidade ---');

const base = { senha: 'Senha1234', aceiteTermos: true };
const novo = (nome, usuario, nascimento = '1985-03-20') => usuarios.criar({ ...base, nome, email: `${usuario}@teste.local`, usuario, nascimento });
const ana = novo('Ana Souza Pereira', 'ana_cards');
const bia = novo('Bia Lima', 'bia');
const admin = novo('Equipe Valta', 'equipe');
db.prepare('UPDATE usuarios SET admin = 1 WHERE id = ?').run(admin.id);
// Estes testes são das outras regras do fórum: quem escreve aqui já aceitou o termo (o aceite tem teste próprio).
const U = (u) => { forum.registrarAceite(u.id); return { ...usuarios.buscarPorId(u.id) }; };
const TEXTO = 'Alguém sabe o valor de uma Charizard holo da coleção base?';

/* ---------- regras de texto ---------- */
ok('texto normal passa', validarTexto(TEXTO, { campo: 't', min: 5, max: 200 }) === TEXTO);
ok('link com https é barrado', Boolean(lanca(() => validarTexto('veja https://exemplo.com/x', { campo: 't', min: 2, max: 100 }))));
ok('link com www é barrado', Boolean(lanca(() => validarTexto('entre em www.loja.com', { campo: 't', min: 2, max: 100 }))));
ok('domínio solto é barrado', Boolean(lanca(() => validarTexto('me chama em loja.com.br', { campo: 't', min: 2, max: 100 }))));
ok('e-mail é barrado', Boolean(lanca(() => validarTexto('fala comigo: eu@mail.com', { campo: 't', min: 2, max: 100 }))));
ok('telefone é barrado (com e sem máscara)', Boolean(lanca(() => validarTexto('zap 51 99999-8888', { campo: 't', min: 2, max: 100 }))) && Boolean(lanca(() => validarTexto('5199999888877', { campo: 't', min: 2, max: 100 }))));
ok('preço e número de carta não são confundidos com telefone', !lanca(() => validarTexto('Vendi por R$ 1.200,00 a carta 151/165 do set SV3pt5', { campo: 't', min: 2, max: 100 })));
ok('caracteres invisíveis e de controle são removidos', validarTexto('oi​ tudo\u0007 bem', { campo: 't', min: 2, max: 100 }) === 'oi tudo bem');
ok('texto curto e longo demais são recusados', Boolean(lanca(() => validarTexto('a', { campo: 't', min: 5, max: 10 }))) && Boolean(lanca(() => validarTexto('a'.repeat(11), { campo: 't', min: 1, max: 10 }))));
ok('nome público é o usuário, nunca o nome completo', nomePublico({ usuario: 'ana_cards', nome: 'Ana Souza Pereira' }) === 'ana_cards');
ok('sem usuário, só o primeiro nome', nomePublico({ usuario: null, nome: 'Ana Souza Pereira' }) === 'Ana');

/* ---------- tópicos ---------- */
ok('categoria inventada é recusada', Boolean(lanca(() => forum.criarTopico(U(ana), { categoria: 'x', titulo: 'Título válido', corpo: TEXTO }))));
ok('categoria de avisos é só da equipe', Boolean(lanca(() => forum.criarTopico(U(ana), { categoria: 'avisos', titulo: 'Título válido', corpo: TEXTO }))));
ok('título curto é recusado', Boolean(lanca(() => forum.criarTopico(U(ana), { categoria: 'cartas', titulo: 'oi', corpo: TEXTO }))));
ok('título com quebra de linha é recusado', Boolean(lanca(() => forum.criarTopico(U(ana), { categoria: 'cartas', titulo: 'duas\nlinhas aqui', corpo: TEXTO }))));
ok('tópico com link no corpo é recusado', Boolean(lanca(() => forum.criarTopico(U(ana), { categoria: 'cartas', titulo: 'Título válido', corpo: 'compre aqui https://golpe.com agora' }))));

const t1 = forum.criarTopico(U(ana), { categoria: 'cartas', titulo: 'Quanto vale a Charizard base?', corpo: TEXTO });
const aviso = forum.criarTopico(U(admin), { categoria: 'avisos', titulo: 'Bem-vindos ao ValtaTCG', corpo: 'Respeitem todos os colegas aqui.' });
ok('tópicos são criados', Number.isInteger(t1) && Number.isInteger(aviso));

const lista = forum.listarTopicos({});
ok('a lista mostra o nome de usuário, não o nome completo nem o e-mail', lista.topicos.some((t) => t.autor === 'ana_cards') && !JSON.stringify(lista).match(/Souza|@teste\.local/));
ok('filtra por categoria', forum.listarTopicos({ categoria: 'avisos' }).topicos.length === 1 && forum.listarTopicos({ categoria: 'cartas' }).topicos.length === 1);
ok('contagem por categoria', forum.categoriasComContagem().find((c) => c.chave === 'cartas').topicos === 1);

/* ---------- respostas ---------- */
ok('resposta com telefone é recusada', Boolean(lanca(() => forum.responder(U(bia), t1, 'me liga 11 98888-7777'))));
const r1 = forum.responder(U(bia), t1, 'Depende do estado de conservação, Ana.');
forum.responder(U(ana), t1, 'Obrigada! Está em ótimo estado.');
let topico = forum.obterTopico(t1, { usuario: U(bia) });
ok('as respostas aparecem e o contador acompanha', topico.respostas.length === 2 && forum.listarTopicos({}).topicos.find((t) => t.id === t1).respostas === 2);
ok('"meu" marca só o que é da própria pessoa', topico.respostas.find((r) => r.id === r1).meu === true && topico.respostas.filter((r) => r.meu).length === 1 && topico.meu === false);
ok('quem não é admin não recebe o id interno do autor', !('autorId' in topico) && topico.respostas.every((r) => !('autorId' in r)));
ok('o admin recebe o id do autor (para suspender a conta)', 'autorId' in forum.obterTopico(t1, { usuario: U(admin) }));

/* ---------- remover o próprio conteúdo ---------- */
ok('ninguém remove resposta dos outros', Boolean(lanca(() => forum.removerProprio(U(ana), 'resposta', r1))));
ok('ninguém remove tópico dos outros', Boolean(lanca(() => forum.removerProprio(U(bia), 'topico', t1))));
forum.removerProprio(U(bia), 'resposta', r1);
ok('o autor remove a própria resposta e o contador desce', forum.obterTopico(t1, { usuario: U(ana) }).respostas.length === 1 && forum.listarTopicos({}).topicos.find((t) => t.id === t1).respostas === 1);

/* ---------- moderação ---------- */
const r2 = forum.responder(U(bia), t1, 'Resposta que vai ser ocultada pela equipe.');
forum.moderarResposta(r2, 'ocultar');
ok('resposta oculta some para os usuários', !forum.obterTopico(t1, { usuario: U(ana) }).respostas.some((r) => r.id === r2));
ok('o admin ainda enxerga a oculta, marcada', forum.obterTopico(t1, { usuario: U(admin) }).respostas.find((r) => r.id === r2)?.oculto === true);
forum.moderarResposta(r2, 'mostrar');
ok('o admin desfaz', forum.obterTopico(t1, { usuario: U(ana) }).respostas.some((r) => r.id === r2));

forum.moderarTopico(t1, 'fechar');
ok('tópico fechado não recebe resposta', Boolean(lanca(() => forum.responder(U(bia), t1, 'tentando responder'))));
forum.moderarTopico(t1, 'abrir');
ok('reaberto, volta a receber', !lanca(() => forum.responder(U(bia), t1, 'agora pode responder')));

forum.moderarTopico(t1, 'ocultar');
ok('tópico oculto some da lista e do acesso direto', !forum.listarTopicos({}).topicos.some((t) => t.id === t1) && forum.obterTopico(t1, { usuario: U(ana) }) === null);
ok('o admin ainda abre o tópico oculto', forum.obterTopico(t1, { usuario: U(admin) })?.oculto === true);
ok('não dá para responder em tópico oculto', Boolean(lanca(() => forum.responder(U(bia), t1, 'ninguém vai ver isto'))));
forum.moderarTopico(t1, 'mostrar');

forum.moderarTopico(aviso, 'desafixar');
const novoTopico = forum.criarTopico(U(bia), { categoria: 'iniciantes', titulo: 'Como começar a colecionar?', corpo: 'Quero começar agora, por onde vou?' });
forum.moderarTopico(aviso, 'fixar');
ok('tópico fixado fica no topo, mesmo sendo mais antigo', forum.listarTopicos({}).topicos[0].id === aviso);
ok('ação de moderação inventada é recusada', Boolean(lanca(() => forum.moderarTopico(t1, 'explodir'))) && Boolean(lanca(() => forum.moderarResposta(r2, 'fixar'))));

/* ---------- limites ---------- */
const spammer = novo('Spam', 'spammer');
for (let i = 0; i < 3; i += 1) forum.criarTopico(U(spammer), { categoria: 'cartas', titulo: `Tópico número ${i + 1}`, corpo: 'Texto de teste para o limite.' });
ok('no máximo 3 tópicos por hora', Boolean(lanca(() => forum.criarTopico(U(spammer), { categoria: 'cartas', titulo: 'Tópico número 4', corpo: 'Texto de teste para o limite.' }))));
ok('a equipe não tem esse limite', !lanca(() => { for (let i = 0; i < 5; i += 1) forum.criarTopico(U(admin), { categoria: 'avisos', titulo: `Aviso número ${i + 1}`, corpo: 'Texto do aviso da equipe.' }); }));
for (let i = 0; i < 20; i += 1) forum.responder(U(spammer), novoTopico, `resposta ${i + 1} do spammer`);
ok('no máximo 20 respostas por hora', Boolean(lanca(() => forum.responder(U(spammer), novoTopico, 'resposta 21'))));

/* ---------- denúncias de conteúdo ---------- */
const d1 = denuncias.criar({ autorId: ana.id, alvoTipo: 'topico', alvoId: novoTopico, motivo: 'conteudo_improprio', detalhe: 'teste' });
const d2 = denuncias.criar({ autorId: ana.id, alvoTipo: 'resposta', alvoId: r2, motivo: 'assedio' });
ok('dá para denunciar tópico e resposta', d1.repetida === false && d2.repetida === false);
ok('denunciar o que não existe é recusado', Boolean(lanca(() => denuncias.criar({ autorId: ana.id, alvoTipo: 'topico', alvoId: 99999, motivo: 'outro' }))));
const abertas = denuncias.listar('aberta');
const dTopico = abertas.find((d) => d.alvo_tipo === 'topico');
const dResposta = abertas.find((d) => d.alvo_tipo === 'resposta');
ok('o admin vê o título do tópico e quem escreveu', dTopico.alvo.nome === 'Como começar a colecionar?' && dTopico.alvo.autorNome === 'Bia Lima' && dTopico.alvo.autorId === bia.id);
ok('o admin vê o trecho da resposta e o tópico dela', dResposta.alvo.nome.startsWith('Resposta que vai') && dResposta.alvo.topicoId === t1);

/* ---------- conta apagada ---------- */
db.prepare('DELETE FROM usuarios WHERE id = ?').run(spammer.id);
ok('apagar a conta apaga o que a pessoa escreveu', db.prepare('SELECT COUNT(*) AS n FROM forum_topicos WHERE autor_id = ?').get(spammer.id).n === 0 && db.prepare('SELECT COUNT(*) AS n FROM forum_respostas WHERE autor_id = ?').get(spammer.id).n === 0);

db.close();
try {
  fs.rmSync(pastaTemp, { recursive: true, force: true });
} catch {
  // pasta fica para trás em %TEMP% — sem impacto no resultado do teste.
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nOK — tudo passou\n');
process.exit(falhas > 0 ? 1 : 0);
