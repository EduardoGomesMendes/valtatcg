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
  Migração pontual: colunas que nasceram depois do schema original já estar
  em produção, então CREATE TABLE IF NOT EXISTS não as adiciona sozinho. Uma
  checagem de coluna + ALTER TABLE resolve sem precisar de um framework de
  migração inteiro para meia dúzia de colunas.
*/
function adicionarColunaSeFaltando(tabela, coluna, definicao) {
  const colunas = db.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name);
  if (colunas.includes(coluna)) return;
  db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
  log.info(`coluna "${coluna}" adicionada em ${tabela}`);
}

adicionarColunaSeFaltando('usuarios', 'admin', 'INTEGER NOT NULL DEFAULT 0');
adicionarColunaSeFaltando('usuarios', 'assinatura_status', "TEXT NOT NULL DEFAULT 'teste'");
adicionarColunaSeFaltando('usuarios', 'teste_termina_em', 'TEXT');
adicionarColunaSeFaltando('usuarios', 'assinatura_expira_em', 'TEXT');
adicionarColunaSeFaltando('usuarios', 'documento', 'TEXT');
adicionarColunaSeFaltando('usuarios', 'email_cobranca', 'TEXT');
adicionarColunaSeFaltando('usuarios', 'asaas_cliente_id', 'TEXT');
adicionarColunaSeFaltando('usuarios', 'asaas_assinatura_id', 'TEXT');

/*
  Contas que já existiam antes desta coluna nascem com assinatura_status =
  'teste' (o DEFAULT), mas sem teste_termina_em — sem isto, o cálculo de dias
  restantes trataria como teste já vencido e bloquearia todo mundo que já
  estava cadastrado, do nada, no dia em que este código subiu.
*/
db.prepare(
  `UPDATE usuarios SET teste_termina_em = datetime('now', ?)
    WHERE assinatura_status = 'teste' AND teste_termina_em IS NULL`,
).run(`+${config.assinatura.diasDeTeste} days`);

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
