import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'valtatcg-bk-dados-'));
const destino = fs.mkdtempSync(path.join(os.tmpdir(), 'valtatcg-bk-dest-'));
process.env.DATA_DIR = dados;

const { db } = await import('../src/db/index.js');
const usuarios = await import('../src/auth/usuarios.repo.js');

let falhas = 0;
function ok(nome, condicao, detalhe = '') {
  console.log(`${condicao ? '  OK  ' : ' FALHA'} ${nome}${detalhe ? ` → ${detalhe}` : ''}`);
  if (!condicao) falhas += 1;
}

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const rodar = (envExtra) => spawnSync(process.execPath, [path.join(raiz, 'scripts', 'backup.mjs')], {
  cwd: raiz, encoding: 'utf8', env: { ...process.env, DATA_DIR: dados, BACKUP_DIR: destino, ...envExtra },
});

console.log('\n--- backup diário ---');

// O banco está EM USO (aberto aqui, com WAL): é exatamente a situação do servidor.
usuarios.criar({ nome: 'Ana Lima', email: 'ana@exemplo.com.br', usuario: 'ana_bk', senha: 'Senha1234', nascimento: '1990-01-01', aceiteTermos: true });
usuarios.criar({ nome: 'Beto Dias', email: 'beto@exemplo.com.br', usuario: 'beto_bk', senha: 'Senha1234', nascimento: '1990-01-01', aceiteTermos: true });
fs.mkdirSync(path.join(dados, 'logos'), { recursive: true });
fs.mkdirSync(path.join(dados, 'avatares'), { recursive: true });
fs.writeFileSync(path.join(dados, 'logos', '1'), 'logo-da-loja-1');
fs.writeFileSync(path.join(dados, 'avatares', '7'), 'foto-do-usuario-7');

const r = rodar();
ok('o backup roda sem erro com o banco em uso', r.status === 0, `${r.status} ${r.stderr.slice(0, 200)}`);
ok('...e conta o que fez', /backup ok: banco .* integridade ok/.test(r.stdout), r.stdout.trim());

const arquivos = fs.readdirSync(destino);
const nomeBanco = arquivos.find((n) => /^valtatcg-\d{4}-\d{2}-\d{2}_\d{4}\.db\.gz$/.test(n));
const nomeArquivos = arquivos.find((n) => /^valtatcg-arquivos-\d{4}-\d{2}-\d{2}_\d{4}\.tar\.gz$/.test(n));
ok('gera o backup datado do banco', Boolean(nomeBanco));
ok('gera o backup datado das logos e fotos', Boolean(nomeArquivos));
ok('gera as cópias de nome fixo que o computador do dono baixa', ['ULTIMO-banco.db.gz', 'ULTIMO-arquivos.tar.gz', 'ULTIMO.json'].every((n) => arquivos.includes(n)));
ok('não deixa arquivo temporário para trás', !arquivos.some((n) => n.startsWith('.tmp-')));

const resumo = JSON.parse(fs.readFileSync(path.join(destino, 'ULTIMO.json'), 'utf8'));
ok('o resumo diz que a integridade foi conferida', resumo.integridade === 'ok' && resumo.tabelas > 5 && resumo.tamanhoDoBanco > 0, JSON.stringify(resumo).slice(0, 160));

/* ---------- restaurar de verdade ---------- */
const restaurado = path.join(dados, 'restaurado.db');
fs.writeFileSync(restaurado, zlib.gunzipSync(fs.readFileSync(path.join(destino, 'ULTIMO-banco.db.gz'))));
const copia = new DatabaseSync(restaurado, { readOnly: true });
ok('o backup restaura num banco íntegro', copia.prepare('PRAGMA integrity_check').get().integrity_check === 'ok');
ok('...com os dados que estavam no sistema', copia.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n === 2);
ok('...e sem senha em texto: só hash e salt', !JSON.stringify(copia.prepare('SELECT * FROM usuarios').all()).includes('Senha1234'));
copia.close();

