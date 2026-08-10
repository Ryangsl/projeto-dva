# PROCAR — Guia de Atendimento

Sistema web que **guia o consultor durante o atendimento**: informando carro → modelo → cor, ele mostra o **roteiro do que falar** com o cliente (frases sugeridas) e os **serviços a ofertar** (PPF, vitrificação, película...) com o argumento de venda contextualizado.

> **Não é um fichário de clientes** — o valor está no guia. Registrar dados de cliente/veículo é secundário/opcional. Ver **[CLAUDE.md](./CLAUDE.md)** (arquitetura, roadmap e decisões).

### Leveza / internet ruim
O conteúdo do guia é baixado **uma vez** e **cacheado no navegador**; depois disso, selecionar veículo e ver o roteiro/ofertas **não usa a rede** (as regras são avaliadas no próprio frontend).

## Status

- **Guia de Atendimento (foco):** funcional — seleção Carro→Modelo→Cor, roteiro personalizado e oportunidades de venda. Tela inicial após o login.
- **Veículos vêm do MySQL:** marcas/modelos das tabelas `vehicle_brands`/`vehicle_models` (importadas da FIPE), filtrados pelas **marcas principais** (editável em `backend/src/modules/guia/marcas-principais.ts`).
- **Fichário removido:** o sistema não cadastra dados de clientes.

## Stack

- **Frontend:** React 18 + TypeScript (Vite), mobile-first (foco tablet)
- **Backend:** Node.js + Express (REST) + TypeScript
- **Banco:** MySQL
- **Auth (fase atual):** validação no banco (bcrypt) + header `x-usuario-id` — JWT virá depois

## Estrutura

```
painel-procar/
├── backend/    # API REST (Express + TS + MySQL), modular por domínio
├── frontend/   # SPA React + TS (Vite)
└── CLAUDE.md   # documentação viva do projeto
```

## Pré-requisitos

- Node.js 20+
- MySQL 8+ em execução

## Como rodar

### 1. Backend

```bash
cd backend
cp .env.example .env      # ajuste DB_* conforme seu MySQL e gere o JWT_SECRET
npm install
npm run db:setup          # cria o banco, aplica o schema e o usuário admin inicial
npm run dev               # API em http://localhost:3333/api
```

> O `.env.example` vem com `JWT_SECRET` **vazio** de propósito. Gere o seu:
> ```bash
> node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
> ```

Usuários criados pelo `db:setup` **em desenvolvimento** (as senhas são aleatórias e aparecem no terminal — não há mais senha padrão compartilhada):

- **Admin:** `admin@procar.com` — senha aleatória, ou a de `ADMIN_SENHA_INICIAL` se você definir.
- **Um consultor por concessionária** (`bmw@procar.com.br`, `volkswagen@procar.com.br`, ...) — senha aleatória individual.

Todos nascem com a senha marcada como temporária: **o primeiro login exige definir uma senha própria**.

> Em produção (`NODE_ENV=production`) as contas de concessionária **não** são criadas, e `ADMIN_SENHA_INICIAL` passa a ser obrigatória. Ver [DEPLOY.md](./DEPLOY.md) e [SECURITY-REVIEW.md](./SECURITY-REVIEW.md).

### 2. Frontend

```bash
cd frontend
cp .env.example .env      # VITE_API_URL aponta para a API (padrão http://localhost:3333/api)
npm install
npm run dev               # app em http://localhost:5173
```

## Scripts úteis

| Local | Comando | O que faz |
|---|---|---|
| backend | `npm run dev` | API com reload (tsx watch) |
| backend | `npm run db:setup` | Cria/atualiza banco + seed |
| backend | `npm run build` / `npm start` | Compila TS e roda em produção |
| backend | `npm run typecheck` | Checagem de tipos |
| frontend | `npm run dev` | Servidor de desenvolvimento Vite |
| frontend | `npm run build` | Build de produção |

## API

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/api/auth/login` | — | Login (email, senha) → usuário |
| GET | `/api/auth/me` | sim | Usuário autenticado |
| GET | `/api/guia/dados` | sim | **Todo o conteúdo do guia** (marcas+modelos das `vehicle_*`, cores, serviços, roteiro, regras) numa resposta — cacheado no cliente |

> Autenticação da fase atual: envie o header `x-usuario-id: <id>` nas rotas protegidas (o frontend faz isso automaticamente após o login).

### Dados de veículos (FIPE)
As tabelas `vehicle_brands` / `vehicle_models` (e futuras `vehicle_years` / `vehicle_categories`) são **importadas da FIPE** por processo próprio e **não** são criadas pelo `db:setup`. O `db:setup` cria apenas `usuarios` e o conteúdo do guia. Ajuste as marcas exibidas em `backend/src/modules/guia/marcas-principais.ts`.

## Próximas fases

- **P3** — Painel administrativo do guia (gestor edita produtos, roteiro e regras)
- **P4** — Status do atendimento, envio de resumo por WhatsApp, pequenos relatórios
- Integração opcional de API pública de veículos (FIPE) — adiada pela internet ruim
- Introdução de **JWT** na autenticação

Detalhes em [CLAUDE.md](./CLAUDE.md).
