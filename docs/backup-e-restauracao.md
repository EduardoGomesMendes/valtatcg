# Backup e restauração do valtatcg

## O que é guardado, e onde

Todo dia às 03:30 (Brasília) o servidor grava em `/opt/valtatcg/backups/`:

| Arquivo | O que tem |
|---|---|
| `valtatcg-AAAA-MM-DD_HHMM.db.gz` | o banco inteiro (contas, coleções, assinaturas, lojas, fórum), cópia consistente, já conferida |
| `valtatcg-arquivos-AAAA-MM-DD_HHMM.tar.gz` | as logos das lojas (`logos`), as fotos de perfil (`avatares`) e, se existirem, os vínculos de responsável (`vinculos`) |
| `ULTIMO-banco.db.gz`, `ULTIMO-arquivos.tar.gz`, `ULTIMO.json` | cópias de nome fixo do mais recente, e o resumo dele |

O `.env` **não** entra no backup (tem segredos: senha do e-mail, chave do Asaas). Guarde uma cópia dele no seu gerenciador de senhas.

Retenção: 14 dias de backups diários, mais o de domingo por 8 semanas.

## Ligar (uma vez)

Depois de publicar esta versão e esperar o servidor atualizar (~2 min), no servidor, como root:

```bash
bash /opt/valtatcg/app/scripts/instalar-backup.sh
```

Ele descobre o usuário do serviço, cria `/opt/valtatcg/backups`, instala o timer do systemd e **roda um backup na hora**,
mostrando o resultado. Pode rodar de novo sem problema.

Conferir depois: `systemctl list-timers valtatcg-backup.timer` e `cat /opt/valtatcg/backups/ULTIMO.json` (a data de
`quando` precisa ser de hoje ou de ontem).

Se o backup falhar e houver `EMAIL_AVISO_DONO` no `.env` (com o SMTP configurado), o sistema avisa por e-mail.
Sem essa variável, a falha só aparece em `journalctl -u valtatcg-backup -n 50`; por isso vale configurá-la.

## Cópia fora do servidor (importante)

O backup na própria VPS protege de erro de software, não de perder a VPS. Duas formas de ter uma cópia fora:

1. **Hostinger:** no painel da VPS, ligue o backup automático (snapshots). A VPS é a mesma do omvazap.
2. **No seu computador:** dê dois cliques em `baixar-backup.cmd` (na pasta do valtatcg). Ele baixa o último backup para
   `C:\omva\backups\valtatcg\`. Faça isso uma vez por semana, no mínimo. Usa a mesma chave ssh do omvazap.

## Restaurar o banco (servidor novo ou banco corrompido)

Faça com o serviço parado, e sempre guardando o que existe antes. Troque `USUARIO` pelo usuário do serviço
(`systemctl show valtatcg -p User --value`; se vier vazio, é `root`).

```bash
systemctl stop valtatcg
cd /opt/valtatcg/app/data
mv valtatcg.db valtatcg.db.quebrado-$(date +%F)        # guarda o atual, não apaga
rm -f valtatcg.db-wal valtatcg.db-shm                  # arquivos auxiliares do banco antigo
gunzip -c /opt/valtatcg/backups/ULTIMO-banco.db.gz > valtatcg.db
chown USUARIO:USUARIO valtatcg.db
node --input-type=module -e "import {DatabaseSync} from 'node:sqlite'; const d=new DatabaseSync('valtatcg.db',{readOnly:true}); console.log(d.prepare('PRAGMA integrity_check').get(), d.prepare('SELECT COUNT(*) n FROM usuarios').get())"
systemctl start valtatcg
```

O resultado do `integrity_check` precisa ser `ok`. Depois confira no site se as contas e as assinaturas estão como esperado.

## Restaurar as logos e as fotos de perfil

```bash
systemctl stop valtatcg
cd /opt/valtatcg/app/data
tar -xzf /opt/valtatcg/backups/ULTIMO-arquivos.tar.gz        # recoloca logos/, avatares/ (e vinculos/)
chown -R USUARIO:USUARIO logos avatares
systemctl start valtatcg
```

## Servidor novo, do zero

1. Instalar Node 22+ e o proxy HTTPS e clonar o repositório em `/opt/valtatcg/app`.
2. Recriar o `.env` (do gerenciador de senhas) e rodar `npm ci --omit=dev`.
3. Restaurar o banco e os arquivos como acima.
4. Instalar o serviço do valtatcg, rodar `scripts/instalar-backup.sh` e apontar o DNS (`valtatcg.com.br`) para o IP novo.
5. O webhook do Asaas continua apontando para `https://valtatcg.com.br/api/pagamento/asaas`: não precisa recadastrar
   se o endereço for o mesmo.

## Testar a restauração (faça uma vez por trimestre)

Backup que nunca foi restaurado é só uma esperança. Baixe um backup com `baixar-backup.cmd`, descompacte o `.db.gz` e abra
com o comando de `integrity_check` acima (no seu computador) para conferir a integridade e a contagem de usuários.
