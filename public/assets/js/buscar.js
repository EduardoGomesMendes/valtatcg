import { api, avisar, avisarComAssinatura, frasePlanoGratis, el, limpar, dataSimples, prepararCabecalho } from './api.js';
import { carregarCambio, preco, elementoVariacao } from './moeda.js';
import { icone } from './icones.js';
import { interpretarBusca, ordenarPorNome, pontuarNome } from './leitura-carta.js';
import { VARIANTES, rotuloDaVariante, carregarEstados, campoSelect, campoEstado, campoComRotulo, campoPreco, campoData } from './opcoes-carta.js';

prepararCabecalho();

const $form = document.getElementById('form-busca');
const $resultados = document.getElementById('resultados');
const $aviso = document.getElementById('aviso');
const $btnSair = document.getElementById('btn-sair');
const $btnFoto = document.getElementById('btn-foto');
const $entradaFoto = document.getElementById('entrada-foto');

$btnSair.addEventListener('click', async () => {
  await api('/sair', { method: 'POST' }).catch(() => {});
  window.location.href = '/entrar/';
});

/** Quantas de cada carta a pessoa já tem (id da carta → quantidade), para mostrar "Qtd" nos resultados. */
let possuidas = new Map();

/** Cota do dia do plano grátis (null para quem está no teste ou assina). Atualizada na tela a cada carta cadastrada. */
let cotaDoDia = null;

async function carregarCota() {
  try {
    cotaDoDia = (await api('/assinatura')).cota;
  } catch {
    cotaDoDia = null; // sem a cota, o formulário funciona do mesmo jeito: quem barra de verdade é o servidor.
  }
}

async function carregarPossuidas() {
  try {
    const { itens } = await api('/colecao');
    possuidas = new Map();
    for (const item of itens) possuidas.set(item.carta_id, (possuidas.get(item.carta_id) ?? 0) + item.quantidade);
  } catch {
    possuidas = new Map(); // sem a lista, a busca funciona do mesmo jeito, só sem o "Qtd".
  }
}

/** @param {(quantidade: number) => void} aoAdicionar chamado depois de a carta entrar na coleção */
function formularioAdicionar(carta, aoAdicionar) {
  const form = el('form', 'flex flex--col gap--2 mt--2', '');

  const linhaQtdVariante = el('div', 'linha--campos', '');
  const campoQtd = document.createElement('input');
  campoQtd.className = 'campo campo--seguro';
  campoQtd.type = 'number';
  campoQtd.name = 'quantidade';
  campoQtd.min = '1';
  campoQtd.value = '1';
  campoQtd.required = true;
  campoQtd.setAttribute('aria-label', 'Quantidade');
  linhaQtdVariante.append(campoComRotulo('Quantidade', campoQtd));
  linhaQtdVariante.append(campoComRotulo('Variante', campoSelect('variante', VARIANTES, false), 'A versão que você tem muda o preço. Não sabe? Deixe "Não sei".'));
  form.append(linhaQtdVariante);

  form.append(campoEstado());

  // O preço pago é o que torna o ganho/perda e o gráfico da coleção reais: por isso fica à vista, com rótulo e explicação.
  const linhaPrecoData = el('div', 'linha--campos', '');
  linhaPrecoData.append(campoComRotulo('Preço pago por carta (R$)', campoPreco()));
  linhaPrecoData.append(campoComRotulo('Data da compra', campoData()));
  form.append(linhaPrecoData);
  form.append(el('span', 'text--xs text--muted', 'Opcional, mas é com o preço e a data que calculamos o seu ganho ou perda e a evolução da coleção. Você pode preencher depois, na sua coleção.'));

  const avisoForm = el('p', 'hidden text--xs', '');
  form.append(avisoForm);

  const botao = el('button', 'botao botao--primario botao--pequeno w--full', 'Confirmar');
  botao.type = 'submit';

  // Plano grátis: diz quanto ainda pode cadastrar hoje, limita a quantidade a isso e, esgotada a cota, oferece a assinatura.
  if (cotaDoDia) {
    campoQtd.max = String(Math.max(1, cotaDoDia.restantesHoje));
    const nota = el('p', 'faixa text--xs', '');
    nota.append(frasePlanoGratis(cotaDoDia));
    if (cotaDoDia.restantesHoje === 0) {
      botao.disabled = true;
      const link = el('a', 'weight--semibold', ' Assinar sem limite');
      link.href = '/assinatura/';
      nota.append(link);
    }
    form.append(nota);
  }
  form.append(botao);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    botao.disabled = true;
    botao.textContent = 'Adicionando…';
    const dados = Object.fromEntries(new FormData(form).entries());
    const quantidade = Number(dados.quantidade);
    try {
      await api('/colecao', {
        method: 'POST',
        body: JSON.stringify({
          cartaId: carta.id,
          quantidade,
          variante: dados.variante || null,
          condicao: dados.condicao || null,
          precoPagoBrl: dados.precoPagoBrl ? Number(dados.precoPagoBrl) : null,
          adquiridoEm: dados.adquiridoEm || null,
        }),
      });
      if (cotaDoDia) {
        cotaDoDia.usadasHoje += quantidade;
        cotaDoDia.restantesHoje = Math.max(0, cotaDoDia.restantesHoje - quantidade);
      }
      aoAdicionar(quantidade);
    } catch (erro) {
      avisarComAssinatura(avisoForm, erro);
      if (erro.status === 429 && erro.corpo?.cota) cotaDoDia = erro.corpo.cota;
      botao.disabled = false;
      botao.textContent = 'Confirmar';
    }
  });

  return form;
}

