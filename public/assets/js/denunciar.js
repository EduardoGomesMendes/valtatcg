import { api, avisar } from './api.js';

/*
  Denúncia de loja, tópico, resposta ou evento — o mesmo fluxo em todas as telas.
  O servidor é quem decide o que vale; aqui só se escolhe o motivo.
*/

let motivos = null;

/** Lista de motivos ({chave, rotulo}); vazia se a pessoa não estiver logada (a denúncia exige conta). */
export async function carregarMotivos() {
  if (motivos) return motivos;
  const resposta = await api('/denuncias/motivos').catch(() => ({ motivos: {} }));
  motivos = Object.entries(resposta.motivos).map(([chave, rotulo]) => ({ chave, rotulo }));
  return motivos;
}

/**
 * @param {{alvoTipo: 'loja'|'topico'|'resposta'|'evento'|'usuario', alvoId: number, nome: string, $aviso: HTMLElement}} p
 */
export async function denunciar({ alvoTipo, alvoId, nome, $aviso }) {
  const lista = await carregarMotivos();
  const opcoes = lista.map((m, i) => `${i + 1} - ${m.rotulo}`).join('\n');
  const escolha = prompt(`Por que denunciar "${nome}"?\n\n${opcoes}\n\nDigite o número:`);
  if (escolha === null) return;
  const motivo = lista[Number(escolha) - 1];
  if (!motivo) {
    avisar($aviso, 'Escolha um número da lista.');
    return;
  }
  const detalhe = prompt('Quer explicar melhor? (opcional)', '') ?? '';
  try {
    await api('/denuncias', { method: 'POST', body: JSON.stringify({ alvoTipo, alvoId, motivo: motivo.chave, detalhe }) });
    avisar($aviso, 'Denúncia enviada. Obrigado — nossa equipe vai analisar.', 'sucesso');
  } catch (erro) {
    avisar($aviso, erro.message);
  }
}
