import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'valtatcg-teste-'));
process.env.DATA_DIR = pastaTemp;
process.env.EMAIL_MODO = 'memoria';
process.env.URL_PUBLICA = 'https://exemplo.teste';

const { db } = await import('../src/db/index.js');
const usuarios = await import('../src/auth/usuarios.repo.js');
const idade = await import('../src/seguranca/idade.js');
const denuncias = await import('../src/seguranca/denuncias.repo.js');
const { enviarConfirmacaoResponsavel } = await import('../src/seguranca/responsavel.js');
const { caixaDeSaida } = await import('../src/email/enviador.js');
const { exigirResponsavel } = await import('../src/api/autenticacao.js');

let falhas = 0;
function ok(nome, condicao, detalhe = '') {
  console.log(`${condicao ? '  OK  ' : ' FALHA'} ${nome}${detalhe ? ` → ${detalhe}` : ''}`);
  if (!condicao) falhas += 1;
}
function lanca(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}

console.log('\n--- segurança: idade, responsável, suspensão, denúncias ---');

/* ---------- idade ---------- */
const HOJE = new Date(Date.UTC(2026, 9, 28)); // 28/10/2026
ok('data impossível (30/02) é recusada', idade.nascimentoValido('2010-02-30') === false);
ok('data no futuro é recusada', idade.nascimentoValido('2030-01-01', HOJE) === false);
ok('lixo não é data', idade.nascimentoValido('amanhã') === false);
ok('aniversário ainda não chegou: 15 anos', idade.calcularIdade('2011-12-01', HOJE) === 14);
ok('aniversário já passou', idade.calcularIdade('2010-01-15', HOJE) === 16);
ok('exatamente no dia dos 18 já é adulto', idade.faixaEtaria('2008-10-28', HOJE) === 'adulto');
ok('um dia antes dos 18 ainda é menor', idade.faixaEtaria('2008-10-29', HOJE) === 'menor');
ok('sem data é "desconhecida"', idade.faixaEtaria(null, HOJE) === 'desconhecida');
ok('12 anos não atinge a idade mínima (13)', idade.idadeMinimaAtingida('2014-10-29', HOJE) === false);
ok('13 anos atinge', idade.idadeMinimaAtingida('2013-10-28', HOJE) === true);

/* ---------- cadastro ---------- */
const base = { senha: 'Senha1234', aceiteTermos: true };
const adulto = usuarios.criar({ ...base, nome: 'Adulto', email: 'adulto@teste.local', usuario: 'adulto', nascimento: '1990-05-10' });
ok('adulto não tem responsável a confirmar', adulto.responsavel_status === null);

ok('recusa quem não aceitou os termos', Boolean(lanca(() => usuarios.criar({
  ...base, aceiteTermos: false, nome: 'X', email: 'x@teste.local', usuario: 'xxx', nascimento: '1990-05-10',
}))));
ok('recusa menor de 13 anos', Boolean(lanca(() => usuarios.criar({
  ...base, nome: 'Pequeno', email: 'p@teste.local', usuario: 'pequeno', nascimento: '2018-01-01',
}))));
ok('recusa menor de 18 sem responsável', Boolean(lanca(() => usuarios.criar({
  ...base, nome: 'Teen', email: 'teen@teste.local', usuario: 'teen', nascimento: '2010-01-15',
}))));
ok('recusa responsável com o mesmo e-mail do menor', Boolean(lanca(() => usuarios.criar({
  ...base, nome: 'Teen', email: 'teen@teste.local', usuario: 'teen', nascimento: '2010-01-15',
  responsavelNome: 'Pai Teen', responsavelEmail: 'TEEN@teste.local',
}))));

const menor = usuarios.criar({
  ...base, nome: 'Teen', email: 'teen@teste.local', usuario: 'teen', nascimento: '2010-01-15',
  responsavelNome: 'Pai do Teen', responsavelEmail: 'pai@teste.local',
});
ok('menor nasce com responsável pendente', menor.responsavel_status === 'pendente');
ok('o hash do token nunca sai em semSegredos', !('responsavel_token_hash' in menor));

/* ---------- confirmação do responsável ---------- */
const envio = await enviarConfirmacaoResponsavel(menor.id);
ok('e-mail ao responsável foi enviado', envio.enviado === true && caixaDeSaida.length === 1);
const mail = caixaDeSaida[0];
ok('o e-mail vai para o responsável, não para o menor', mail.para === 'pai@teste.local');
ok('o link usa a URL pública da configuração', mail.texto.includes('https://exemplo.teste/confirmar-responsavel/?token='));

const token1 = /token=([a-f0-9]{64})/.exec(mail.texto)[1];
ok('a tela de confirmação consegue consultar o token', usuarios.consultarTokenResponsavel(token1)?.nomeDoMenor === 'Teen');
ok('token errado não consulta', usuarios.consultarTokenResponsavel('0'.repeat(64)) === null);

await enviarConfirmacaoResponsavel(menor.id);
ok('novo envio invalida o link anterior', Boolean(lanca(() => usuarios.confirmarResponsavelPorToken(token1))));

const token2 = /token=([a-f0-9]{64})/.exec(caixaDeSaida[1].texto)[1];
let req = { method: 'POST', usuario: usuarios.buscarPorId(menor.id) };
let status = null;
const res = { status(c) { status = c; return this; }, json() { return this; } };
let seguiu = false;
exigirResponsavel(req, res, () => { seguiu = true; });
ok('menor sem responsável confirmado não grava (403)', status === 403 && seguiu === false);
status = null; seguiu = false;
exigirResponsavel({ ...req, method: 'GET' }, res, () => { seguiu = true; });
ok('mas continua podendo ler', seguiu === true && status === null);