/** O preço padrão vem calculado do servidor (a versão comum): é o mesmo da coleção. */
function precoDeExibicao(carta) {
  return carta.valtatcg?.padrao ?? null;
}

/** "Holofoil R$ 40,00 · Reverse Holofoil R$ 1.574,99": as outras versões, para o preço padrão não parecer errado. */
function linhaDasVariantes(carta) {
  const variantes = Object.entries(carta.valtatcg?.variantes ?? {});
  if (variantes.length < 2) return null;
  return variantes.map(([nome, valor]) => `${rotuloDaVariante(nome)} ${preco(valor)}`).join(' · ');
}

function cartaoResultado(carta, variacao) {
  const cartao = el('article', 'cartao carta--item p--3 flex flex--col gap--2', '');

  const img = document.createElement('img');
  img.src = carta.images?.small ?? '';
  img.alt = carta.name;
  img.className = 'imagem--carta';
  img.loading = 'lazy';
  cartao.append(img);

  const link = document.createElement('a');
  link.href = `/carta/?id=${encodeURIComponent(carta.id)}`;
  link.className = 'carta--nome text--sm weight--semibold';
  link.textContent = carta.name;
  cartao.append(link);

  cartao.append(el('span', 'carta--meta text--xs text--muted', carta.set?.name ?? ''));
  cartao.append(el('span', 'text--xs text--muted', `${carta.rarity ? `${carta.rarity} · ` : ''}#${carta.number ?? '?'}`));

  cartao.append(el('span', 'text--md weight--semibold', preco(precoDeExibicao(carta))));
  const outras = linhaDasVariantes(carta);
  if (outras) {
    const linhaVariantes = el('span', 'text--xs text--muted', outras);
    linhaVariantes.title = 'O preço grande é o da versão comum. Ao adicionar, marque a versão que você tem para valorizar certo.';
    cartao.append(linhaVariantes);
  }
  if (carta.valtatcg?.data) cartao.append(el('span', 'text--xs text--muted', `Preço de ${dataSimples(carta.valtatcg.data)}`));
  cartao.append(elementoVariacao(variacao));

  const rotuloQtd = () => `Qtd: ${possuidas.get(carta.id) ?? 0}`;
  const rodape = el('div', 'carta--rodape flex items--center justify--content--between', '');
  const qtd = el('span', 'text--xs text--muted', rotuloQtd());
  const botao = el('button', 'botao--redondo', '');
  botao.type = 'button';
  botao.setAttribute('aria-label', 'Adicionar à coleção');
  botao.append(icone('mais', 22));
  rodape.append(qtd, botao);
  cartao.append(rodape);

  let form = null;
  const fechar = () => {
    form?.remove();
    form = null;
    cartao.classList.remove('carta--item--aberta');
    botao.replaceChildren(icone('mais', 22));
    botao.setAttribute('aria-label', 'Adicionar à coleção');
  };

  botao.addEventListener('click', () => {
    if (form) {
      fechar();
      return;
    }
    form = formularioAdicionar(carta, (quantidade) => {
      possuidas.set(carta.id, (possuidas.get(carta.id) ?? 0) + quantidade);
      qtd.textContent = rotuloQtd();
      fechar();
      avisar($aviso, `${carta.name} foi adicionada à sua coleção.`, 'sucesso');
    });
    cartao.append(form);
    cartao.classList.add('carta--item--aberta');
    botao.replaceChildren(icone('fechar', 22));
    botao.setAttribute('aria-label', 'Cancelar');
  });

  return cartao;
}

