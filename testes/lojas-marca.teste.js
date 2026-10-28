import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'valtatcg-teste-'));
process.env.DATA_DIR = pastaTemp;
process.env.PORT = '0';
process.env.EMAIL_MODO = 'memoria';

const { db } = await import('../src/db/index.js');
const { criarServidor } = await import('../src/api/servidor.js');
const usuarios = await import('../src/auth/usuarios.repo.js');
const lojas = await import('../src/lojas/lojas.repo.js');
const { caixaDeSaida } = await import('../src/email/enviador.js');

let falhas = 0;
function ok(nome, condicao, detalhe = '') {
  console.log(`${condicao ? '  OK  ' : ' FALHA'} ${nome}${detalhe ? ` → ${detalhe}` : ''}`);
  if (!condicao) falhas += 1;
}

console.log('\n--- lojas: prazo de 48 h, aviso ao administrador, logo e link do site ---');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const JPEG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]).toString('base64')}`;
const SVG = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64')}`;

const servidor = criarServidor().listen(0);
await new Promise((r) => servidor.once('listening', r));
const base = `http://127.0.0.1:${servidor.address().port}`;
const chamar = (caminho, { cookie, metodo = 'GET', corpo } = {}) => fetch(`${base}${caminho}`, {
  method: metodo,
  headers: { ...(cookie ? { cookie } : {}), ...(corpo ? { 'content-type': 'application/json' } : {}) },
  body: corpo ? JSON.stringify(corpo) : undefined,
});
const cookieDe = (id) => `valtatcg_sessao=${encodeURIComponent(usuarios.abrirSessao(id))}`;

const adulto = { senha: 'Senha1234', aceiteTermos: true, nascimento: '1985-03-20' };
const admin = usuarios.criar({ ...adulto, nome: 'Admin', email: 'admin@omva.teste', usuario: 'adminomva' });
usuarios.definirAdmin(admin.id, true);
const dono = usuarios.criar({ ...adulto, nome: 'Dono', email: 'dono@loja.teste', usuario: 'donoloja' });
const estranho = usuarios.criar({ ...adulto, nome: 'Estranho', email: 'estranho@loja.teste', usuario: 'estranho' });
const cAdmin = cookieDe(admin.id);
const cDono = cookieDe(dono.id);
const cEstranho = cookieDe(estranho.id);

/* ---------- preço e cadastro ---------- */
const minha = await (await chamar('/api/minha-loja', { cookie: cDono })).json();
ok('a mensalidade informada à loja é R$ 49,77', minha.precoMensal === 49.77, String(minha.precoMensal));
ok('a loja é informada do prazo de 48 horas', minha.prazoRevisaoHoras === 48);

const dados = { nome: 'Cards do Sul', cnpj: '11.222.333/0001-81', uf: 'RS', cidade: 'Porto Alegre', whatsapp: '51999998888', site: 'cardsdosul.com.br' };
const antes = caixaDeSaida.length;
const criada = await chamar('/api/minha-loja', { cookie: cDono, metodo: 'POST', corpo: dados });
ok('cadastro da loja responde 201', criada.status === 201);
const loja = (await criada.json()).loja;
await new Promise((r) => setTimeout(r, 50)); // o aviso por e-mail sai em segundo plano

/* ---------- prazo ---------- */
const horas = (new Date(`${loja.prazo_revisao_em.replace(' ', 'T')}Z`).getTime() - Date.now()) / 3600000;
ok('o prazo de revisão é 48 horas a partir do cadastro', horas > 47.9 && horas <= 48.01, horas.toFixed(2));

/* ---------- aviso ao administrador ---------- */
const mail = caixaDeSaida.slice(antes).find((m) => m.para === 'admin@omva.teste');
ok('o administrador recebe e-mail da loja nova', Boolean(mail), mail?.assunto);
ok('o e-mail cita a loja e leva à fila de aprovação', mail?.texto.includes('Cards do Sul') && mail?.texto.includes('/admin-lojas/'));
ok('quem não é administrador não recebe o aviso', !caixaDeSaida.slice(antes).some((m) => m.para === 'dono@loja.teste' || m.para === 'estranho@loja.teste'));

