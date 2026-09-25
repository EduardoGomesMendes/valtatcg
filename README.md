# valtatcg

Rastreador de portfólio de cartas colecionáveis — cadastre as cartas que você tem e acompanhe o valor
de mercado da sua coleção ao longo do tempo. v1 cobre Pokémon, via [pokemontcg.io](https://pokemontcg.io).

## Como rodar

1. Copie `.env.example` para `.env` (opcional preencher `POKEMONTCG_API_KEY` — sem ela funciona, só
   com limite de requisições menor).
2. Dê dois cliques em `iniciar.cmd` (ou rode `npm start`).
3. Acesse http://localhost:3300 e crie uma conta.

Requer Node.js 22.5 ou mais recente (usa `node:sqlite`, embutido — sem instalar banco separado).

## Atalhos

- `iniciar.cmd` — sobe o servidor.
- `testar.cmd` — roda os testes automatizados.
- `limpar.cmd` — apaga todos os dados (coleção e usuários), para começar do zero.

## Dados de teste

`npm run db:seed` cria um usuário de teste: `demo@valtatcg.local` / `Demo1234`.
