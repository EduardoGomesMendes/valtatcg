# Moderação do fórum: guia do moderador

| | |
|---|---|
| **Versão** | 1.0 (rascunho operacional) |
| **Data** | 27/10/2026 |
| **Quem modera** | Um administrador **maior de 18 anos** (o sistema não deixa promover menor a administrador) |
| **Status** | Rascunho. Os pontos legais precisam de revisão de advogado. |

O fórum aceita menores de 18 anos (a partir de 13). Isso exige atenção ativa: o sistema barra o óbvio, mas **quem protege de verdade é o moderador**. Este guia diz o que o sistema faz sozinho, o que você olha, e o que fazer quando algo é grave.

## 1. O que o sistema faz sozinho

| Camada | O que faz |
|---|---|
| **Só texto** | Sem imagens, sem anexos. Nada de foto de pessoa no fórum. |
| **Só nome de usuário** | O fórum mostra o apelido, nunca o nome completo, e-mail, foto de perfil ou idade. O apelido também passa pelo filtro (sem ofensa, sexual ou telefone). |
| **Sem mensagem privada** | O ValtaTCG **não tem** conversa privada entre usuários. Tudo é público e moderável. Mantenha assim. |
| **Filtro antes de publicar** | A mensagem que pede telefone, WhatsApp ou redes, combina encontro, pede foto, idade, endereço ou escola, pede "segredo", tem assunto sexual ou xingamento **não é publicada**. A pessoa vê o motivo e a orientação de denunciar. O filtro entende truques comuns (`p u t a`, `p0rr4`, letras repetidas). |
| **Suspensão automática** | **3 tentativas graves em 24 horas** (contato, encontro, foto/dados, segredo, sexual) suspendem a conta na hora e abrem uma denúncia **urgente** para você. Ofensa e link barram a mensagem, mas não contam como grave. |
| **Denúncia de segurança** | O motivo "contato inadequado com menor" **oculta o conteúdo na hora**, antes da sua análise, e vai para o topo da fila. Se foi engano, você mostra de novo. |
| **Limites** | No máximo 3 tópicos e 20 respostas por hora por pessoa. |
| **Leitura só com conta** | O conteúdo do fórum só é entregue a quem está logado; quem não tem conta não lê nada. |

> **Limite do filtro:** quem quer burlar sempre encontra um jeito (escrever "zap" com símbolos, usar outra língua, combinar com indiretas). O filtro reduz o volume; só a sua leitura pega o resto.

## 2. Sua rotina

**Aviso fixo:** em toda página, no topo, aparece o número de denúncias abertas. Vermelho = há denúncia urgente de segurança de menores.

**Todo dia (5 a 10 minutos), em `Admin → Moderação`:**

1. **Mensagens recentes.** Leia o que foi escrito, não só o denunciado. Dê atenção especial a:
   - a faixa **"Adulto respondendo em tópico de menor"** (destacada em vermelho): confira se a conversa é só sobre cartas;
   - um adulto que **insiste** em responder aos mesmos menores;
   - perguntas pessoais disfarçadas ("de que cidade você é?", "você joga em qual loja?" repetidas por um adulto a um menor);
   - ofensas e bullying entre os próprios menores.
2. **Tentativas bloqueadas.** Quem tentou pedir contato ou encontro e foi barrado é o sinal mais forte. Uma tentativa grave isolada pode ser distração de criança; **repetição por um adulto** é alerta.
3. **Denúncias.** Resolva as urgentes primeiro.

**Prazos internos:**

| Situação | Prazo |
|---|---|
| Denúncia **urgente** (segurança de menor) | **até 24 horas**, de preferência no mesmo dia |
| Golpe ou fraude | até 2 dias úteis |
| Demais denúncias | até 5 dias úteis |

## 3. O que fazer em cada caso

**Ofensa ou bullying leve:** ocultar a mensagem. Reincidente: suspender e avisar o motivo.

**Pedido de telefone, redes, foto, endereço, escola ou encontro (principalmente de adulto para menor):**
1. **Oculte** a mensagem (não apague: é prova).
2. **Suspenda** a conta do autor.
3. Registre na denúncia o que aconteceu (fica no histórico).
4. **Não** converse com o autor por fora da plataforma.

**Suspeita de exploração ou abuso sexual de criança ou adolescente:**
1. Oculte e **suspenda** a conta imediatamente.
2. **Preserve as evidências:** não apague nada. Faça capturas de tela da denúncia, das mensagens e da lista de "Tentativas bloqueadas" dessa conta.
3. **Comunique às autoridades.** Canais: **Disque 100** (Direitos Humanos, atende crimes contra crianças e adolescentes), **SaferNet Brasil** (central de denúncias de crimes na internet) e a **delegacia** mais próxima. O advogado deve confirmar a obrigação e a forma de comunicação da empresa.
4. Avise o dono do sistema (Omva) no mesmo dia.
5. **Não** tente investigar por conta própria nem confrontar o suspeito.

**Menor relatando que foi abordado:** agradeça pelo aviso, confirme que ele fez o certo, oculte o conteúdo, suspenda o autor e trate como o caso acima. Incentive a pessoa a contar a um adulto de confiança.

**Engano (conteúdo ocultado ou conta suspensa sem motivo):** mostre o conteúdo de novo e reative a conta em `Admin → Contas`. Errar para o lado da proteção é aceitável; deixe a pessoa saber que foi um engano.

## 4. Seus próprios cuidados

- Use **apenas a sua conta pessoal de administrador**, nunca uma conta compartilhada.
- Você enxerga nome completo, e-mail e faixa de idade de quem escreve. Esses dados são **só para moderar**: não compartilhe, não copie para outros lugares.
- Não converse com menores fora da plataforma. Se alguém procurar você por fora, não responda e registre.
- O sistema grava quem suspendeu e quando. Aja sempre por um motivo que você consiga explicar depois.

## 5. Dados guardados por causa da moderação

| Dado | Por quê | Por quanto tempo |
|---|---|---|
| Mensagens ocultadas | Prova e possibilidade de desfazer | Enquanto o tópico existir (apagar a conta do autor apaga o que ele escreveu) |
| Registro de mensagens barradas pelo filtro (trecho até 300 caracteres, autor, data) | Detectar quem insiste em violar regras de segurança | **90 dias** (apagado automaticamente) |
| Denúncias e notas do moderador | Histórico de decisões | Enquanto a conta existir |

## 6. Ajustes possíveis (sem programar)

| Variável no `.env` do servidor | Efeito |
|---|---|
| `FORUM_MENORES_ESCREVEM=nao` | Menores de 18 passam a **só ler** o fórum |
| `RESPONSAVEL_OBRIGATORIO=sim` | Volta a exigir o responsável no cadastro de menores (fluxo da fase 0) |

As palavras e frases do filtro ficam em `src/comunidade/filtro.js` e podem ser ampliadas a qualquer momento (uma linha por palavra).

## 7. Pontos que dependem de advogado

1. A **obrigação e a forma de comunicar** à polícia, ao Ministério Público ou à SaferNet casos de exploração de menores.
2. O que a **Lei 15.211/2025 (ECA Digital)** exige de plataformas acessíveis a menores neste caso (verificação de idade, vínculo com responsável, supervisão): o cadastro está aberto de propósito, mas isso precisa ser confirmado.
3. O texto dos **Termos de Uso e da Política de Privacidade** sobre moderação, suspensão automática e registro de tentativas bloqueadas.
4. A **base legal LGPD** para tratar e guardar o registro de mensagens barradas.
