# Grupo DVA — Gerenciamento e Distribuição de Veículos

> Documento vivo. Fonte de verdade sobre o projeto: visão, arquitetura, decisões, estrutura e log de evolução. **Atualizar a cada mudança relevante** (nova feature, decisão de arquitetura, migration, etc.).

## 0. Origem do projeto

Este projeto nasceu como o **"Guia de Atendimento" da PROCAR** (roteiro de vendas por veículo/cor/setor). Em 2026-08-10 o cliente pediu uma **transformação completa de propósito**: o produto passou a ser um **MVP de gerenciamento e distribuição de veículos do Grupo DVA**, reaproveitando ao máximo a estrutura já validada (autenticação JWT em cookie httpOnly, sessões, primeiro acesso, rate limit, headers de segurança, layout mobile-first, componentes de UI, padrões de CRUD) e substituindo por completo o domínio de negócio (roteiro de vendas → cadastro/distribuição de veículos).

O histórico detalhado da fase "Guia PROCAR" (ADRs e changelog de 2026-07-02 a 2026-07-31) não é reproduzido aqui — está preservado no histórico do git (`git log`) para quem precisar de arqueologia. Este documento descreve o produto **como ele é agora**.

## 1. Visão do Produto

**O produto é um sistema de GERENCIAMENTO E DISTRIBUIÇÃO DE VEÍCULOS entre concessionárias do Grupo DVA — não é um CRM nem um guia de vendas.**

Um **Operador**, num centro de distribuição, registra um veículo que será enviado a uma concessionária: informa marca, modelo, chassi, cor, anexa fotos e vídeo, escreve observações e indica o destino. O **Chassi é o identificador único do veículo** no sistema — não existem dois cadastros para o mesmo chassi.

O **Admin** acompanha tudo numa tela de **Monitoramento**: quantos veículos foram cadastrados (total, hoje, por período), a distribuição por centro e por marca, uma lista pesquisável por chassi e o detalhe completo de cada veículo (fotos + vídeo + dados). O Admin também gerencia os **Usuários** (operadores) e os **Centros de Distribuição**.

### Personas
- **Operador**: no centro de distribuição, cadastra veículos que serão enviados a uma concessionária. Vinculado a **um único** centro de distribuição (não escolhe — é o da própria conta).
- **Admin**: gerencia usuários, centros de distribuição e acompanha o monitoramento de todos os veículos cadastrados, em qualquer centro. Único perfil administrativo do MVP.

> ⚠️ **O que este sistema NÃO é:** não é um CRM, não tem pipeline comercial, não integra com WhatsApp, não tem geolocalização avançada, não usa armazenamento em nuvem. É um MVP focado em registrar e distribuir veículos com evidência fotográfica/em vídeo, de forma simples.

## 2. Requisitos Não-Funcionais

- **Mobile First com foco em tablet** (usado no centro de distribuição) → adapta para celular, notebook e desktop. Nenhum texto deve quebrar de forma exagerada, campo sair da tela, botão cortado, tabela inutilizável, imagem/vídeo fora de escala.
- **Simplicidade do MVP.** Não adicionar complexidade além do que foi pedido: sem sistema de permissões granular, sem notificações, sem integrações externas além do necessário.
- **Upload local, sem nuvem.** Fotos e vídeo dos veículos ficam em disco no próprio servidor (`backend/uploads/`), servidos via API atrás de autenticação — sem S3/CDN/storage externo neste MVP.

## 3. Stack Técnica (obrigatória)

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript (Vite), mobile-first |
| Backend / API | Node.js + Express (REST) |
| Banco de Dados | MySQL — **dois bancos na mesma instância**, ver §5 |
| Upload de arquivos | `multer` (disco local), servido via `express.static` atrás de `authenticate` |
| Autenticação | **JWT em cookie httpOnly** (`procar_token`), assinado com `JWT_SECRET` (HS256 fixo), exp curto (30 min) e **renovado de forma deslizante** pelo heartbeat enquanto há atividade, até um **teto absoluto de 12 h** por sessão. Validação bcrypt no login; middleware verifica o token, relê o usuário (revoga inativo na hora) **e valida a sessão em `sessoes`** — logout e reset de senha marcam `encerrada_em` e derrubam o token na hora. Perfis `operador`/`admin`. Sessão **efêmera** (cookie de sessão → morre ao fechar o navegador) + **expira por inatividade** (30 min, `AuthContext`). **CSRF** por double-submit token (`procar_csrf` + header `X-CSRF-Token`). **Primeiro acesso** obrigatório (troca da senha temporária) via `usuarios.senha_definida`, sem exceção de perfil. Throttle de login + **rate limit** global por IP e por usuário nas rotas sensíveis (tudo em memória). |
| Hospedagem | Servidor local ou VPS Linux |

