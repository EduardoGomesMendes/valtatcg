# CLAUDE.md — valtatcg

Projeto **pessoal e independente**. Sem relação com `C:\omva\omvazap` nem com as regras daquele repositório.

## Visão geral

Rastreador de portfólio de cartas colecionáveis (TCG), inspirado no [getcollectr.com](https://getcollectr.com).
O usuário cataloga as cartas que possui e acompanha o valor de mercado da coleção ao longo do tempo,
como um portfólio de investimentos.

**v1 cobre só Pokémon**, via a API pública [pokemontcg.io](https://docs.pokemontcg.io). Escopo desta
versão: catálogo + portfólio (o "Track" do Collectr). Fora do escopo por enquanto: scan de carta por
câmera, trade analyzer, feed social, assinatura paga, app mobile nativo, outros jogos de cartas.

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
