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
- `FIPE_API_KEY` — chave da API pública da FIPE (gere/consulte em [parallelum.com.br/fipe](https://parallelum.com.br/fipe)).

Em produção isso é o `.env` compartilhado em `/var/www/procar/shared/backend/.env` (Seção 11.1 do DEPLOY.md), com `chmod 600` — nada novo a configurar além de preencher `FIPE_API_KEY` lá, uma vez. **Nunca cole a chave da FIPE em chat, e-mail ou commit** — se ela já circulou por algum desses canais, gere uma nova.

## 4. Passo 1 — Garantir que as tabelas existem na VPS

Desde que `vehicle_brands`/`vehicle_models` entraram no `schema.sql` (como estrutura vazia — os dados continuam vindo só deste script), **`npm run db:setup` já cria as duas tabelas**. Se você rodou `db:setup` normalmente, pode pular direto para o Passo 2.

Só é preciso criar manualmente se você está num banco **anterior** a essa mudança e ainda não rodou `db:setup` de novo (ele é idempotente — `CREATE TABLE IF NOT EXISTS` — então rodá-lo novamente é seguro e não apaga nada):

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

## 5. Passo 2 — Preencher `FIPE_API_KEY` e rodar

O script já está na VPS junto com o resto do backend (`current/backend/src/database/import-fipe/`), então não há nada para copiar. Só falta a chave da API:

```bash
nano /var/www/procar/shared/backend/.env
```

Garanta que a linha exista e esteja preenchida:
```bash
FIPE_API_KEY=SUA_CHAVE_DA_API_FIPE_AQUI
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
- [ ] `FIPE_API_KEY` preenchida em `/var/www/procar/shared/backend/.env` (passo 5).
- [ ] `npm run import:fipe:marcas` executado com sucesso.
- [ ] Contagem de marcas/modelos conferida no banco.
- [ ] Testado no sistema publicado: veículos aparecem no wizard de atendimento.
- [ ] (Opcional, avaliar depois) `import:fipe:anos` — só se algum dia houver funcionalidade que dependa do ano do veículo.