Diretrizes transversais:
- Separação clara entre frontend e backend (API REST desacoplada).
- Priorizar componentes reutilizáveis e código limpo. **Não adicionar complexidade além do escopo do módulo em andamento.**

## 4. Roadmap Modular

| # | Módulo | Status |
|---|---|---|
| — | Base: auth + esqueleto | ✅ Reaproveitado do projeto PROCAR |
| ★ | **Cadastro de veículo (wizard) + upload de fotos/vídeo** | ✅ Feito |
| ★ | **Gestão de Centros de Distribuição** | ✅ Feito |
| ★ | **Gerenciamento de usuários (Admin cria/edita/reseta senha de Operadores)** | ✅ Feito |
| ★ | **Monitoramento: KPIs, gráfico por dia, distribuição por centro/marca, tabela + busca por chassi, detalhe com fotos/vídeo** | ✅ Feito |
| P2 | Melhorias de UX (validação de VIN real, notificações, status do envio) | ⏳ Fora do MVP |

## 5. Arquitetura

```
procar-dva/
├── backend/
│   ├── src/
│   │   ├── config/          # env, conexão MySQL (pool) — dois nomes de banco (ver abaixo)
│   │   ├── database/         # schema.sql, setup.ts
│   │   │   └── import-fipe/  # scripts legados (populam o banco ANTIGO, não usados pelo DVA diretamente)
│   │   ├── middlewares/      # auth (JWT cookie + sessão + primeiro acesso), csrf,
│   │   │                     # rate-limit, security-headers, error handler
│   │   ├── modules/          # um diretório por domínio de negócio
│   │   │   ├── auth/         # login/JWT (token.ts), primeiro acesso, heartbeat, throttle
│   │   │   ├── usuarios/     # gerenciamento de operadores (admin) + reset de senha
│   │   │   ├── centros/      # CRUD de centros de distribuição (admin)
│   │   │   ├── veiculos/     # ★ cadastro de veículo + upload (multer) + catálogo marca/modelo
│   │   │   │   ├── marcas-dva.ts   # lista fixa das 7 marcas do grupo
│   │   │   │   └── upload.ts       # config do multer (disco local)
│   │   │   └── monitoramento/# ★ dashboard agregando a tabela `veiculos`
│   │   ├── routes/           # agregador de rotas dos módulos
│   │   ├── app.ts            # instância express + middlewares + /api/uploads
│   │   └── server.ts         # bootstrap (listen)
│   ├── uploads/               # arquivos de fotos/vídeo (gitignored, criado em runtime)
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/       # reutilizáveis (Logo, AppHeader, ThemeToggle, BrandLogo,
│   │   │                     # ErrorBoundary, Modal)
│   │   ├── modules/
│   │   │   ├── auth/         # Login, PrimeiroAcesso, AlterarSenha (sem mudança de fluxo)
│   │   │   ├── usuarios/     # gestão de operadores (admin)
│   │   │   ├── centros/      # ★ gestão de centros de distribuição (admin)
│   │   │   ├── veiculos/     # ★ wizard de cadastro + confirmação
│   │   │   └── monitoramento/# ★ dashboard + tabela + detalhe do veículo
│   │   ├── services/         # api client (axios) + services por módulo
│   │   ├── contexts/         # AuthContext, ThemeContext
│   │   ├── styles/           # global.css (tokens de tema) + ui.css
│   │   ├── routes/           # proteção de rotas
│   │   └── App.tsx
│   └── package.json
├── CLAUDE.md
└── README.md
```

### Dois bancos MySQL, mesma instância

Por pedido explícito do cliente, **o banco antigo do Guia PROCAR (`painel_procar`) não é tocado** — nenhuma tabela dele é alterada ou removida. O DVA usa um **banco novo e separado** (`dva_veiculos` por padrão, `DB_NAME`). Os dados de veículo (`vehicle_brands`/`vehicle_models`, já importados da FIPE) são reaproveitados do banco antigo via **consulta cross-database** (mesma instância MySQL, nome do banco vem de `DB_VEHICLES_NAME`, default `painel_procar`) — sem duplicar dados. O usuário MySQL usado pela aplicação precisa ter `GRANT SELECT` em **ambos** os bancos.