// No celular o foco automático abre o teclado e esconde os resultados: só foca onde há mouse.
if (window.matchMedia('(hover: hover)').matches) $form.nome.focus();

const prontos = Promise.all([carregarCambio(), carregarPossuidas(), carregarCota(), carregarEstados()]);

/** Consulta a busca do servidor (por nome, ou por número impresso quando vem da foto). */
async function consultar(parametros) {
  const [{ cartas, variacoes, total, pagina }] = await Promise.all([api(`/cartas/buscar?${parametros}`), prontos]);
  return { cartas, variacoes, total, pagina };
}

/** A busca por nome em andamento, para o "Ver mais" pedir a próxima página dela. */
let buscaPorNome = null;
const $maisResultados = document.getElementById('mais-resultados');
const $btnMais = document.getElementById('btn-mais');
const $contagem = document.getElementById('contagem');

function atualizarVerMais() {
  const mostradas = $resultados.children.length;
  const tem = Boolean(buscaPorNome) && mostradas < buscaPorNome.total;
  $maisResultados.classList.toggle('hidden', !buscaPorNome || buscaPorNome.total <= 0);
  $btnMais.classList.toggle('hidden', !tem);
  if (buscaPorNome) $contagem.textContent = `Mostrando ${mostradas} de ${buscaPorNome.total.toLocaleString('pt-BR')} cartas`;
}

function mostrarCartas({ cartas, variacoes }, { anexar = false } = {}) {
  if (!anexar) limpar($resultados);
  cartas.forEach((carta) => $resultados.append(cartaoResultado(carta, variacoes?.[carta.id] ?? null)));
}

$btnMais.addEventListener('click', async () => {
  if (!buscaPorNome) return;
  $btnMais.disabled = true;
  $btnMais.textContent = 'Carregando…';
  try {
    const proxima = await consultar(`nome=${encodeURIComponent(buscaPorNome.texto)}&pagina=${buscaPorNome.pagina + 1}`);
    buscaPorNome.pagina = proxima.pagina;
    mostrarCartas(proxima, { anexar: true });
  } catch (erro) {
    avisar($aviso, erro.message);
  } finally {
    $btnMais.disabled = false;
    $btnMais.textContent = 'Ver mais cartas';
    atualizarVerMais();
  }
});

$form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  avisar($aviso, null);
  const texto = String(new FormData($form).get('nome') ?? '').trim();
  limpar($resultados);
  buscaPorNome = null;
  atualizarVerMais();
  try {
    // O campo aceita nome, número ("25", "025/165", "SWSH123") ou os dois ("pikachu 25").
    const { nome, numero, total } = interpretarBusca(texto);
    let achadas = numero
      ? await consultar(`numero=${encodeURIComponent(numero)}&total=${encodeURIComponent(total)}&nome=${encodeURIComponent(nome)}`)
      : await consultar(`nome=${encodeURIComponent(texto)}`);
    // Texto que parecia número mas era nome (ex.: "Pokémon 151"): tenta de novo como nome.
    if (numero && !achadas.cartas.length) achadas = await consultar(`nome=${encodeURIComponent(texto)}`);
    if (!achadas.cartas.length) {
      avisar($aviso, 'Carta não encontrada. Os nomes das cartas estão em inglês (ex.: "Charizard"); você também pode buscar pelo número, como "25/165".', 'info');
      return;
    }
    mostrarCartas(achadas);
    // Só a busca por nome tem páginas; a por número (da foto ou "25/165") já traz tudo que cabe.
    if (!numero || !achadas.cartas.length) buscaPorNome = { texto, pagina: achadas.pagina ?? 1, total: achadas.total ?? achadas.cartas.length };
    atualizarVerMais();
    if (numero && !total && !nome) {
      avisar($aviso, `Cartas de número ${numero} de várias coleções. Acrescente o nome (ex.: "pikachu ${numero}") ou o total ("${numero}/165") para filtrar.`, 'info');
    }
  } catch (erro) {
    avisar($aviso, erro.message);
  }
});

