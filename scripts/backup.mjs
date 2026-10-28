#!/usr/bin/env node
/*
  Backup diário do valtatcg.

  Roda no servidor, uma vez por dia (valtatcg-backup.timer), e guarda numa pasta FORA de data/:
    - o banco (contas, coleções, assinaturas, lojas, fórum), com cópia CONSISTENTE feita pelo próprio SQLite
      (VACUUM INTO) enquanto o sistema está no ar. Copiar o arquivo .db "na mão" com o servidor ligado ignora o WAL
      e pode sair quebrado;
    - os arquivos que não estão no banco: as logos das lojas (logos/), as fotos de perfil (avatares/) e, se existirem,
      os vínculos de responsável (vinculos/).
  O .env NÃO entra: tem segredos, e quem restaura o servidor já tem o dele.

  Antes de guardar, confere o banco copiado (integrity_check). Backup que ninguém verificou não é backup.

  Retenção: 14 dias de backups diários, mais um por semana (o de domingo) por 8 semanas.

  Uso:  node --env-file=.env scripts/backup.mjs
  Variáveis: DATA_DIR (padrão ./data) e BACKUP_DIR (padrão /opt/valtatcg/backups).
  Se falhar, avisa por e-mail (EMAIL_AVISO_DONO, se houver SMTP) e sai com código 1 (o systemd marca a unidade como falha).
*/
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';

const DADOS = path.resolve(process.env.DATA_DIR ?? 'data');
const DESTINO = path.resolve(process.env.BACKUP_DIR ?? '/opt/valtatcg/backups');
const DIAS_DIARIOS = 14;
const SEMANAS_SEMANAIS = 8;
const DIA_MS = 24 * 60 * 60 * 1000;
const PASTAS_DE_ARQUIVOS = ['logos', 'avatares', 'vinculos'];

const agora = new Date();
const pad = (n) => String(n).padStart(2, '0');
const carimbo = `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}_${pad(agora.getHours())}${pad(agora.getMinutes())}`;

const inicioDeHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function gzipar(origem, destino) {
  await pipeline(fs.createReadStream(origem), createGzip({ level: 9 }), fs.createWriteStream(destino));
}

/** Cópia consistente do banco + conferência. Devolve o caminho do .db.gz. */
async function copiarBanco() {
  const banco = path.join(DADOS, 'valtatcg.db');
  if (!fs.existsSync(banco)) throw new Error(`não encontrei o banco em ${banco}`);

  const temporario = path.join(DESTINO, `.tmp-${carimbo}.db`);
  fs.rmSync(temporario, { force: true });

  const origem = new DatabaseSync(banco, { readOnly: true });
  try {
    origem.exec('PRAGMA busy_timeout = 30000');
    origem.exec(`VACUUM INTO '${temporario.replace(/'/g, "''")}'`);
  } finally {
    origem.close();
  }

  // A cópia tem de abrir e estar íntegra, senão o arquivo guardado só daria falsa segurança.
  const copia = new DatabaseSync(temporario, { readOnly: true });
  let integridade;
  let tabelas;
  try {
    integridade = copia.prepare('PRAGMA integrity_check').all().map((l) => l.integrity_check).join(',');
    tabelas = copia.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'").get().n;
  } finally {
    copia.close();
  }
  if (integridade !== 'ok') throw new Error(`a cópia do banco não passou na conferência: ${integridade}`);
  if (!(tabelas > 0)) throw new Error('a cópia do banco está vazia');

  const final = path.join(DESTINO, `valtatcg-${carimbo}.db.gz`);
  await gzipar(temporario, final);
  fs.rmSync(temporario, { force: true });
  return { arquivo: final, tabelas };
}

/** Logos, fotos de perfil e vínculos. Nada disso existe ainda? Não há o que guardar. */
function copiarArquivos() {
  const pastas = PASTAS_DE_ARQUIVOS.filter((p) => fs.existsSync(path.join(DADOS, p)));
  if (!pastas.length) return null;
  const nome = `valtatcg-arquivos-${carimbo}.tar.gz`;
  const final = path.join(DESTINO, nome);
  // Nome relativo + cwd: o tar do Git para Windows lê "C:..." como "máquina:arquivo". No servidor (Linux) tanto faz.
  const r = spawnSync('tar', ['-czf', nome, '-C', DADOS, ...pastas], { encoding: 'utf8', cwd: DESTINO });
  if (r.status !== 0) throw new Error(`falha ao compactar ${pastas.join(', ')}: ${(r.stderr || r.error?.message || '').trim()}`);
  return final;
}