const pastaRestauro = fs.mkdtempSync(path.join(os.tmpdir(), 'valtatcg-bk-rest-'));
// Caminhos relativos + cwd: o tar do Git para Windows lê "C:..." como "máquina:arquivo". No servidor (Linux) tanto faz.
const tar = spawnSync('tar', ['-xzf', 'ULTIMO-arquivos.tar.gz', '-C', path.relative(destino, pastaRestauro).split(path.sep).join('/')], { cwd: destino, encoding: 'utf8' });
ok('o pacote de arquivos abre', tar.status === 0, tar.stderr);
ok('...com a logo e a foto de volta', fs.readFileSync(path.join(pastaRestauro, 'logos', '1'), 'utf8') === 'logo-da-loja-1' && fs.readFileSync(path.join(pastaRestauro, 'avatares', '7'), 'utf8') === 'foto-do-usuario-7');

/* ---------- retenção: 14 dias + domingos por 8 semanas ---------- */
function nomeDe(diasAtras, domingo) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - diasAtras);
  // Ajusta para o dia da semana desejado sem passar da idade pedida em mais de 6 dias.
  while ((d.getDay() === 0) !== domingo) d.setDate(d.getDate() - 1);
  const p = (n) => String(n).padStart(2, '0');
  return `valtatcg-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_0330.db.gz`;
}
const diaComum30 = nomeDe(30, false);
const domingo30 = nomeDe(30, true);
const domingo70 = nomeDe(70, true);
const comum5 = nomeDe(5, false);
const alheio = 'relatorio-do-contador.pdf';
for (const n of [diaComum30, domingo30, domingo70, comum5, alheio]) fs.writeFileSync(path.join(destino, n), 'x');
rodar();
const depois = fs.readdirSync(destino);
ok('backup comum de 30 dias atrás é apagado', !depois.includes(diaComum30), diaComum30);
ok('backup de DOMINGO de 30 dias atrás é guardado (semanal)', depois.includes(domingo30), domingo30);
ok('backup de domingo de 70 dias atrás (mais de 8 semanas) é apagado', !depois.includes(domingo70), domingo70);
ok('backup recente (5 dias) é guardado', depois.includes(comum5));
ok('arquivo que não é do backup nunca é tocado', depois.includes(alheio));

/* ---------- falha: não destrói o que já existe ---------- */
const ultimoAntes = fs.readFileSync(path.join(destino, 'ULTIMO.json'), 'utf8');
const semBanco = fs.mkdtempSync(path.join(os.tmpdir(), 'valtatcg-bk-vazio-'));
const f = rodar({ DATA_DIR: semBanco });
ok('sem banco o backup FALHA com código 1 (o systemd marca a unidade como falha)', f.status === 1 && /BACKUP FALHOU/.test(f.stderr), `${f.status} ${f.stderr.trim()}`);
ok('...e o último backup bom continua intacto', fs.readFileSync(path.join(destino, 'ULTIMO.json'), 'utf8') === ultimoAntes && fs.existsSync(path.join(destino, 'ULTIMO-banco.db.gz')));

/* ---------- o instalador ---------- */
// No Windows, "bash" pode ser o atalho do WSL sem distribuição instalada: só confere se um bash de verdade responde.
const bashVivo = spawnSync('bash', ['-c', 'echo pronto'], { encoding: 'utf8' });
if (bashVivo.error || bashVivo.stdout?.trim() !== 'pronto') console.log('  (bash indisponível aqui: sintaxe do instalador não conferida)');
else {
  const bash = spawnSync('bash', ['-n', path.join(raiz, 'scripts', 'instalar-backup.sh').split(path.sep).join('/')], { encoding: 'utf8' });
  ok('o instalador não tem erro de sintaxe', bash.status === 0, bash.stderr);
}

db.close();
for (const p of [dados, destino, pastaRestauro, semBanco]) {
  try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* pasta temporária: sem impacto no resultado */ }
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nOK — tudo passou\n');
process.exit(falhas > 0 ? 1 : 0);
