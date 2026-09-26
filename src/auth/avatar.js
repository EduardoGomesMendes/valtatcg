import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { db } from '../db/index.js';

const PASTA = path.join(config.pastaDados, 'avatares');
const TAMANHO_MAXIMO = 3 * 1024 * 1024; // 3MB — sobra para uma selfie de câmera de celular

/*
  Assinatura de bytes de cada formato aceito. Conferir isto (e não só o
  Content-Type que o navegador declarou) evita que alguém suba um arquivo
  qualquer rotulado como "image/png" — o navegador que serve o arquivo de
  volta confia nesse mesmo Content-Type, então vale checar direito uma vez,
  aqui, no upload.
*/
function tipoValido(mime, buffer) {
  if (mime === 'image/png') {
    return buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }
  if (mime === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mime === 'image/webp') {
    return buffer.length >= 12
      && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}

export function caminhoAvatar(usuarioId) {
  return path.join(PASTA, String(Number(usuarioId)));
}

/** @param {string} dataUrl - "data:image/png;base64,...." vindo do <input type=file> ou da câmera */
export function salvarAvatar(usuarioId, dataUrl) {
  const casamento = /^data:(image\/(?:png|jpeg|webp));base64,([a-zA-Z0-9+/=]+)$/.exec(String(dataUrl ?? '').trim());
  if (!casamento) throw new Error('envie uma imagem PNG, JPEG ou WEBP');

  const [, mime, base64] = casamento;
  const buffer = Buffer.from(base64, 'base64');

  if (!buffer.length) throw new Error('imagem vazia');
  if (buffer.length > TAMANHO_MAXIMO) throw new Error('imagem maior que 3MB — escolha uma menor');
  if (!tipoValido(mime, buffer)) throw new Error('o arquivo não parece ser uma imagem válida nesse formato');

  fs.mkdirSync(PASTA, { recursive: true });
  fs.writeFileSync(caminhoAvatar(usuarioId), buffer);

  db.prepare("UPDATE usuarios SET avatar_mime = ?, avatar_atualizado_em = datetime('now') WHERE id = ?")
    .run(mime, Number(usuarioId));
}

export function removerAvatar(usuarioId) {
  try {
    fs.unlinkSync(caminhoAvatar(usuarioId));
  } catch {
    // já não existia — sem problema, o objetivo (não ter mais avatar) já vale.
  }
  db.prepare('UPDATE usuarios SET avatar_mime = NULL, avatar_atualizado_em = NULL WHERE id = ?').run(Number(usuarioId));
}
