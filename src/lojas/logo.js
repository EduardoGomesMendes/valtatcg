import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { db } from '../db/index.js';

/*
  Logo da loja: um arquivo por loja em data/logos/<id>, com o tipo guardado no banco.
  Só PNG, JPEG e WEBP — SVG fica de fora de propósito: ele pode carregar script, e este arquivo
  é servido para qualquer visitante do diretório.
*/

const PASTA = path.join(config.pastaDados, 'logos');
const TAMANHO_MAXIMO = 2 * 1024 * 1024; // a tela já reduz a imagem; 2 MB é folga para quem enviar sem redução

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

export function caminhoLogo(lojaId) {
  return path.join(PASTA, String(Number(lojaId)));
}

/** @param {string} dataUrl "data:image/png;base64,..." vindo do seletor de arquivo */
export function salvarLogo(lojaId, dataUrl) {
  const casamento = /^data:(image\/(?:png|jpeg|webp));base64,([a-zA-Z0-9+/=]+)$/.exec(String(dataUrl ?? '').trim());
  if (!casamento) throw new Error('envie a logo em PNG, JPEG ou WEBP');

  const [, mime, base64] = casamento;
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length) throw new Error('imagem vazia');
  if (buffer.length > TAMANHO_MAXIMO) throw new Error('a logo passou de 2 MB — use uma imagem menor');
  if (!tipoValido(mime, buffer)) throw new Error('o arquivo não parece ser uma imagem válida nesse formato');

  fs.mkdirSync(PASTA, { recursive: true });
  fs.writeFileSync(caminhoLogo(lojaId), buffer);
  db.prepare("UPDATE lojas SET logo_mime = ?, logo_atualizado_em = datetime('now'), atualizado_em = datetime('now') WHERE id = ?")
    .run(mime, Number(lojaId));
}

export function removerLogo(lojaId) {
  try {
    fs.unlinkSync(caminhoLogo(lojaId));
  } catch {
    // já não existia: o objetivo (loja sem logo) já vale.
  }
  db.prepare("UPDATE lojas SET logo_mime = NULL, logo_atualizado_em = NULL, atualizado_em = datetime('now') WHERE id = ?")
    .run(Number(lojaId));
}

/** Envia o arquivo da logo; 404 se a loja não tem. `cache` separa o que é público do que só o dono/admin vê. */
export function enviarLogo(res, loja, cache) {
  if (!loja?.logo_mime) return res.status(404).end();
  fs.readFile(caminhoLogo(loja.id), (erro, buffer) => {
    if (erro) return res.status(404).end();
    res.setHeader('Content-Type', loja.logo_mime);
    res.setHeader('Cache-Control', cache);
    res.send(buffer);
  });
}