const estado = await (await chamar('/api/estado', { cookie: cAdmin })).json();
ok('o painel do administrador mostra 1 loja esperando', estado.usuario?.moderacao?.lojasPendentes === 1, JSON.stringify(estado.usuario?.moderacao));
ok('ainda não há loja vencida', estado.usuario?.moderacao?.lojasVencidas === 0);
const estadoDono = await (await chamar('/api/estado', { cookie: cDono })).json();
ok('quem não é administrador não vê o resumo', !estadoDono.usuario?.moderacao);

db.prepare("UPDATE lojas SET prazo_revisao_em = datetime('now', '-1 hour') WHERE id = ?").run(loja.id);
const vencida = await (await chamar('/api/estado', { cookie: cAdmin })).json();
ok('passou de 48 h: a loja conta como vencida', vencida.usuario.moderacao.lojasVencidas === 1);

// Duas lojas: a que vence primeiro vem primeiro na fila.
const dono2 = usuarios.criar({ ...adulto, nome: 'Dono2', email: 'dois@loja.teste', usuario: 'donodois' });
const loja2 = lojas.criar(usuarios.buscarPorId(dono2.id), { ...dados, nome: 'Segunda Loja', cnpj: '11.444.777/0001-61' });
const fila = lojas.listarParaAdmin('pendente');
ok('a fila de análise começa pela loja que vence primeiro', fila[0].id === loja.id && fila[1].id === loja2.id);
const filaHttp = await chamar('/api/admin/lojas?status=pendente', { cookie: cAdmin });
ok('só o administrador abre a fila', filaHttp.status === 200 && (await chamar('/api/admin/lojas', { cookie: cDono })).status === 403);

/* ---------- logo: validação ---------- */
const enviar = (imagem, cookie = cDono) => chamar('/api/minha-loja/logo', { cookie, metodo: 'POST', corpo: { imagem } });
ok('logo SVG é recusada (pode carregar script)', (await enviar(SVG)).status === 400);
ok('texto qualquer no lugar da imagem é recusado', (await enviar('data:image/png;base64,AAAA')).status === 400);
ok('arquivo rotulado como PNG mas sem a assinatura é recusado', (await enviar(`data:image/png;base64,${Buffer.from('nao sou imagem').toString('base64')}`)).status === 400);
const grande = `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(2.2 * 1024 * 1024)]).toString('base64')}`;
ok('logo acima de 2 MB é recusada', (await enviar(grande)).status === 400);
ok('sem loja não há logo', (await enviar(PNG, cEstranho)).status === 400);
ok('visitante não envia logo', (await chamar('/api/minha-loja/logo', { metodo: 'POST', corpo: { imagem: PNG } })).status === 401);

/* ---------- logo: envio, conferência pelo administrador, vitrine ---------- */
const subiu = await enviar(PNG);
const dadosLogo = await subiu.json();
ok('logo PNG válida é aceita', subiu.status === 200 && Boolean(dadosLogo.loja.logo), JSON.stringify(dadosLogo.loja.logo));
ok('loja em análise não muda de situação ao enviar a logo', dadosLogo.voltouParaRevisao === false && dadosLogo.loja.status === 'pendente');

const doDono = await chamar('/api/minha-loja/logo', { cookie: cDono });
ok('o dono vê a própria logo antes da aprovação', doDono.status === 200 && doDono.headers.get('content-type') === 'image/png');
ok('o administrador confere a logo antes de aprovar', (await chamar(`/api/admin/lojas/${loja.id}/logo`, { cookie: cAdmin })).status === 200);
ok('outro usuário não vê a logo de loja em análise', (await chamar(`/api/lojas/${loja.id}/logo`, { cookie: cEstranho })).status === 404);
ok('visitante também não', (await chamar(`/api/lojas/${loja.id}/logo`)).status === 404);
ok('usuário comum não usa a rota do administrador', (await chamar(`/api/admin/lojas/${loja.id}/logo`, { cookie: cEstranho })).status === 403);

/* ---------- aprovação: e-mail ao dono e vitrine com logo + site ---------- */
const emailsAntes = caixaDeSaida.length;
const aprovou = await chamar(`/api/admin/lojas/${loja.id}/status`, { cookie: cAdmin, metodo: 'POST', corpo: { status: 'ativa' } });
const aprovada = (await aprovou.json()).loja;
await new Promise((r) => setTimeout(r, 50));
ok('aprovar tira o prazo da loja', aprovou.status === 200 && aprovada.prazo_revisao_em === null);
const doDonoMail = caixaDeSaida.slice(emailsAntes).find((m) => m.para === 'dono@loja.teste');
ok('o dono recebe e-mail da aprovação com o valor da mensalidade', Boolean(doDonoMail) && /49,77/.test(doDonoMail.texto), doDonoMail?.assunto);