/* ------------------------------------------------------------------ */
/* Busca pela foto da carta                                            */
/* ------------------------------------------------------------------ */

$btnFoto.append(icone('camera', 20));

// Com câmera disponível abre o quadro-guia; sem ela (ou sem permissão) cai no seletor de arquivo do aparelho.
$btnFoto.addEventListener('click', async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    $entradaFoto.click();
    return;
  }
  try {
    const { abrirCamera } = await import('./camera-carta.js');
    const resultado = await abrirCamera();
    if (resultado === 'galeria') $entradaFoto.click();
    else if (resultado) await lerEBuscar(resultado);
  } catch {
    avisar($aviso, 'Não consegui abrir a câmera. Escolha uma foto da carta.', 'info');
    $entradaFoto.click();
  }
});

/**
 * O número impresso ("025/165") é a pista mais firme; o nome lido pelo OCR é só reforço. Sem número,
 * busca pelo começo do nome — e, se nada vier, por um pedaço menor, que sobrevive a uma letra errada.
 */
async function buscarPelaLeitura(lida) {
  if (lida.numero) {
    try {
      const achadas = await consultar(`numero=${encodeURIComponent(lida.numero)}&total=${encodeURIComponent(lida.total)}`);
      if (achadas.cartas.length) return { ...achadas, cartas: ordenarPorNome(achadas.cartas, lida.chave) };
    } catch {
      // Sem resposta por número, ainda dá para tentar pelo nome.
    }
  }
  const prefixos = lida.chave ? [lida.chave, lida.chave.length > 5 ? lida.chave.slice(0, 4) : null] : [];
  for (const prefixo of prefixos.filter(Boolean)) {
    const achadas = await consultar(`nome=${encodeURIComponent(prefixo)}`);
    if (achadas.cartas.length) return { ...achadas, cartas: ordenarPorNome(achadas.cartas, lida.chave) };
  }
  return null;
}

$entradaFoto.addEventListener('change', async () => {
  const arquivo = $entradaFoto.files[0];
  $entradaFoto.value = ''; // permite escolher a mesma foto de novo depois de um erro
  if (arquivo) await lerEBuscar(arquivo);
});

/** @param {File | HTMLCanvasElement} origem foto escolhida na galeria ou carta recortada pela câmera */
async function lerEBuscar(origem) {
  limpar($resultados);
  buscaPorNome = null;
  atualizarVerMais();
  $btnFoto.disabled = true;
  try {
    // Import dinâmico: o leitor de texto é pesado e só quem usa a câmera paga por ele.
    const { lerCartaDaFoto } = await import('./foto-carta.js');
    const lida = await lerCartaDaFoto(origem, (texto) => avisar($aviso, texto, 'info'));

    if (!lida.numero && !lida.chave) {
      avisar($aviso, 'Não consegui ler a carta. Tente com mais luz, a carta reta e sem reflexo — ou digite o nome.');
      return;
    }

    const achadas = await buscarPelaLeitura(lida);
    const pista = [lida.chave, lida.numero ? `${lida.numero}${lida.total ? `/${lida.total}` : ''}` : ''].filter(Boolean).join(' · ');
    if (!achadas) {
      if (lida.chave) $form.nome.value = lida.chave;
      avisar($aviso, `Li "${pista}", mas não achei essa carta. Corrija o nome e toque em Buscar.`, 'info');
      return;
    }
    mostrarCartas(achadas);
    // Nome lido que não bate com a primeira carta é lixo do OCR (nome em letra decorada, por exemplo):
    // não vale preencher o campo com ele; o número já trouxe as candidatas.
    if (!lida.numero || pontuarNome(achadas.cartas[0].name, lida.chave) >= 0.5) {
      $form.nome.value = achadas.cartas[0].name;
      avisar($aviso, `Li "${pista}". Não é essa? Corrija o nome e toque em Buscar.`, 'info');
    } else {
      avisar($aviso, `Li o número ${pista.split(' · ').pop()}. Confira abaixo qual é a sua carta.`, 'info');
    }
  } catch (erro) {
    avisar($aviso, `Não consegui ler a foto: ${erro.message}`);
  } finally {
    $btnFoto.disabled = false;
  }
}
