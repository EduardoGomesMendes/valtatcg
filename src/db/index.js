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
