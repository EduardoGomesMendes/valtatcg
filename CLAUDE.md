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

## Cadastro: e-mail primeiro, senha depois

Igual ao omvazap e ao omvalic. O formulário de cadastro **não pede senha**: `POST /api/cadastro` valida os dados
e grava um pedido em `cadastros_pendentes` (só o **hash** do token; sem conta ainda). O e-mail leva a
`/confirmar/?t=...`, onde a pessoa escolhe a senha; só então `POST /api/cadastro/concluir` cria o usuário
(`usuarios.criar`), inicia o teste grátis e abre a sessão. Regras que não podem se perder:
- A consulta do link (`GET /cadastro/confirmar`) **só lê**: leitores de e-mail abrem links sozinhos e não podem gastá-lo.
  O link vale `CADASTRO_VALIDADE_HORAS` (24 h) e uma vez; reenviar troca o link (o anterior morre).
- A resposta do pedido é a mesma haja ou não conta para o e-mail (não entrega quem é usuário); quem já tem conta
  recebe um aviso por e-mail. Já o **nome de usuário em uso** é dito na tela (ele é público no fórum).
- Limites por e-mail (3/dia) e por IP (8/hora) ficam no banco (`cadastros_envios`), não na memória.
- Sem e-mail configurado o cadastro fecha (`/cadastro/estado` → `aberto: false`). Em desenvolvimento use
  `EMAIL_MODO=console`: o link aparece no log. `/registrar` (conta com senha direto) **não existe mais**.
- Pedido não confirmado é apagado 7 dias após vencer (guarda data de nascimento); ao criar a conta o pedido
  esquece nascimento e responsável (passam a viver só em `usuarios`).
- Contas antigas não mudam.

## Backup (guia completo em `docs/backup-e-restauracao.md`)

`scripts/backup.mjs` faz, todo dia às 03:30, cópia **consistente** do banco (`VACUUM INTO`, com o site no ar) + logos,
fotos de perfil e vínculos, em `/opt/valtatcg/backups/`, conferindo o `integrity_check` antes de guardar; 14 diários +
domingos por 8 semanas. `scripts/instalar-backup.sh` (root, uma vez) instala o timer do systemd e roda um backup na hora.
`baixar-backup.cmd` traz uma cópia para o PC (fora da VPS). Se criar pasta nova de arquivos em `data/`, **inclua-a em
`PASTAS_DE_ARQUIVOS`** no script: o que não está no banco e não está lá não tem backup. `testes/backup.teste.js` restaura
um backup de verdade e confere a retenção.

## Termos de Uso e Política de Privacidade (próprios do ValtaTCG)

`public/termos/` e `public/privacidade/` são **independentes** dos documentos de omva.com.br (que falam de omvazap,
omvalic e omvalot, só para maiores de 18). O cadastro e o rodapé de todas as páginas apontam para estes. São a fonte
das regras do fórum (seção 8 dos Termos; a caixa "Regras do fórum" do `/forum/` é o resumo e aponta para lá).
- **Quando mudar uma regra no código, mude o texto** (e a data "Última atualização"): preço do plano e da loja, dias de
  teste, prazo de 48 h, idade mínima, retenções (7 dias de cadastro/IP, 90 dias de mensagens barradas, 60 dias de
  histórico de preço), sessão. `testes/termos.teste.js` confere esses números contra `config.js` e quebra se divergirem.
- As páginas públicas (`/`, `/entrar/`, `/lojas/`, `/eventos/`) **não podem mencionar o fórum** (decisão de produto,
  testada em `paginas.teste.js`); o fórum só aparece nos Termos e na Política, que são texto legal.
