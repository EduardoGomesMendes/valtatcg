import express from 'express';
import path from 'node:path';
import { config } from '../config.js';
import { criarLog } from '../logger.js';
import { identificar, exigirLogin, exigirAssinatura, exigirResponsavel } from './autenticacao.js';
import { rotasAcesso } from './routes/acesso.rotas.js';
import { rotasCartas } from './routes/cartas.rotas.js';
import { rotasColecao } from './routes/colecao.rotas.js';
import { rotasAdmin } from './routes/admin.rotas.js';
import { rotasAssinatura } from './routes/assinatura.rotas.js';
import { rotasPagamento } from './routes/pagamento.rotas.js';
import { rotasPerfil } from './routes/perfil.rotas.js';
import { rotasResponsavel } from './routes/responsavel.rotas.js';
import { rotasDenuncias } from './routes/denuncias.rotas.js';
import { rotasLojasPublicas, rotasMinhaLoja } from './routes/lojas.rotas.js';
import { rotasEventosPublicos, rotasComunidade } from './routes/comunidade.rotas.js';

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
  // A logo da loja vai em base64 (a tela já a reduz); o limite real de 2 MB é conferido em lojas/logo.js.
  app.use('/api/minha-loja/logo', express.json({ limit: '4mb' }));
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
        // 'wasm-unsafe-eval' só libera compilar WebAssembly (o leitor de texto das fotos de carta); não libera eval de JavaScript.
        "script-src 'self' 'wasm-unsafe-eval'",
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
  // O responsável que confirma o cadastro de um menor não tem conta: vale o token do link.
  app.use('/api', rotasResponsavel());
  // Diretório de lojas: quem ainda não tem conta também procura loja perto de casa.
  app.use('/api', rotasLojasPublicas());
  // Agenda de eventos: qualquer visitante vê.
  app.use('/api', rotasEventosPublicos());

  // --- Daqui para baixo, tudo exige sessão válida ---
  app.use('/api', exigirLogin);

  // Assinatura e perfil antes do bloqueio: precisam responder mesmo com a
  // conta vencida (ex.: para a pessoa conseguir pagar ou trocar a senha).
  app.use('/api', rotasAssinatura());
  app.use('/api', rotasPerfil());
  app.use('/api', rotasDenuncias());
  // A loja tem mensalidade própria: não depende de o plano pessoal estar em dia.
  app.use('/api', rotasMinhaLoja());

  // Menor sem responsável confirmado só lê; depois vem o bloqueio por assinatura vencida.
  app.use('/api', exigirResponsavel);

  // Fórum e eventos: livres para quem tem conta, mesmo com a assinatura da coleção vencida.
  app.use('/api', rotasComunidade());

  // Daqui para baixo, escrita exige assinatura em dia (leitura sempre passa).
  app.use('/api', exigirAssinatura);

  app.use('/api', rotasCartas());
  app.use('/api', rotasColecao());
  app.use('/api', rotasAdmin());

  app.use('/api', (req, res) => res.status(404).json({ erro: 'rota não encontrada' }));

  // O fórum só existe para quem está logado: visitante vai para o login e nada da página é entregue.
  app.use('/forum', identificar, (req, res, next) => {
    if (!req.usuario) return res.redirect(302, `/entrar/?destino=${encodeURIComponent(req.originalUrl)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    next();
  });

  app.use(express.static(path.join(config.raiz, 'public'), { extensions: ['html'] }));

  // eslint-disable-next-line no-unused-vars -- o Express exige os 4 parâmetros
  app.use((erro, req, res, next) => {
    log.error(erro.stack || erro.message);
    res.status(500).json({ erro: 'erro interno' });
  });

  return app;
}
