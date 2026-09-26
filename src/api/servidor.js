import express from 'express';
import path from 'node:path';
import { config } from '../config.js';
import { criarLog } from '../logger.js';
import { identificar, exigirLogin, exigirAssinatura } from './autenticacao.js';
import { rotasAcesso } from './routes/acesso.rotas.js';
import { rotasCartas } from './routes/cartas.rotas.js';
import { rotasColecao } from './routes/colecao.rotas.js';
import { rotasAdmin } from './routes/admin.rotas.js';
import { rotasAssinatura } from './routes/assinatura.rotas.js';
import { rotasPagamento } from './routes/pagamento.rotas.js';
import { rotasPerfil } from './routes/perfil.rotas.js';

const log = criarLog('api');

/** Sobe o painel (HTML estático) e a API JSON. */
export function criarServidor() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', true);

  /*
    Limite maior só para o upload de avatar: uma foto de até 3MB vira ~4MB em
    base64 dentro do JSON. Montado ANTES do parser geral e só neste caminho —
    o express.json() do caminho certo consome o corpo e marca req._body, então
    o parser geral (256kb) que vem depois só repassa sem tentar de novo.
    Subir o limite geral para todo mundo aceitar corpo grande à toa era o
    jeito errado de resolver isto.
  */
  app.use('/api/perfil/avatar', express.json({ limit: '5mb' }));
  app.use(express.json({ limit: '256kb' }));

  app.use((req, res, next) => {
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        // As imagens das cartas vêm do CDN da pokemontcg.io — hoje servido via
        // images.scrydex.com, mas cartas mais antigas em cache ainda podem
        // apontar para images.pokemontcg.io, então os dois ficam liberados.
        "img-src 'self' data: https://images.pokemontcg.io https://images.scrydex.com",
        "style-src 'self' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "script-src 'self'",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'none'",
        "form-action 'none'",
      ].join('; '),
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  // Identifica a sessão em todas as rotas; quem bloqueia é o exigirLogin.
  app.use('/api', identificar);

  // --- Rotas públicas ---
  app.use('/api', rotasAcesso());
  // O gateway avisa que alguém pagou; ele não tem sessão aqui. Quem
  // autentica é o token no header, conferido dentro da própria rota.
  app.use('/api', rotasPagamento());

  // --- Daqui para baixo, tudo exige sessão válida ---
  app.use('/api', exigirLogin);

  // Assinatura e perfil antes do bloqueio: precisam responder mesmo com a
  // conta vencida (ex.: para a pessoa conseguir pagar ou trocar a senha).
  app.use('/api', rotasAssinatura());
  app.use('/api', rotasPerfil());

  // Daqui para baixo, escrita exige assinatura em dia (leitura sempre passa).
  app.use('/api', exigirAssinatura);

  app.use('/api', rotasCartas());
  app.use('/api', rotasColecao());
  app.use('/api', rotasAdmin());

  app.use('/api', (req, res) => res.status(404).json({ erro: 'rota não encontrada' }));

  app.use(express.static(path.join(config.raiz, 'public'), { extensions: ['html'] }));

  // eslint-disable-next-line no-unused-vars -- o Express exige os 4 parâmetros
  app.use((erro, req, res, next) => {
    log.error(erro.stack || erro.message);
    res.status(500).json({ erro: 'erro interno' });
  });

  return app;
}
