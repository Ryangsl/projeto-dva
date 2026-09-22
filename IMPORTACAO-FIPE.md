# IMPORTACAO-FIPE.md — Alimentando a base de veículos (FIPE) na VPS

> Guia focado em **uma etapa específica**: rodar o script que preenche as tabelas de veículos (`vehicle_brands`, `vehicle_models`) no MySQL de produção. É a **Opção B** citada na seção 12.5 do [DEPLOY.md](./DEPLOY.md).

## 1. O que essa etapa faz

O guia de atendimento (`GET /api/guia/dados`) só mostra marcas/modelos se as tabelas `vehicle_brands` e `vehicle_models` estiverem **populadas** no MySQL. A **estrutura** dessas tabelas faz parte do `schema.sql`/`npm run db:setup` (só isso: `CREATE TABLE IF NOT EXISTS`, sem chamada à FIPE); os **dados** continuam vindo à parte, a partir da API pública da FIPE, por um script que vive em `backend/src/database/import-fipe/`:

| Script | Comando | Uso |
|---|---|---|
| `marcas-modelos.ts` | `npm run import:fipe:marcas` | **Padrão.** Busca todas as marcas e modelos na FIPE e grava em `vehicle_brands`/`vehicle_models`. Rápido (uma chamada por marca, ~10 marcas principais). |
| `anos.ts` | `npm run import:fipe:anos` | **Opcional, fora do fluxo de deploy** — ver §6. |

O script vive **dentro do repositório do backend** (mesmo `git clone`/deploy do resto do sistema) e reaproveita a configuração já existente — a mesma conexão MySQL (`config/database.ts`) e o mesmo `.env` do backend, sem credencial duplicada. Não faz parte do `db:setup` nem roda no boot do servidor: é um script de manutenção, disparado manualmente quando quiser popular ou atualizar o catálogo.

## 2. Quando rodar

- **Na primeira vez que a VPS entra em produção**, logo depois do `npm run db:setup` (que cria o resto do banco) e antes de liberar o sistema para os consultores — a menos que você opte pela Opção A do DEPLOY.md (restaurar um dump do seu banco local, ainda mais rápido).
- **De tempos em tempos** para atualizar o catálogo (novos modelos que a FIPE adicionar). O script usa `INSERT IGNORE`, então **rodar de novo não duplica nada** — só adiciona o que for novo.

## 3. Credenciais — já resolvidas pelo `.env` do backend

