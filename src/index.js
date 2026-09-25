import { config } from './config.js';
import { criarLog } from './logger.js';
import { criarServidor } from './api/servidor.js';
import './db/index.js'; // cria/abre o banco antes de qualquer coisa
import { iniciarJobDePrecos } from './portfolio/precos.job.js';

const log = criarLog('sistema');

/** Descobre se quem já está na porta é outra cópia do próprio valtatcg. */
async function jaEhOValtatcg(porta) {
  try {
    const resposta = await fetch(`http://localhost:${porta}/api/estado`, {
      signal: AbortSignal.timeout(2000),
    });
    const corpo = await resposta.json();
    return typeof corpo?.autenticado === 'boolean';
  } catch {
    return false;
  }
}

/**
 * Sobe o servidor HTTP traduzindo as falhas de porta para português.
 * Sem isso, o Node derruba o processo com um stack trace de 15 linhas.
 */
async function abrirPorta(app) {
  const porta = config.servidor.porta;

  return new Promise((resolve) => {
    const servidor = app.listen(porta);

    servidor.once('listening', () => {
      log.info(`painel em http://localhost:${porta}`);
      resolve(servidor);
    });

    servidor.once('error', async (erro) => {
      console.log('');
      if (erro.code === 'EADDRINUSE') {
        if (await jaEhOValtatcg(porta)) {
          log.warn(`o valtatcg JÁ ESTÁ RODANDO em http://localhost:${porta}`);
          log.warn('esta é uma segunda cópia e não precisa ficar aberta.');
        } else {
          log.error(`a porta ${porta} está ocupada por outro programa.`);
          log.warn(`solução: abra o arquivo .env e troque PORT=${porta} por outra porta (ex.: PORT=3301).`);
        }
      } else if (erro.code === 'EACCES') {
        log.error(`sem permissão para usar a porta ${porta}.`);
        log.warn('portas abaixo de 1024 exigem administrador. Use uma porta acima de 1024 no .env.');
      } else {
        log.error(`não consegui abrir a porta ${porta}: ${erro.message}`);
      }
      console.log('');
      resolve(null);
    });
  });
}

async function iniciar() {
  console.log('');
  log.info('valtatcg iniciando...');

  const app = criarServidor();
  const servidor = await abrirPorta(app);
  if (!servidor) return; // a porta não subiu; a mensagem já foi explicada

  const pararJobDePrecos = iniciarJobDePrecos();

  const encerrar = (sinal) => {
    log.info(`recebido ${sinal}, encerrando...`);
    pararJobDePrecos();
    servidor.close();
    process.exit(0);
  };
  process.on('SIGINT', () => encerrar('SIGINT'));
  process.on('SIGTERM', () => encerrar('SIGTERM'));
}

process.on('unhandledRejection', (erro) => {
  log.error('promessa rejeitada sem tratamento:', erro?.message ?? erro);
});

iniciar().catch((erro) => {
  log.error('falha fatal na inicialização:', erro);
  process.exit(1);
});