Isso implica um acoplamento deliberado: **o banco antigo precisa continuar existindo e acessível** na mesma instância para o DVA enxergar o catálogo de marca/modelo. Ver `backend/src/config/env.ts` (`env.db.database` / `env.db.vehiclesDatabase`) e `backend/src/modules/veiculos/veiculos.service.ts` (consultas com o nome do banco totalmente qualificado, ex. `` `${VDB}`.vehicle_brands ``).

Cada **módulo de negócio** é autocontido (routes + controller + service juntos).

## 6. Domínio de Dados

### Banco novo do DVA (`dva_veiculos`, `schema.sql` + `setup.ts`)
- **usuarios** — `id, nome, email (único), senha_hash, perfil ('operador'|'admin'), centro_distribuicao_id (FK, NULL = admin sem restrição), ultimo_login, senha_definida, ativo, created_at`.
- **centros_distribuicao** — `id, nome (único), ativo, criado_em`. Novo eixo de organização — substitui o antigo `usuarios.marca` do Guia. Um Operador pertence a exatamente um centro; o Admin não tem restrição.
- **sessoes**, **reset_senha_log** — infraestrutura de auth, reproduzida sem mudanças (ver §3 e o antigo CLAUDE.md via git log para o racional completo de cada campo).
- **cores** — `id, nome (único), hex, ordem, ativo`. Catálogo simples, sem o texto de venda por cor que existia no Guia.
- **veiculos** — `id, chassi (único, identificador do veículo), marca_id, modelo_id (NULL), cor_id (FK, NULL), centro_distribuicao_id (FK), destino, observacoes, video_path (NULL), usuario_id (FK), criado_em`. `marca_id`/`modelo_id` referenciam `vehicle_brands`/`vehicle_models` do banco **antigo** — sem `FOREIGN KEY` (impossível entre bancos diferentes no MySQL); a existência é validada no service a cada cadastro.
- **veiculo_fotos** — `id, veiculo_id (FK CASCADE), caminho, ordem, criado_em`. Múltiplas fotos por veículo; o vídeo (no máximo um) fica só como `veiculos.video_path`.

### Banco antigo do PROCAR (`painel_procar`, intocado — só leitura via cross-database)
- **vehicle_brands** / **vehicle_models** — catálogo de marca/modelo, importado da FIPE pelos scripts em `backend/src/database/import-fipe/` (herdados do projeto anterior, continuam apontando para esse banco). O DVA filtra esse catálogo pelas **7 marcas do grupo** (`Mercedes, Jeep, RAM, BYD, Dodge, Chrysler, Denza` — constante `MARCAS_DVA` em `modules/veiculos/marcas-dva.ts`), casadas por `LIKE` contra `vehicle_brands.name`.
  > ⚠️ Cobertura da FIPE para marcas recentes/nicho (RAM, BYD, Denza) é incerta — a base é de preços de veículos usados no Brasil. Se uma marca não tiver modelos, o cadastro continua possível com `modelo_id = NULL` (degradação suave). Rodar `npm run import:fipe:marcas` e conferir a cobertura antes de considerar o cadastro "pronto para demo".
- Todo o restante do schema antigo (`servicos`, `roteiro_etapas`, `regras`, `objecoes`, `atendimentos`, `usuario_marcas`, e o `usuarios`/`cores` da era Guia) **não é usado pelo DVA** e não foi tocado — pertence exclusivamente ao produto anterior, caso ele ainda precise rodar em paralelo.

## 7. Contrato da API

- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`, `POST /api/auth/senha`, `POST /api/auth/atividade` — sem mudança de contrato em relação ao projeto anterior, só o payload do usuário troca `marca`/`marcas` por `centroDistribuicaoId`/`centroDistribuicaoNome`.
- `GET /api/veiculos/opcoes` — marcas do DVA (com modelos aninhados, via cross-database), cores ativas e centros ativos. Base do formulário de cadastro.
- `GET /api/veiculos/chassi/:chassi` — pré-checagem de duplicidade (`{ existe: boolean }`), qualquer perfil autenticado.
- `POST /api/veiculos` — cria o veículo. `multipart/form-data`: campos de texto (`chassi`, `marcaId`, `modeloId?`, `corId?`, `centroDistribuicaoId?` — só usado/obrigatório quando quem cadastra é Admin, Operador é sempre forçado ao próprio centro —, `destino?`, `observacoes?`) + `fotos[]` (até 8, imagem) + `video` (1, vídeo). Chassi duplicado → 400.
- `GET /api/veiculos` / `GET /api/veiculos/:id` — listagem paginada (filtros por chassi/marca/centro) e detalhe completo (fotos + vídeo). Só Admin.
- `GET /api/uploads/:arquivo` — serve a mídia (fotos/vídeo), atrás de `authenticate` (GET, então CSRF não se aplica).
- `GET /api/monitoramento/dashboard?dias=7|30|60` — total de veículos, cadastrados hoje, cadastrados no período, distribuição por centro, distribuição por marca, série diária. Só Admin.
- `GET /api/centros`, `POST /api/centros`, `PUT /api/centros/:id` — CRUD de centros de distribuição (sem exclusão física — só `ativo`). Só Admin.
- `GET /api/usuarios`, `GET /api/usuarios/centros-disponiveis`, `POST /api/usuarios`, `PUT /api/usuarios/:id`, `POST /api/usuarios/:id/resetar-senha`, `DELETE /api/usuarios/:id` — gerenciamento de Operadores. Só Admin (não existe mais o perfil Gestor).

> **Transversal a toda a API:** headers de segurança, corpo JSON limitado a 100 KB (uploads não passam pelo parser JSON), rate limit global por IP e rate limit por usuário nas rotas que geram credenciais.

## 8. Convenções de Código

- TypeScript estrito (`strict: true`) em frontend e backend.
- Pastas/arquivos em `kebab-case`; componentes React em `PascalCase`; funções/variáveis em `camelCase`.
- Comentar apenas o não trivial (regras de negócio, decisões de segurança/arquitetura).
- Commits pequenos e descritivos (`feat:`, `fix:`, `chore:`).
- Nunca versionar segredos: usar `.env` (com `.env.example` no repo).

## 9. Decisões de Arquitetura (ADR resumido)

| Data | Decisão | Motivo |
|---|---|---|
| 2026-08-10 | **Pivô completo de produto**: de "Guia de Atendimento" (roteiro de vendas) para "Gerenciamento e Distribuição de Veículos Grupo DVA", reaproveitando auth/layout/CRUD/infra de segurança | Pedido explícito do cliente; a estrutura de auth/sessão/CSRF/rate-limit já validada não tinha relação com o domínio de vendas, então foi mantida integralmente |
| 2026-08-10 | **Banco antigo do PROCAR (`painel_procar`) fica intocado** — nenhuma tabela removida/alterada nele; o DVA sobe um banco novo e separado (`dva_veiculos`) | Pedido explícito do cliente, após uma primeira versão do plano que migrava o schema antigo in-place — decisão revertida para preservar o produto anterior integralmente |
| 2026-08-10 | **Catálogo de marca/modelo (`vehicle_brands`/`vehicle_models`) reaproveitado via consulta cross-database** no banco antigo, em vez de copiado ou reimportado | O usuário confirmou que os dados já estão extraídos/importados naquele banco; copiar duplicaria dados, reimportar esbarra no rate limit documentado da FIPE. Cross-database (mesma instância MySQL) evita as duas coisas, ao custo de acoplar os dois bancos |
| 2026-08-10 | **"Centro de Distribuição" e "Destino" são campos distintos** — Centro = de onde o veículo é cadastrado (liga ao usuário, substitui `usuarios.marca`); Destino = concessionária que vai receber o veículo (campo simples) | Ambíguo na primeira leitura do documento do cliente; resolvido perguntando diretamente — a tabela de monitoramento do próprio documento já listava as duas colunas separadamente ("Origem" / "Concessionária de destino") |
| 2026-08-10 | **Centro de Distribuição ganhou tela de gestão própria** (`/centros`, CRUD reaproveitando o padrão de `UsuariosPage`), em vez de ser só um catálogo fixo semeado | Pedido explícito do cliente |
| 2026-08-10 | **Perfis simplificados de 3 (`consultor`/`gestor`/`admin`) para 2 (`operador`/`admin`)** | O MVP do DVA só descreve "1 admin" + operadores sem permissões especiais; a complexidade de gestor multi-loja do produto anterior não tinha equivalente no novo domínio |
| 2026-08-10 | **Upload local em disco via `multer`, servido atrás de autenticação** — sem S3/CDN | Pedido explícito do cliente (MVP simples); servir `/api/uploads` sem `authenticate` exporia fotos/vídeo de veículo por URL adivinhável, destoando do padrão de segurança já existente no resto da API |
| 2026-08-10 | **`multer` na versão 2.x**, não 1.x | `npm install` acusou vulnerabilidades conhecidas na 1.x, corrigidas na 2.x; trocado antes de seguir, dado o histórico de auditoria de segurança do projeto |
| 2026-08-10 | **Job de retenção de 60 dias removido** (não adaptado) | Existia para a antiga tabela `atendimentos` (log de auditoria de uso, descartável). `veiculos` é dado operacional permanente — não há equivalente a purgar |

## 10. Log de Evolução / Changelog

- **2026-08-10** — **Transformação completa: Guia de Atendimento PROCAR → Gerenciamento e Distribuição de Veículos Grupo DVA.**
  - **Backend removido**: módulos `guia` e `gestor` (roteiro de vendas, dashboard de uso/sessão), `seed-guia.ts`, `jobs/retention.ts`.
  - **Backend novo/reescrito**: banco `dva_veiculos` (schema próprio, `setup.ts` simplificado — sem migração incremental, já que é banco novo); módulo `veiculos` (cadastro + upload via `multer` + catálogo cross-database); módulo `centros` (CRUD de centros de distribuição); módulo `monitoramento` (reescrito do zero: dashboard de veículos, não mais de uso/sessão); `middlewares/auth.ts`, `modules/auth/*` e `modules/usuarios/*` adaptados para 2 perfis (`operador`/`admin`) e `centro_distribuicao_id` único (substitui `marca`/`marcas`/`usuario_marcas`); `error-handler.ts` ganhou tratamento de `MulterError`; `app.ts` passou a servir `/api/uploads` atrás de `authenticate`.
  - **Frontend removido**: módulos `guia` e `gestor` (wizard de atendimento, guia gerado, dashboard de uso), `services/guia.service.ts`, `services/monitoramento.service.ts` (antigo, de auditoria de uso).
  - **Frontend novo/reescrito**: `modules/veiculos` (wizard de cadastro reaproveitando o padrão de revelação progressiva do antigo `AtendimentoWizard`, com fotos/vídeo/observações/destino novos; tela de confirmação); `modules/centros` (CRUD reaproveitando o padrão de `UsuariosPage`); `modules/monitoramento` (KPIs, gráfico de veículos/dia em SVG inline, rankings por centro/marca, primeira tabela HTML "de verdade" do projeto, modal de detalhe com galeria de fotos + vídeo); `types/index.ts`, `services/auth.service.ts`, `services/usuarios.service.ts`, `UsuariosPage.tsx` adaptados para `centroDistribuicaoId`; `App.tsx` com as novas rotas (`/veiculos/novo` como tela principal, `/monitoramento`, `/centros`, `/usuarios` lazy-loaded para Admin); `AuthContext.tsx` perdeu a lógica de cache do guia (não existe mais cache offline — o cadastro depende de rede pelo upload); Logo aumentada nos pontos de uso (`AppHeader`, telas de login).
  - **Dependência nova**: `multer` (2.x) no backend — único pacote novo, mantendo a filosofia de leveza do projeto.
  - Backend (`npm run typecheck` / `npm run build`) e frontend (`npm run typecheck` / `npm run build`) OK.
  - ⏳ **Pendências para produção**: rodar `npm run db:setup` contra um MySQL real (cria o banco `dva_veiculos` do zero); confirmar `GRANT SELECT` do usuário MySQL no banco antigo (`painel_procar`); validar a cobertura da FIPE para RAM/BYD/Denza (`npm run import:fipe:marcas` contra o banco antigo, se ainda não populado); testar upload de fotos/vídeo reais (tamanho grande e tipo inválido) contra os limites do `multer`; validação visual em tablet real (não foi possível neste ambiente); nomes reais para os centros de distribuição (hoje semeados como placeholders "Norte"/"Sul"/"Leste").

## 11. Próximos Passos

1. ⏳ Rodar `npm run db:setup` no MySQL real (cria `dva_veiculos`) e confirmar que o usuário do banco tem `GRANT SELECT` em `painel_procar` também.
2. ⏳ Validar a cobertura de modelos da FIPE para as 7 marcas do DVA no banco antigo; rodar `npm run import:fipe:marcas` se necessário.
3. ⏳ Testar o fluxo fim a fim num tablet real: cadastro de veículo com fotos/vídeo grandes, monitoramento, gestão de centros/usuários.
4. ⏳ Definir nomes reais dos centros de distribuição (hoje são placeholders) via `/centros`.
5. ⏳ Revisar tetos de upload (15MB/foto, 200MB/vídeo, 8 fotos) — são suposições, ajustáveis em `backend/src/modules/veiculos/upload.ts`.
6. ⏳ Deploy: revisar `DEPLOY.md`/`DEPLOY-RAPIDO.md`/`SECURITY-REVIEW.md`/`IMPORTACAO-FIPE.md` (herdados do projeto anterior) — ainda descrevem a arquitetura de um banco só; precisam de um passe para refletir os dois bancos na mesma instância.
