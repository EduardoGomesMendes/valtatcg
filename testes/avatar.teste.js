import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'valtatcg-teste-'));
process.env.DATA_DIR = pastaTemp;

const { db } = await import('../src/db/index.js');
const { criar, buscarPorId } = await import('../src/auth/usuarios.repo.js');
const { salvarAvatar, removerAvatar, caminhoAvatar } = await import('../src/auth/avatar.js');

let falhas = 0;
function ok(nome, condicao, detalhe = '') {
  console.log(`${condicao ? '  OK  ' : ' FALHA'} ${nome}${detalhe ? ` → ${detalhe}` : ''}`);
  if (!condicao) falhas += 1;
}

console.log('\n--- avatar ---');

const usuario = criar({ nome: 'Eva', email: 'eva@teste.local', usuario: 'eva', senha: 'Senha1234' });

// PNG 1x1 válido de verdade (não é só um Content-Type rotulado à mão).
const PNG_1X1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

salvarAvatar(usuario.id, PNG_1X1);
const comAvatar = buscarPorId(usuario.id);
ok('salvarAvatar grava o mime certo', comAvatar.avatar_mime === 'image/png');
ok('salvarAvatar marca quando foi atualizado', Boolean(comAvatar.avatar_atualizado_em));
ok('o arquivo existe de verdade no disco', fs.existsSync(caminhoAvatar(usuario.id)));

let erro = null;
try {
  // Bytes de texto puro, rotulados como PNG — a assinatura não bate.
  salvarAvatar(usuario.id, 'data:image/png;base64,' + Buffer.from('isso não é uma imagem').toString('base64'));
} catch (e) {
  erro = e;
}
ok('recusa bytes que não batem com a assinatura do formato declarado', Boolean(erro));

erro = null;
try {
  salvarAvatar(usuario.id, 'data:image/gif;base64,R0lGODlhAQABAAAAACw=');
} catch (e) {
  erro = e;
}
ok('recusa formato fora da lista (gif)', Boolean(erro));

erro = null;
try {
  salvarAvatar(usuario.id, 'não é nem um data URL');
} catch (e) {
  erro = e;
}
ok('recusa string que não é um data URL', Boolean(erro));

erro = null;
try {
  const enorme = 'data:image/png;base64,' + 'A'.repeat(5 * 1024 * 1024);
  salvarAvatar(usuario.id, enorme);
} catch (e) {
  erro = e;
}
ok('recusa imagem maior que o limite', Boolean(erro));

// Depois das tentativas recusadas, o avatar válido anterior continua no ar.
const aindaComAvatar = buscarPorId(usuario.id);
ok('tentativas recusadas não apagam o avatar válido anterior', aindaComAvatar.avatar_mime === 'image/png');

removerAvatar(usuario.id);
const semAvatar = buscarPorId(usuario.id);
ok('removerAvatar limpa o mime', semAvatar.avatar_mime === null);
ok('removerAvatar apaga o arquivo do disco', !fs.existsSync(caminhoAvatar(usuario.id)));

// Não pode explodir removendo de novo algo que já não existe.
try {
  removerAvatar(usuario.id);
  ok('remover de novo (sem avatar) não lança erro', true);
} catch {
  ok('remover de novo (sem avatar) não lança erro', false);
}

db.close();
try {
  fs.rmSync(pastaTemp, { recursive: true, force: true });
} catch {
  // pasta fica para trás em %TEMP% — sem impacto no resultado do teste.
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nOK — tudo passou\n');
process.exit(falhas > 0 ? 1 : 0);
