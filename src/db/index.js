import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { criarLog } from '../logger.js';

const log = criarLog('db');
const aqui = path.dirname(fileURLToPath(import.meta.url));

fs.mkdirSync(config.pastaDados, { recursive: true });

const caminhoBanco = path.join(config.pastaDados, 'valtatcg.db');

export const db = new DatabaseSync(caminhoBanco);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

/**
 * Dobra o WAL de volta no arquivo principal a cada boot, para o .db sozinho
 * já ficar consistente — importante para backup por cópia de arquivo e para
 * não perder dados se o processo for encerrado à força no meio de uma escrita.
 */
try {
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
} catch (erro) {
  log.warn('não consegui consolidar o WAL:', erro.message);
}

db.exec(fs.readFileSync(path.join(aqui, 'schema.sql'), 'utf8'));

/*
  Migração pontual: `admin` nasceu depois do schema original já estar em
  produção, então CREATE TABLE IF NOT EXISTS não adiciona a coluna sozinho.
  Uma checagem de coluna + ALTER TABLE resolve sem precisar de um framework
  de migração inteiro para uma coluna só.
*/
const colunasUsuarios = db.prepare("PRAGMA table_info(usuarios)").all().map((c) => c.name);
if (!colunasUsuarios.includes('admin')) {
  db.exec('ALTER TABLE usuarios ADD COLUMN admin INTEGER NOT NULL DEFAULT 0');
  log.info('coluna "admin" adicionada em usuarios');
}

log.info(`banco pronto em ${caminhoBanco}`);

/** Roda várias escritas como uma transação única. */
export function emTransacao(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (erro) {
    db.exec('ROLLBACK');
    throw erro;
  }
}

export function agora() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}
