/*
  Service worker do app instalável. De propósito, ele faz UMA coisa: mostrar a tela "sem internet" no lugar do erro do navegador.

  Não guarda páginas, dados da coleção nem respostas da API:
  - preço velho apareceria como se fosse atual;
  - num celular compartilhado, a conta de uma pessoa ficaria legível para outra;
  - depois de publicar, ninguém fica preso numa mistura de arquivo velho com arquivo novo.
  Só ficam guardados os arquivos da própria tela de "sem internet", e mesmo esses vêm da rede quando há rede.
*/
const VERSAO = 'valtatcg-sem-internet-v1';
const GUARDADOS = ['/offline.html', '/assets/css/global/global.css', '/assets/css/project/project.css', '/assets/img/logo-simbolo.svg'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(VERSAO).then((cache) => cache.addAll(GUARDADOS)));
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== VERSAO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;

  if (pedido.mode === 'navigate') {
    evento.respondWith(fetch(pedido).catch(() => caches.match('/offline.html')));
    return;
  }
  if (GUARDADOS.includes(url.pathname)) {
    evento.respondWith(fetch(pedido).catch(() => caches.match(url.pathname)));
  }
});