- **Termo de aceite do fórum**: ninguém (exceto admin) escreve tópico ou resposta sem ter aceitado a versão em vigor
  (`usuarios.aceite_forum_em` + `aceite_forum_versao`; sem aceite, as rotas respondem **403** com `precisaAceitarRegras`).
  Ler continua livre. Menor também declara que o responsável sabe que ele usa o fórum. **Mudou uma regra de verdade?**
  Mude o texto nos Termos (seção 8) e na caixa do `/forum/` **e suba `VERSAO_REGRAS` em `forum.repo.js`** — é isso que
  faz todo mundo aceitar de novo. O filtro também barra Pix/dados bancários (classe `financeiro`, não conta como grave).
  Fica de fora de propósito: mensagens privadas, anúncios de troca/venda e tags de jogo (o ValtaTCG é só Pokémon).
- Texto jurídico escrito como rascunho: **precisa de revisão de advogado** antes de ser tratado como definitivo.

## Assinatura do cliente: regras que a revisão de 28/10/2026 fixou

- **Cancelar não corta o que já foi pago**: `cancelada` com `assinatura_expira_em` no futuro segue liberada até a data
  (igual à loja); voltar a assinar soma os dias que sobraram. **Estorno/chargeback corta na hora**
  (`cancelar(..., { imediato: true })`).
- **Assinar com assinatura já ativa é 409** (usuário e loja): sem isso o clique duplo cancelava a recorrência em vigor e
  abria outra cobrança no mesmo dia.
- **Trocar a senha no perfil derruba as outras sessões**; **trocar o e-mail exige a senha atual** (o e-mail é o canal do
  "esqueci minha senha", então sessão roubada + e-mail novo = conta tomada).
- Coleção: quantidade até 100 mil, variante/condição até 40 caracteres, data AAAA-MM-DD existente e não futura, preço até
  1 milhão; tudo validado **antes** de chamar a pokemontcg.io. Falha da API externa vira 404/502 com mensagem própria.
- `GET /perfil/avatar` responde 204 (não 404) quando não há foto: o 404 virava erro vermelho no console de toda página.

## Cobrança: Asaas da Omva (conta compartilhada)

Passo a passo e conferências em `docs/cobranca-asaas.md`; o servidor é ligado com `scripts/configurar-asaas.sh`
(lê a chave sem mostrar, confere que é a conta do CNPJ da Omva e cadastra o webhook pela API). A conta é a
mesma do omvazap e do omvalic, e o Asaas manda **todo evento para todos os webhooks**: o webhook do valtatcg
ignora, **sem gravar**, o que não tem `usuario:ID`/`loja:ID` nem assinatura nossa (o corpo traz cliente de outro
produto). Chave de API própria do valtatcg, nunca a de outro produto; token do webhook nunca é a chave.

## Esqueci minha senha

`/esqueci-senha/` → `POST /api/senha/esqueci` → e-mail com `/redefinir-senha/?t=...` → `POST /api/senha/redefinir`.
Mesmo desenho do cadastro, com estas regras:
- A resposta é **idêntica** com ou sem conta (e conta suspensa conta como "sem conta"); o e-mail sai em segundo plano
  para o tempo de resposta também não denunciar quem é usuário. Pedido sem conta entra em `redefinicoes_senha` sem
  token, só para os limites (5/dia por e-mail, 10/hora por IP) valerem para todos.
- Link de **60 minutos**, uma vez só; pedir de novo cancela o anterior; abrir o link só lê.
- Trocar a senha **derruba todas as sessões** da conta e manda e-mail de "senha alterada". Não loga sozinho:
  volta ao login (`/entrar/?senha=trocada`).
- Sem e-mail configurado a tela avisa (`/senha/estado`). Em desenvolvimento, `EMAIL_MODO=console` imprime o link no log.

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

A variação mostrada na busca ("sem histórico" quando não há) compara com o último dia anterior em que NÓS vimos
o preço da carta. Por isso o job diário também renova, em lotes de 25 (`obterCartasPorIds`), as cartas que
**só apareceram em buscas** nas últimas 2 semanas (`carta_cache.visto_em`, marcado por busca/página da carta;
o job não o renova, então carta que ninguém volta a procurar sai do acompanhamento). Carta nunca vista antes
continua "sem histórico" até o dia seguinte à primeira busca: a pokemontcg.io não tem preço retroativo.

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
