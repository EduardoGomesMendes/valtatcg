# CLAUDE.md — valtatcg

Projeto **pessoal e independente**. Sem relação com `C:\omva\omvazap` nem com as regras daquele repositório.

## Visão geral

Rastreador de portfólio de cartas colecionáveis (TCG), inspirado no [getcollectr.com](https://getcollectr.com).
O usuário cataloga as cartas que possui e acompanha o valor de mercado da coleção ao longo do tempo,
como um portfólio de investimentos.

**v1 cobre só Pokémon**, via a API pública [pokemontcg.io](https://docs.pokemontcg.io). Escopo desta
versão: catálogo + portfólio (o "Track" do Collectr). Fora do escopo por enquanto: trade analyzer,
feed social, app mobile nativo, outros jogos de cartas.

## Lojas: mensalidade, prazo de 48 h, logo e site

- **R$ 49,77/mês** (`PRECO_LOJA_MENSAL`, padrão 49.77): cadastro atualizado no diretório + marca em destaque.
- **Prazo de 48 h** (`LOJA_PRAZO_REVISAO_HORAS`): `lojas.prazo_revisao_em` nasce com o cadastro (e recomeça quando uma
  loja no ar altera nome, contatos, site ou logo e volta para "pendente"). O administrador é avisado por **faixa
  fixa no topo** (`/estado` → `moderacao.lojasPendentes/lojasVencidas`), pela fila ordenada pelo prazo em
  `/admin-lojas/` e por **e-mail** (`src/lojas/avisos.js`, só se houver SMTP; nunca bloqueia o cadastro).
  O dono recebe e-mail quando a loja é aprovada ou recusada.
- **Logo**: arquivo em `data/logos/<id>` (PNG/JPEG/WEBP, nunca SVG; 2 MB; a tela reduz para 600 px). Pública só
  de loja no ar (aprovada + mensalidade em dia); o dono e o administrador veem a dela antes da aprovação.
  No diretório a logo vira link para o `site` da loja (`target=_blank`, `rel=noopener noreferrer nofollow`).
- Mudar a logo de loja no ar a devolve para revisão, como mudar o nome.

## Busca pela foto da carta

O botão de câmera em Buscar lê a carta **no aparelho** (OCR Tesseract.js, sem IA paga e sem enviar a
foto a ninguém). A câmera abre um quadro no formato da carta; a foto da galeria também serve.
- O leitor (~11 MB) fica **versionado** em `public/vendor/tesseract/` e é servido por nós: a CSP continua
  `script-src 'self'` (só ganhou `'wasm-unsafe-eval'`, que libera compilar WebAssembly e não eval de JS).
  Não trocar por CDN. É carregado sob demanda (import dinâmico), então só quem usa a câmera baixa.
- Lê duas faixas: o **número impresso** no rodapé (`025/165`) e o **nome** no topo. O número é a pista firme:
  `GET /cartas/buscar?numero=25&total=165` consulta `number:25 set.printedTotal:165`. O nome só ordena e é
  plano B. A tela sempre mostra o que foi lido para a pessoa corrigir.
- O campo de busca também aceita **número digitado**: `025/165`, `25`, `pikachu 25`, `SWSH123`
  (`interpretarBusca`). Texto que parecia número mas não achou nada é tentado de novo como nome.
- As regras de texto (`leitura-carta.js`) são funções puras, testadas em `testes/foto.teste.js`.
- Limite conhecido: o OCR erra com brilho forte e carta inclinada; sem número nem nome legíveis a tela pede
  outra foto ou o nome digitado.

## Comandos

Mesmo ambiente do dono do omvazap: **Windows PowerShell 5.1**, onde `&&` não existe e `npm.ps1` é
bloqueado pela política de execução. Por isso os atalhos `.cmd` na raiz:

| Atalho | Equivalente |
|---|---|
| `iniciar.cmd` | `node src/index.js` |
| `testar.cmd` | roda os três testes: acesso, coleção, preços |
| `limpar.cmd` | apaga `data/valtatcg.db*` (pede confirmação) |

Scripts do `package.json`: `start`, `dev`, `test`, `db:seed`, `db:reset`.

## Stack

- **Node.js puro (ESM)**, sem TypeScript e sem bundler.
- **SQLite via `node:sqlite`** (embutido no Node 22.5+) — sem dependência nativa, sem servidor de banco.
- **Express** na API. Cliente da pokemontcg.io feito com `fetch` puro, sem SDK.
- Frontend em **HTML + CSS + JavaScript puro**, sem framework e sem build.

Regra prática: só adicionar dependência quando a alternativa nativa custar mais do que ela. Hash de
senha e sessão são feitos com recursos nativos (`node:crypto`), de propósito.

## Preço das cartas

A pokemontcg.io devolve preço só em dólar (via tcgplayer) e por variante (normal, holofoil,
reverseHolofoil, 1stEditionHolofoil, 1stEditionNormal). O cardmarket (euro) é ignorado de propósito —
misturar moedas no valor do portfólio criaria um número sem sentido. `cartas.repo.js` guarda **um**
preço representativo por carta (não por variante possuída) — ver `extrairPrecoMercado()` para a ordem
de preferência. Isso é uma simplificação de v1; refinar por variante fica para depois, se importar.

A API não tem endpoint de histórico. O gráfico de evolução é construído por nós: um job
(`portfolio/precos.job.js`) roda no boot e a cada 24h, e grava uma linha por dia em `preco_historico`
só para as cartas que alguém realmente possui — não para o cache inteiro.

A busca da pokemontcg.io não aceita `*` dentro de aspas (`name:"pika*"` derruba a busca) — só
wildcard sem aspas funciona. Por isso `pokemontcg/cliente.js` usa prefixo sem aspas para busca de uma
palavra e frase exata entre aspas (sem wildcard) para nomes com espaço. A API também devolve 500/502
esporádicos mesmo em consultas válidas (mais comum sem `X-Api-Key`) — o cliente já repete a chamada
algumas vezes antes de desistir.

## Convenções de código

- **Nomes em português** (arquivos, funções, variáveis, colunas do banco) — o dono do projeto lê o código.
- Comentários explicam **por quê**, não o quê.
- Repositórios (`src/**/*.repo.js`) são a única camada que fala com o banco.

## Convenções de CSS

- **Layout só com Flexbox** (sem CSS Grid), classes utilitárias pequenas e combináveis.
- **Separador `--` entre palavras** no nome da classe: `.flex--row`, `.gap--4`.
- **Nenhuma cor literal fora do `:root`** — tudo via token (`--color-primary`, `--color-danger`).
- `public/assets/css/global/global.css` = utilitários agnósticos (copiado do omvazap sem alteração —
  serve para qualquer projeto).
- `public/assets/css/project/project.css` = tokens e componentes deste projeto (tema escuro + verde-água).
- Uma página = um arquivo HTML, cada página em sua própria pasta.

## Segurança (não negociável)

- Nunca montar HTML com dado do usuário via `innerHTML` — só `textContent`.
- Segredos só em `.env` (fora do Git). Nada de chave no código ou no frontend.
- Senha sempre com hash + salt (`scrypt`), nunca em texto puro nem reversível.
- Comparação de senha em tempo constante (`timingSafeEqual`), nunca `===`.