usuarios.confirmarResponsavelPorToken(token2);
ok('token válido confirma o responsável', usuarios.buscarPorId(menor.id).responsavel_status === 'confirmado');
ok('e o link não vale duas vezes', Boolean(lanca(() => usuarios.confirmarResponsavelPorToken(token2))));
seguiu = false;
exigirResponsavel({ method: 'POST', usuario: usuarios.buscarPorId(menor.id) }, res, () => { seguiu = true; });
ok('depois de confirmado o menor volta a gravar', seguiu === true);

// Limite de envios por dia: o e-mail é de um terceiro, não pode virar spam.
const menor2 = usuarios.criar({
  ...base, nome: 'Teen2', email: 'teen2@teste.local', usuario: 'teen2', nascimento: '2009-06-01',
  responsavelNome: 'Mãe da Teen2', responsavelEmail: 'mae@teste.local',
});
await enviarConfirmacaoResponsavel(menor2.id);
await enviarConfirmacaoResponsavel(menor2.id);
await enviarConfirmacaoResponsavel(menor2.id);
let limite = null;
try { await enviarConfirmacaoResponsavel(menor2.id); } catch (e) { limite = e; }
ok('4º envio no mesmo dia é recusado', Boolean(limite));

ok('admin confirma na mão quando o e-mail falha', usuarios.confirmarResponsavelManual(menor2.id).responsavel_status === 'confirmado');

// HTML do e-mail não pode executar nome malicioso digitado no cadastro.
const xss = usuarios.criar({
  ...base, nome: '<script>alert(1)</script>', email: 'xss@teste.local', usuario: 'xssuser', nascimento: '2010-01-15',
  responsavelNome: 'Resp "aspas"', responsavelEmail: 'resp@teste.local',
});
await enviarConfirmacaoResponsavel(xss.id);
const htmlXss = caixaDeSaida.at(-1).html;
ok('nome com <script> sai escapado no HTML do e-mail', !htmlXss.includes('<script>') && htmlXss.includes('&lt;script&gt;'));

/* ---------- conta antiga sem nascimento ---------- */
db.prepare('UPDATE usuarios SET nascimento = NULL WHERE id = ?').run(adulto.id);
ok('conta antiga fica "desconhecida"', idade.faixaEtaria(usuarios.buscarPorId(adulto.id).nascimento) === 'desconhecida');
ok('informa o nascimento uma vez', usuarios.informarNascimento(adulto.id, { nascimento: '1990-05-10' }).nascimento === '1990-05-10');
ok('segunda tentativa de mudar é recusada', Boolean(lanca(() => usuarios.informarNascimento(adulto.id, { nascimento: '1980-01-01' }))));

/* ---------- suspensão ---------- */
const tokenSessao = usuarios.abrirSessao(menor.id);
ok('sessão vale antes de suspender', usuarios.usuarioDaSessao(tokenSessao)?.id === menor.id);
usuarios.suspender(menor.id, 'teste');
ok('suspender derruba a sessão', usuarios.usuarioDaSessao(tokenSessao) === null);
ok('conta suspensa aparece como tal', usuarios.buscarPorId(menor.id).suspenso === 1);
usuarios.reativar(menor.id);
ok('reativar limpa a suspensão', usuarios.buscarPorId(menor.id).suspenso === 0);
usuarios.definirAdmin(adulto.id, true);
ok('administrador não pode ser suspenso', Boolean(lanca(() => usuarios.suspender(adulto.id))));

/* ---------- denúncias ---------- */
ok('denúncia de alvo inexistente é recusada', Boolean(lanca(() => denuncias.criar({
  autorId: adulto.id, alvoTipo: 'loja', alvoId: 999, motivo: 'golpe',
}))));
ok('motivo inválido é recusado', Boolean(lanca(() => denuncias.criar({
  autorId: adulto.id, alvoTipo: 'usuario', alvoId: menor.id, motivo: 'inventado',
}))));
const d1 = denuncias.criar({ autorId: adulto.id, alvoTipo: 'usuario', alvoId: menor.id, motivo: 'assedio', detalhe: 'x'.repeat(2000) });
ok('denúncia válida é criada', d1.repetida === false);
ok('repetir a mesma denúncia aberta não duplica', denuncias.criar({
  autorId: adulto.id, alvoTipo: 'usuario', alvoId: menor.id, motivo: 'assedio',
}).repetida === true);
const lista = denuncias.listar('aberta');
ok('lista traz a denúncia com o nome do alvo', lista.length === 1 && lista[0].alvo?.nome === 'Teen');
ok('o detalhe é cortado em 1000 caracteres', lista[0].detalhe.length === 1000);
denuncias.resolver(d1.id, { adminId: adulto.id, status: 'resolvida', nota: 'conversei com o responsável' });
ok('resolver tira da fila de abertas', denuncias.contarAbertas() === 0);
ok('não resolve duas vezes', Boolean(lanca(() => denuncias.resolver(d1.id, { adminId: adulto.id, status: 'descartada' }))));

db.close();
try {
  fs.rmSync(pastaTemp, { recursive: true, force: true });
} catch {
  // pasta fica para trás em %TEMP% — sem impacto no resultado do teste.
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nOK — tudo passou\n');
process.exit(falhas > 0 ? 1 : 0);