Diferente da versão anterior deste guia (quando os scripts eram arquivos avulsos com senha e chave de API escritas direto no código), agora o script lê tudo do `.env` do backend:

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` — as mesmas variáveis que o resto da API já usa.
- `FIPE_SUBSCRIPTION_TOKEN` — **opcional**. A API usada é a v2 pública (`fipe.parallelum.com.br/api/v2`), que funciona **sem nenhum token**, limitada a 500 requisições/dia por IP; um token gratuito (cadastro em [fipe.parallelum.com.br](https://fipe.parallelum.com.br)) eleva o limite a 1000/dia. O token, quando presente, vai no header `X-Subscription-Token` — nunca como `Authorization: Bearer` (a v2 responde 401 se receber isso).

Em produção isso é o `.env` compartilhado em `/var/www/procar/shared/backend/.env` (Seção 11.1 do DEPLOY.md), com `chmod 600`. Como o token é opcional, não há nada obrigatório a preencher aqui além do que o resto da API já usa — só vale a pena se o catálogo completo (todas as marcas da FIPE, não só as do grupo) esbarrar no limite de 500/dia numa única importação. **Nunca cole o token da FIPE em chat, e-mail ou commit** — se ele já circulou por algum desses canais, gere um novo.

## 4. Passo 1 — Garantir que as tabelas existem na VPS

`npm run db:setup` já cria as duas tabelas automaticamente — não em `schema.sql` (esse é só o schema do banco `dva_veiculos`), mas direto em `database/setup.ts`, que garante `vehicle_brands`/`vehicle_models` (`CREATE TABLE IF NOT EXISTS`) no banco **antigo** (`DB_VEHICLES_NAME`, padrão `painel_procar`) antes de tocar no schema novo. Puramente aditivo: nunca altera nem apaga nada que já exista lá. Se você rodou `db:setup` normalmente, pode pular direto para o Passo 2.

Só é preciso criar manualmente se, por algum motivo, você não puder rodar `db:setup` contra esse banco (ele é idempotente — `CREATE TABLE IF NOT EXISTS` — então rodá-lo de novo é sempre seguro e não apaga nada):

```bash
cd /var/www/procar/current/backend
npm run db:setup
```

Se preferir criar à mão em vez de rodar o `db:setup`:

```bash
mysql -u procar_app -p painel_procar
```

```sql
CREATE TABLE IF NOT EXISTS vehicle_brands (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  fipe_brand_id VARCHAR(20) NOT NULL,
  name          VARCHAR(120) NOT NULL,
  UNIQUE KEY uq_vehicle_brands_fipe (fipe_brand_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS vehicle_models (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  brand_id       INT NOT NULL,
  fipe_model_id  VARCHAR(20) NOT NULL,
  name           VARCHAR(160) NOT NULL,
  category       VARCHAR(40) NULL,
  years_imported TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_vehicle_models_fipe (brand_id, fipe_model_id),
  CONSTRAINT fk_vehicle_models_brand FOREIGN KEY (brand_id) REFERENCES vehicle_brands(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

> A tabela `vehicle_years` (usada só pelo script opcional de anos, §6) continua fora do `schema.sql`/`db:setup` — crie-a manualmente apenas se/quando for rodar `import:fipe:anos`. A definição dela está em §6.
>
> As chaves `UNIQUE KEY` são o que faz o `INSERT IGNORE` do script funcionar corretamente (evita duplicar marca/modelo ao rodar de novo). Se você já importou essas tabelas de outro banco (Opção A do DEPLOY.md) e elas não têm essas chaves únicas, considere adicioná-las com `ALTER TABLE` antes de rodar o script — senão o `INSERT IGNORE` pode não impedir duplicatas.

Saia do MySQL com `EXIT;` (se tiver aberto a sessão manual).

## 5. Passo 2 — Rodar (token é opcional)

O script já está na VPS junto com o resto do backend (`current/backend/src/database/import-fipe/`), então não há nada para copiar nem nenhuma chave obrigatória a preencher — a v2 da FIPE funciona sem autenticação. Só se quiser o limite maior (1000 req/dia em vez de 500):

```bash
nano /var/www/procar/shared/backend/.env
```

```bash
FIPE_SUBSCRIPTION_TOKEN=SEU_TOKEN_GRATUITO_AQUI
```

Como o `.env` do backend já é reaproveitado via symlink em cada release (`ln -sf .../shared/backend/.env backend/.env`, Seção 12.3 do DEPLOY.md), não precisa repetir isso a cada deploy.

Rode:
```bash
cd /var/www/procar/current/backend
npm run import:fipe:marcas
```
É rápido (só marcas + modelos, sem `screen` nem retomada — isso fica reservado para o script opcional de anos, §6).

Confira que veio tudo:
```bash
mysql -u procar_app -p painel_procar -e "SELECT COUNT(*) AS marcas FROM vehicle_brands; SELECT COUNT(*) AS modelos FROM vehicle_models;"
```
✅ **Deve aparecer:** números bem acima de zero (milhares de modelos). Depois, abra o sistema publicado, faça login com um usuário de teste (ex.: `bmw@procar.com.br`) e confira se os modelos aparecem no wizard de atendimento.

## 6. Sobre o script de anos (`import:fipe:anos`) — opcional, fora do fluxo padrão

Este script **não faz parte do deploy padrão do PROCAR** e não é necessário para o sistema funcionar: nada no guia de atendimento hoje lê a tabela `vehicle_years` (a categoria do veículo, usada nas regras de oferta, vem direto de `vehicle_models.category`, preenchida por outro processo — ver `CLAUDE.md` §6/§11). Ele existe só para quem quiser, no futuro, uma funcionalidade que dependa do ano do veículo.

**Por que ele fica de fora do fluxo normal:** faz uma chamada à API da FIPE **por modelo já importado** (são milhares) com uma pequena pausa entre cada uma, para não estourar o limite da API — mesmo assim, é comum a FIPE responder "limite atingido" (HTTP 429) bem antes de terminar. Isso pode levar de minutos a várias horas, espalhadas por vários dias de tentativas, o que o torna inadequado para um passo de deploy (que deve terminar numa sessão previsível).

Se ainda assim quiser rodá-lo, algum dia, fora de qualquer deploy:

1. Crie a tabela (se ainda não existir):
   ```sql
   CREATE TABLE IF NOT EXISTS vehicle_years (
     id             INT AUTO_INCREMENT PRIMARY KEY,
     model_id       INT NOT NULL,
     fipe_year_code VARCHAR(20) NOT NULL,
     year_name      VARCHAR(40) NOT NULL,
     UNIQUE KEY uq_vehicle_years_fipe (model_id, fipe_year_code),
     CONSTRAINT fk_vehicle_years_model FOREIGN KEY (model_id) REFERENCES vehicle_models(id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
   ```
2. Rode dentro de uma sessão `screen`, para não perder o progresso se a conexão SSH cair:
   ```bash
   apt install -y screen   # se ainda não tiver instalado
   screen -S importacao-fipe-anos
   cd /var/www/procar/current/backend
   npm run import:fipe:anos
   ```
   `Ctrl+A` depois `D` sai sem interromper; `screen -r importacao-fipe-anos` retoma.
3. Se a FIPE responder 429, o script **para sozinho** e avisa no terminal — não é erro grave, é só rodar `npm run import:fipe:anos` de novo mais tarde (no dia seguinte, por exemplo). Como ele só busca modelos com `years_imported = 0`, **continua exatamente de onde parou**, sem repetir trabalho:
   ```bash
   mysql -u procar_app -p painel_procar -e "SELECT COUNT(*) FROM vehicle_models WHERE years_imported = 0;"
   ```
4. Rode a partir de `current/backend` (a release ativa), não de dentro de `releases/TIMESTAMP` — assim, se um deploy trocar o `current` enquanto essa importação (potencialmente de vários dias) ainda está em andamento, não há ambiguidade sobre qual código rodou. Evite disparar um deploy no meio dela.

## 7. Repetindo a importação de marcas/modelos no futuro (catálogo atualizado)

Não precisa recriar nada — é só rodar `npm run import:fipe:marcas` de novo quando quiser atualizar o catálogo (ex.: uma vez por ano, ou quando a FIPE lançar modelos novos). Graças ao `INSERT IGNORE`, só adiciona o que for novo.

## 8. O que essa importação ainda não cobre

Conforme o `CLAUDE.md` (seção 6 e "Próximos Passos"), a coluna `category` de `vehicle_models` e a tabela `vehicle_categories` **ainda não são preenchidas** por nenhum processo — nem por este script. Isso não trava o guia (regras por categoria, como "Picape", simplesmente não disparam até isso ser implementado), mas é um passo pendente do roadmap, não algo a resolver nesta etapa.

## 9. Checklist rápido

- [ ] Tabelas `vehicle_brands`, `vehicle_models` existem no banco da VPS (criadas por `db:setup`; passo 4 só se precisar criar à mão).
- [ ] (Opcional) `FIPE_SUBSCRIPTION_TOKEN` preenchido em `/var/www/procar/shared/backend/.env`, se quiser o limite de 1000 req/dia em vez de 500 (passo 5).
- [ ] `npm run import:fipe:marcas` executado com sucesso.
- [ ] Contagem de marcas/modelos conferida no banco.
- [ ] Testado no sistema publicado: veículos aparecem no wizard de atendimento.
- [ ] (Opcional, avaliar depois) `import:fipe:anos` — só se algum dia houver funcionalidade que dependa do ano do veículo.