function dataDoArquivo(nome) {
  const m = /(\d{4})-(\d{2})-(\d{2})_/.exec(nome);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** 14 dias de diários + o de domingo por 8 semanas. O resto sai. */
function aplicarRetencao() {
  const removidos = [];
  for (const nome of fs.readdirSync(DESTINO)) {
    if (!/^valtatcg-(arquivos-)?\d{4}-\d{2}-\d{2}_\d{4}\.(db\.gz|tar\.gz)$/.test(nome)) continue;
    const data = dataDoArquivo(nome);
    if (!data) continue;
    // Idade em dias de calendário (meia-noite a meia-noite): "14 dias" é o backup de 14 dias atrás inteiro.
    const idade = Math.round((inicioDeHoje.getTime() - data.getTime()) / DIA_MS);
    const ehDomingo = data.getDay() === 0;
    const guardar = idade <= DIAS_DIARIOS || (ehDomingo && idade <= SEMANAS_SEMANAIS * 7);
    if (!guardar) {
      fs.rmSync(path.join(DESTINO, nome), { force: true });
      removidos.push(nome);
    }
  }
  return removidos;
}

async function avisarFalha(erro) {
  try {
    if (!process.env.EMAIL_AVISO_DONO) return;
    const { enviarEmail } = await import('../src/email/enviador.js');
    await enviarEmail({
      para: process.env.EMAIL_AVISO_DONO,
      assunto: '[valtatcg] O backup diário FALHOU',
      texto: `O backup diário do valtatcg falhou:\n\n${erro.message}\n\nEnquanto isso vale o último backup bom (veja ULTIMO.json na pasta de backups). Para investigar no servidor: journalctl -u valtatcg-backup -n 50`,
      html: `<p>O backup diário do valtatcg falhou:</p><pre>${String(erro.message).replace(/[<>&]/g, '')}</pre><p>Enquanto isso vale o último backup bom (veja <code>ULTIMO.json</code> na pasta de backups).</p>`,
    });
  } catch (e) {
    console.error(`não consegui avisar o dono da falha do backup: ${e.message}`);
  }
}

async function principal() {
  const inicio = Date.now();
  fs.mkdirSync(DESTINO, { recursive: true });

  const banco = await copiarBanco();
  const arquivos = copiarArquivos();

  // Cópias fixas com nome previsível: é o que o computador do dono baixa (baixar-backup.cmd).
  fs.copyFileSync(banco.arquivo, path.join(DESTINO, 'ULTIMO-banco.db.gz'));
  if (arquivos) fs.copyFileSync(arquivos, path.join(DESTINO, 'ULTIMO-arquivos.tar.gz'));

  const removidos = aplicarRetencao();

  const resumo = {
    quando: agora.toISOString(),
    banco: path.basename(banco.arquivo),
    tamanhoDoBanco: fs.statSync(banco.arquivo).size,
    arquivos: arquivos ? path.basename(arquivos) : null,
    tamanhoDosArquivos: arquivos ? fs.statSync(arquivos).size : 0,
    tabelas: banco.tabelas,
    integridade: 'ok',
    segundos: Number(((Date.now() - inicio) / 1000).toFixed(1)),
    removidos: removidos.length,
  };
  fs.writeFileSync(path.join(DESTINO, 'ULTIMO.json'), `${JSON.stringify(resumo, null, 2)}\n`);

  console.log(`backup ok: banco ${mb(resumo.tamanhoDoBanco)}, arquivos ${mb(resumo.tamanhoDosArquivos)}, ${resumo.tabelas} tabelas, integridade ok, ${resumo.segundos}s`
    + `${removidos.length ? `; ${removidos.length} backup(s) antigo(s) removido(s)` : ''}`);
}

principal().catch(async (erro) => {
  console.error(`BACKUP FALHOU: ${erro.message}`);
  await avisarFalha(erro);
  process.exit(1);
});
