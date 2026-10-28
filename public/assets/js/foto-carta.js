import { interpretarRodape, interpretarTopo } from './leitura-carta.js';

/*
  Lê uma foto de carta no próprio aparelho (OCR Tesseract.js, servido por nós em /vendor/tesseract).
  A foto nunca sai do celular: só o texto lido vira busca. Isso também é o que mantém a CSP fechada
  (nenhum script ou arquivo de terceiros) e evita guardar imagem de usuário, inclusive de menores.

  Carregado sob demanda (import dinâmico em buscar.js): quem não usa a câmera não baixa os ~7 MB do leitor.
*/

const CAMINHO = '/vendor/tesseract';
const LARGURA_MAXIMA = 1600;
const LARGURA_MINIMA = 1000;

// Onde ficam as informações na carta, em fração da altura: nome no topo, número impresso no rodapé.
const FAIXA_DO_NOME = [0, 0.17];
const FAIXA_DO_NUMERO = [0.85, 1];

let promessaDoLeitor = null;

function carregarScript(src) {
  return new Promise((resolver, rejeitar) => {
    if (window.Tesseract) return resolver();
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolver;
    script.onerror = () => rejeitar(new Error('não consegui carregar o leitor de texto'));
    document.head.append(script);
  });
}

/** Cria o leitor uma vez só e reaproveita nas fotos seguintes (a primeira vez baixa os arquivos). */
function obterLeitor(aoAndamento) {
  if (promessaDoLeitor) return promessaDoLeitor;
  promessaDoLeitor = (async () => {
    await carregarScript(`${CAMINHO}/tesseract.min.js`);
    return window.Tesseract.createWorker('eng', 1, {
      workerPath: `${CAMINHO}/worker.min.js`,
      corePath: CAMINHO,
      langPath: `${CAMINHO}/lang`,
      // Worker direto do nosso endereço: a CSP não precisa liberar blob:.
      workerBlobURL: false,
      logger: (m) => {
        if (m.status?.startsWith('loading')) aoAndamento?.('Preparando o leitor (só na primeira vez)…');
      },
    });
  })();
  // Se falhar (sem rede, por exemplo), a próxima foto tenta de novo em vez de ficar presa no erro.
  promessaDoLeitor.catch(() => { promessaDoLeitor = null; });
  return promessaDoLeitor;
}

async function abrirImagem(arquivo) {
  try {
    // "from-image" respeita a orientação do EXIF: foto de celular em pé não pode chegar deitada no OCR.
    return await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  } catch {
    return createImageBitmap(arquivo);
  }
}

/** Tons de cinza com contraste esticado: texto escuro sobre fundo colorido fica bem mais legível. */
function tratar(contexto, largura, altura, inverter) {
  const imagem = contexto.getImageData(0, 0, largura, altura);
  const px = imagem.data;
  const cinza = new Uint8Array(largura * altura);
  const histograma = new Uint32Array(256);
  for (let i = 0, j = 0; i < px.length; i += 4, j += 1) {
    const v = Math.round(px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114);
    cinza[j] = v;
    histograma[v] += 1;
  }
  const corte = (fracao) => {
    let soma = 0;
    for (let v = 0; v < 256; v += 1) {
      soma += histograma[v];
      if (soma >= cinza.length * fracao) return v;
    }
    return 255;
  };
  const baixo = corte(0.02);
  const alto = Math.max(baixo + 1, corte(0.98));
  for (let i = 0, j = 0; i < px.length; i += 4, j += 1) {
    let v = Math.min(255, Math.max(0, ((cinza[j] - baixo) * 255) / (alto - baixo)));
    if (inverter) v = 255 - v;
    px[i] = v;
    px[i + 1] = v;
    px[i + 2] = v;
  }
  contexto.putImageData(imagem, 0, 0);
}

function recortar(bitmap, [de, ate], inverter = false) {
  const origemY = Math.floor(bitmap.height * de);
  const origemAltura = Math.max(1, Math.floor(bitmap.height * (ate - de)));
  // Foto grande é reduzida (o OCR não ganha nada com 12 megapixels); foto pequena é ampliada.
  const escala = bitmap.width > LARGURA_MAXIMA
    ? LARGURA_MAXIMA / bitmap.width
    : Math.max(1, LARGURA_MINIMA / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.max(1, Math.round(origemAltura * escala));
  const contexto = canvas.getContext('2d', { willReadFrequently: true });
  contexto.drawImage(bitmap, 0, origemY, bitmap.width, origemAltura, 0, 0, canvas.width, canvas.height);
  tratar(contexto, canvas.width, canvas.height, inverter);
  return canvas;
}

async function lerTexto(leitor, canvas, { modo, permitidos = '' }) {
  await leitor.setParameters({ tessedit_pageseg_mode: modo, tessedit_char_whitelist: permitidos });
  const { data } = await leitor.recognize(canvas);
  return data.text ?? '';
}

const SO_NUMERO = '0123456789/ABCDEFGHIJKLMNOPQRSTUVWXYZ ';
const BLOCO = '6'; // um bloco de texto
const ESPARSO = '11'; // texto solto, sem layout (foto com fundo em volta da carta)

/**
 * @param {File | HTMLCanvasElement} origem foto da galeria (File) ou a carta já recortada pelo quadro da câmera (canvas)
 * @param {(texto: string) => void} aoAndamento mensagens curtas para mostrar enquanto lê
 * @returns {Promise<{ numero: string, total: string, nome: string, chave: string }>} campos vazios quando não leu
 */
export async function lerCartaDaFoto(origem, aoAndamento) {
  const enquadrada = origem instanceof HTMLCanvasElement;
  if (!enquadrada && !origem?.type?.startsWith('image/')) throw new Error('esse arquivo não é uma imagem');

  aoAndamento?.('Preparando a foto…');
  const bitmap = enquadrada ? await createImageBitmap(origem) : await abrirImagem(origem);
  const leitor = await obterLeitor(aoAndamento);

  try {
    aoAndamento?.('Lendo o número da carta…');
    let rodape = interpretarRodape(await lerTexto(leitor, recortar(bitmap, FAIXA_DO_NUMERO), { modo: BLOCO, permitidos: SO_NUMERO }));
    // Carta escura traz o número em branco: uma segunda leitura com as cores invertidas resolve.
    if (!rodape) {
      rodape = interpretarRodape(await lerTexto(leitor, recortar(bitmap, FAIXA_DO_NUMERO, true), { modo: BLOCO, permitidos: SO_NUMERO }));
    }

    aoAndamento?.('Lendo o nome da carta…');
    let topo = interpretarTopo(await lerTexto(leitor, recortar(bitmap, FAIXA_DO_NOME), { modo: BLOCO }));

    // Faltou algo nas faixas: provavelmente há fundo em volta da carta (foto da galeria). Lê a foto inteira
    // como texto solto. Na câmera o quadro já recortou a carta, então só vale tentar se não saiu nada.
    const faltou = enquadrada ? !rodape && !topo : !rodape || !topo;
    if (faltou) {
      aoAndamento?.('Procurando a carta na foto…');
      const texto = await lerTexto(leitor, recortar(bitmap, [0, 1]), { modo: ESPARSO });
      rodape ??= interpretarRodape(texto);
      topo ??= interpretarTopo(texto.split(/\r?\n/).filter((l) => l.trim()).slice(0, 4).join('\n'));
    }

    return {
      numero: rodape?.numero ?? '',
      total: rodape?.total ?? '',
      nome: topo?.nome ?? '',
      chave: topo?.chave ?? '',
    };
  } finally {
    bitmap.close?.();
  }
}