ok('aprovada sem mensalidade em dia ainda não aparece', lojas.buscar({}).total === 0);
ok('aprovada sem mensalidade: a logo ainda não é pública', (await chamar(`/api/lojas/${loja.id}/logo`)).status === 404);
lojas.ativarAssinatura(loja.id, 30);

const diretorio = await (await chamar('/api/lojas')).json();
const vitrine = diretorio.lojas[0];
ok('no diretório a loja traz a logo e o site', Boolean(vitrine.logo) && vitrine.site === 'https://cardsdosul.com.br/', JSON.stringify({ logo: vitrine.logo, site: vitrine.site }));
ok('o endereço da logo leva a data da troca (cache)', /\?v=/.test(vitrine.logo));
ok('o público não recebe prazo, tipo da imagem nem CNPJ', !('prazo_revisao_em' in vitrine) && !('logo_mime' in vitrine) && !('cnpj' in vitrine));
const publica = await chamar(vitrine.logo);
ok('visitante vê a logo da loja que está no ar', publica.status === 200 && publica.headers.get('content-type') === 'image/png');
ok('a logo pública pode ficar em cache', /public/.test(publica.headers.get('cache-control') ?? ''));
ok('a imagem é entregue sem sniffing', publica.headers.get('x-content-type-options') === 'nosniff');
ok('logo de loja inexistente dá 404', (await chamar('/api/lojas/9999/logo')).status === 404);
ok('id estranho não derruba', (await chamar('/api/lojas/abc/logo')).status === 404);

/* ---------- loja no ar troca a logo: volta para revisão ---------- */
const emailsAntes2 = caixaDeSaida.length;
const trocou = await (await enviar(JPEG)).json();
await new Promise((r) => setTimeout(r, 50));
ok('trocar a logo de loja no ar volta para revisão', trocou.voltouParaRevisao === true && trocou.loja.status === 'pendente');
ok('a revisão ganha novo prazo de 48 h', trocou.loja.prazo_revisao_em !== null);
ok('o administrador é avisado da alteração', caixaDeSaida.slice(emailsAntes2).some((m) => m.para === 'admin@omva.teste' && /alterada/i.test(m.assunto)));
ok('enquanto revisa, a loja sai do diretório', lojas.buscar({}).total === 0);

lojas.mudarStatus(loja.id, 'ativa');
const removeu = await (await chamar('/api/minha-loja/logo', { cookie: cDono, metodo: 'DELETE' })).json();
ok('remover a logo também passa por revisão (loja no ar)', removeu.voltouParaRevisao === true && removeu.loja.logo === null);
lojas.mudarStatus(loja.id, 'ativa');
ok('sem logo, o diretório mostra só o nome', lojas.buscar({}).lojas[0].logo === null);
ok('o arquivo da logo foi apagado do disco', !fs.existsSync(path.join(pastaTemp, 'logos', String(loja.id))));

/* ---------- recusa ---------- */
const emailsAntes3 = caixaDeSaida.length;
await chamar(`/api/admin/lojas/${loja2.id}/status`, { cookie: cAdmin, metodo: 'POST', corpo: { status: 'recusada', motivo: 'CNPJ não confere' } });
await new Promise((r) => setTimeout(r, 50));
const recusa = caixaDeSaida.slice(emailsAntes3).find((m) => m.para === 'dois@loja.teste');
ok('recusa chega ao dono com o motivo', Boolean(recusa) && recusa.texto.includes('CNPJ não confere'));
ok('loja recusada perde o prazo', lojas.obterPorId(loja2.id).prazo_revisao_em === null);

servidor.close();
db.close();
try {
  fs.rmSync(pastaTemp, { recursive: true, force: true });
} catch {
  // pasta fica para trás em %TEMP% — sem impacto no resultado do teste.
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nOK — tudo passou\n');
process.exit(falhas > 0 ? 1 : 0);
