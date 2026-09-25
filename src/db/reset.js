import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

for (const sufixo of ['', '-wal', '-shm']) {
  const arquivo = path.join(config.pastaDados, `valtatcg.db${sufixo}`);
  if (fs.existsSync(arquivo)) fs.unlinkSync(arquivo);
}

console.log('banco apagado — rode "npm start" para recriar do zero.');
