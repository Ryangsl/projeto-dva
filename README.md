# Grupo DVA — Gerenciamento e Distribuição de Veículos

Sistema web para **cadastrar e distribuir veículos entre concessionárias do Grupo DVA**. Um Operador, no centro de distribuição, registra o veículo (marca, modelo, chassi, cor, fotos, vídeo, observações e destino) — o **Chassi é o identificador único**. O Admin acompanha tudo numa tela de **Monitoramento** (KPIs, distribuição por centro/marca, busca por chassi, detalhe com fotos e vídeo) e gerencia usuários e centros de distribuição.

> Este projeto foi adaptado do antigo "Guia de Atendimento" PROCAR, reaproveitando autenticação, layout e padrões de CRUD. Ver **[CLAUDE.md](./CLAUDE.md)** (arquitetura, roadmap e decisões).

## Stack

- **Frontend:** React 18 + TypeScript (Vite), mobile-first (foco tablet)
- **Backend:** Node.js + Express (REST) + TypeScript
- **Banco:** MySQL — **dois bancos na mesma instância**: um novo (`dva_veiculos`) e o antigo do PROCAR (`painel_procar`, intocado, usado só para ler o catálogo de marca/modelo já importado da FIPE)
- **Upload:** `multer`, disco local (`backend/uploads/`), servido atrás de autenticação
- **Auth:** JWT em cookie httpOnly + CSRF double-submit + sessão no banco

## Estrutura

```
procar-dva/
├── backend/    # API REST (Express + TS + MySQL), modular por domínio
├── frontend/   # SPA React + TS (Vite)
└── CLAUDE.md   # documentação viva do projeto
```

## Pré-requisitos

- Node.js 20+
- MySQL 8+ em execução, com o **banco antigo do PROCAR já existente e populado** (`vehicle_brands`/`vehicle_models`) — ver [CLAUDE.md §5](./CLAUDE.md#5-arquitetura). O usuário MySQL usado pela aplicação precisa de `GRANT SELECT` nesse banco além do banco novo.

## Como rodar

### 1. Backend

```bash
cd backend
cp .env.example .env      # ajuste DB_*, DB_VEHICLES_NAME e gere o JWT_SECRET
npm install
npm run db:setup          # cria o banco dva_veiculos, aplica o schema e semeia admin/operadores/centros/cores
npm run dev                # API em http://localhost:3333/api
```

> O `.env.example` vem com `JWT_SECRET` **vazio** de propósito. Gere o seu:
> ```bash
> node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
> ```

Usuários criados pelo `db:setup` **em desenvolvimento** (as senhas são aleatórias e aparecem no terminal):

- **Admin:** `admin@dva.com.br` — senha aleatória, ou a de `ADMIN_SENHA_INICIAL` se você definir.
- **3 operadores de exemplo** (Luciano, Claudinei, Bruno — `teste1@teste.com`, `teste2@teste.com`, `teste3@teste.com`), cada um com um centro de distribuição próprio (nomes placeholder, editáveis em `/centros`).

Todos nascem com a senha marcada como temporária: **o primeiro login exige definir uma senha própria**.

> Em produção (`NODE_ENV=production`) as contas de exemplo **não** são criadas, e `ADMIN_SENHA_INICIAL` passa a ser obrigatória.

### 2. Frontend

```bash
cd frontend
cp .env.example .env      # VITE_API_URL aponta para a API (padrão http://localhost:3333/api)
npm install
npm run dev                # app em http://localhost:5173
```

## Scripts úteis

| Local | Comando | O que faz |
|---|---|---|
| backend | `npm run dev` | API com reload (tsx watch) |
| backend | `npm run db:setup` | Cria o banco `dva_veiculos` + seed |
| backend | `npm run build` / `npm start` | Compila TS e roda em produção |
| backend | `npm run typecheck` | Checagem de tipos |
| backend | `npm run import:fipe:marcas` | Importa marcas/modelos da FIPE **para o banco antigo** (`painel_procar`) — só necessário se esse catálogo ainda não estiver populado |
| frontend | `npm run dev` | Servidor de desenvolvimento Vite |
| frontend | `npm run build` | Build de produção |

## API (resumo)

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/api/auth/login` | — | Login (email, senha) |
| GET | `/api/auth/me` | sim | Usuário autenticado |
| GET | `/api/veiculos/opcoes` | sim | Marcas (com modelos), cores e centros ativos — base do formulário |
| POST | `/api/veiculos` | sim | Cadastra um veículo (multipart: campos + fotos + vídeo) |
| GET | `/api/veiculos` / `/api/veiculos/:id` | admin | Listagem/detalhe de veículos |
| GET | `/api/monitoramento/dashboard` | admin | KPIs, série diária, distribuição por centro/marca |
| CRUD | `/api/centros`, `/api/usuarios` | admin | Gestão de centros de distribuição e operadores |

Contrato completo em [CLAUDE.md §7](./CLAUDE.md#7-contrato-da-api).

## Próximas fases

Ver [CLAUDE.md §11](./CLAUDE.md#11-próximos-passos).
