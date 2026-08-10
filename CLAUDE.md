# Grupo DVA — Gerenciamento e Distribuição de Veículos

> Documento vivo. Fonte de verdade sobre o projeto: visão, arquitetura, decisões, estrutura e log de evolução. **Atualizar a cada mudança relevante** (nova feature, decisão de arquitetura, migration, etc.).

## 0. Origem do projeto

Este projeto nasceu como o **"Guia de Atendimento" da PROCAR** (roteiro de vendas por veículo/cor/setor). Em 2026-08-10 o cliente pediu uma **transformação completa de propósito**: o produto passou a ser um **MVP de gerenciamento e distribuição de veículos do Grupo DVA**, reaproveitando ao máximo a estrutura já validada (autenticação JWT em cookie httpOnly, sessões, primeiro acesso, rate limit, headers de segurança, layout mobile-first, componentes de UI, padrões de CRUD) e substituindo por completo o domínio de negócio (roteiro de vendas → cadastro/distribuição de veículos).

O histórico detalhado da fase "Guia PROCAR" (ADRs e changelog de 2026-07-02 a 2026-07-31) não é reproduzido aqui — está preservado no histórico do git (`git log`) para quem precisar de arqueologia. Este documento descreve o produto **como ele é agora**.

## 1. Visão do Produto

**O produto é um sistema de GERENCIAMENTO E DISTRIBUIÇÃO DE VEÍCULOS entre concessionárias do Grupo DVA — não é um CRM nem um guia de vendas.**

Um **Operador** registra um veículo que será enviado a uma concessionária: informa marca, modelo, chassi, anexa fotos e vídeo, escreve observações e indica o destino. O **Chassi é o identificador único do veículo** no sistema — não existem dois cadastros para o mesmo chassi. Cada cadastro gera automaticamente um **protocolo** (recibo curto da operação).

O **Admin** acompanha tudo numa tela de **Monitoramento**: quantos veículos foram cadastrados (total, hoje, por período), a distribuição por marca, uma lista pesquisável por chassi e o detalhe completo de cada veículo (fotos + vídeo + dados). Tanto Operador quanto Admin têm uma tela de **Meus Registros** — histórico dos veículos que o próprio usuário cadastrou. O Admin também gerencia os **Usuários** (operadores).

### Personas
- **Operador**: cadastra veículos que serão enviados a uma concessionária. Sem vínculo com nenhuma unidade/centro — qualquer operador cadastra para qualquer destino.
- **Admin**: gerencia usuários e acompanha o monitoramento de todos os veículos cadastrados. Único perfil administrativo do MVP.

> ℹ️ O sistema já teve os conceitos de **Cor** e **Centro de Distribuição** (removidos em 2026-08-10 a pedido do cliente — ver §9/§10). Se algo neste documento parecer contraditório, o histórico do git é a fonte de verdade sobre quando cada coisa mudou.

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
| ★ | **Cadastro de veículo (wizard) + upload de fotos/vídeo + protocolo automático** | ✅ Feito |
| ★ | **Gerenciamento de usuários (Admin cria/edita/reseta senha de Operadores)** | ✅ Feito |
| ★ | **Monitoramento: KPIs, gráfico por dia, distribuição por marca, tabela + busca por chassi, detalhe com fotos/vídeo, exclusão (admin)** | ✅ Feito |
| ★ | **Meus Registros: histórico dos próprios veículos cadastrados (Operador e Admin)** | ✅ Feito |
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
│   │   │   ├── veiculos/     # ★ wizard de cadastro + confirmação
│   │   │   └── monitoramento/# ★ dashboard + tabela + detalhe + Meus Registros
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
- **usuarios** — `id, nome, email (único), senha_hash, perfil ('operador'|'admin'), ultimo_login, senha_definida, ativo, created_at`. Sem eixo de organização por centro/unidade (removido — ver §9/§10).
- **sessoes**, **reset_senha_log** — infraestrutura de auth, reproduzida sem mudanças (ver §3 e o antigo CLAUDE.md via git log para o racional completo de cada campo).
- **veiculos** — `id, chassi (único, identificador do veículo), protocolo (único, AAAA+MMDD+4 caracteres aleatórios, ex. 20260810X7K2 — gerado no servidor a cada cadastro, nunca aceito do cliente), marca_id, modelo_id (NULL), destino, observacoes, video_path (NULL), usuario_id (FK), criado_em`. `marca_id`/`modelo_id` referenciam `vehicle_brands`/`vehicle_models` do banco **antigo** — sem `FOREIGN KEY` (impossível entre bancos diferentes no MySQL); a existência é validada no service a cada cadastro. Sem campo de cor (removido — ver §9/§10).
- **veiculo_fotos** — `id, veiculo_id (FK CASCADE), caminho, ordem, criado_em`. Múltiplas fotos por veículo; o vídeo (no máximo um) fica só como `veiculos.video_path`.
- **`db:setup` migra bancos antigos**: se as tabelas `cores`/`centros_distribuicao` ou as colunas `cor_id`/`centro_distribuicao_id` ainda existirem (de uma instalação anterior a 2026-08-10), o script remove FKs, colunas e tabelas automaticamente — ver `removerColunaSeExistir` em `setup.ts`.

### Banco antigo do PROCAR (`painel_procar`, intocado — só leitura via cross-database)
- **vehicle_brands** / **vehicle_models** — catálogo de marca/modelo, importado da FIPE pelos scripts em `backend/src/database/import-fipe/` (herdados do projeto anterior, continuam apontando para esse banco). O DVA filtra esse catálogo pelas **7 marcas do grupo** (`Mercedes, Jeep, RAM, BYD, Dodge, Chrysler, Denza` — constante `MARCAS_DVA` em `modules/veiculos/marcas-dva.ts`), casadas por `LIKE` contra `vehicle_brands.name`.
  > ⚠️ Cobertura da FIPE para marcas recentes/nicho (RAM, BYD, Denza) é incerta — a base é de preços de veículos usados no Brasil. Se uma marca não tiver modelos, o cadastro continua possível com `modelo_id = NULL` (degradação suave). Rodar `npm run import:fipe:marcas` e conferir a cobertura antes de considerar o cadastro "pronto para demo".
- Todo o restante do schema antigo (`servicos`, `roteiro_etapas`, `regras`, `objecoes`, `atendimentos`, `usuario_marcas`, e o `usuarios`/`cores` da era Guia) **não é usado pelo DVA** e não foi tocado — pertence exclusivamente ao produto anterior, caso ele ainda precise rodar em paralelo.

## 7. Contrato da API

- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`, `POST /api/auth/senha`, `POST /api/auth/atividade` — sem mudança de contrato em relação ao projeto anterior, exceto que o payload do usuário não carrega mais nenhum campo de centro/unidade (removido).
- `GET /api/veiculos/opcoes` — marcas do DVA (com modelos aninhados, via cross-database). Base do formulário de cadastro.
- `GET /api/veiculos/chassi/:chassi` — pré-checagem de duplicidade (`{ existe: boolean }`), qualquer perfil autenticado.
- `POST /api/veiculos` — cria o veículo. `multipart/form-data`: campos de texto (`chassi`, `marcaId`, `modeloId?`, `destino?`, `observacoes?`) + `fotos[]` (até 8, imagem) + `video` (1, vídeo). Chassi duplicado → 400. Resposta inclui o `protocolo` gerado (recibo do cadastro, exibido na confirmação e reexibido no monitoramento).
- `GET /api/veiculos` — listagem paginada (filtros por chassi/marca), todos os veículos. Só Admin.
- `GET /api/veiculos/meus-registros` — mesma listagem, mas sempre escopada ao usuário autenticado (nunca aceito do cliente) — qualquer perfil, é a base da tela **Meus Registros**.
- `GET /api/veiculos/:id` — detalhe completo (fotos + vídeo). Qualquer perfil autenticado; Admin vê qualquer veículo, Operador só o que ele mesmo cadastrou (404 para o resto, sem confirmar que o id existe).
- `DELETE /api/veiculos/:id` — exclusão definitiva (linha + fotos via FK CASCADE + arquivos físicos em disco, best-effort). Só Admin. O veículo já pode ter saído para a concessionária — existe para corrigir cadastro errado, não como fluxo comum.
- `GET /api/uploads/:arquivo` — serve a mídia (fotos/vídeo), atrás de `authenticate` (GET, então CSRF não se aplica).
- `GET /api/monitoramento/dashboard?dias=7|30|60` — total de veículos, cadastrados hoje, cadastrados no período, distribuição por marca, série diária. Só Admin.
- `GET /api/usuarios`, `POST /api/usuarios`, `PUT /api/usuarios/:id`, `POST /api/usuarios/:id/resetar-senha`, `DELETE /api/usuarios/:id` — gerenciamento de Operadores (sem campo de centro/unidade). Só Admin (não existe mais o perfil Gestor).

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
| 2026-08-10 | **`veiculos.protocolo`** (AAAA+MMDD+4 aleatórios, único, gerado no servidor a cada cadastro) além do chassi | Pedido explícito do cliente: um recibo curto da operação, devolvido na hora ao operador. Chassi continua sendo o identificador único do veículo (já era); protocolo é um identificador do **evento de cadastro**, não do veículo em si — retry silencioso em caso de colisão (gerado pelo sistema, nunca some erro ao usuário por isso) |
| 2026-08-10 | **Exclusão de veículo (`DELETE /api/veiculos/:id`), restrita ao Admin** — remove também os arquivos físicos (fotos/vídeo) do disco, best-effort | Pedido explícito do cliente. Mesmo padrão de confirmação em modal próprio (não `window.confirm`) já usado em Usuários; sem exclusão física em cascata sem limpeza de arquivo, o `backend/uploads/` acumularia mídia órfã indefinidamente |
| 2026-08-10 | **Cor removida do produto** (campo do cadastro, tabela `cores`, coluna `veiculos.cor_id`) | Pedido explícito do cliente: "será irrelevante para esse sistema". `db:setup` remove a coluna/tabela automaticamente em bancos que já as tinham |
| 2026-08-10 | **Centro de Distribuição removido do produto inteiro** (campo do cadastro, tabela `centros_distribuicao`, `usuarios.centro_distribuicao_id`, tela `/centros`, escopo do Operador) — reverte a decisão de "ganhou tela de gestão própria" tomada mais cedo no mesmo dia | Pedido explícito do cliente: "não faz sentido ter para esse sistema". Operador deixou de ter qualquer vínculo territorial — cadastra para qualquer destino. `db:setup` remove FKs/colunas/tabela automaticamente em bancos que já as tinham |
| 2026-08-10 | **Cabeçalho do wizard de cadastro passou a mostrar o nome do usuário logado**, no lugar do nome do centro (que deixou de existir) | Pedido explícito do cliente ("o item número 1 pode ser apenas o nome do usuário cadastrado") |
| 2026-08-10 | **Nova tela "Meus Registros"** (`/meus-registros`, `GET /api/veiculos/meus-registros`) — histórico dos veículos cadastrados pelo próprio usuário logado, para Operador **e** Admin | Pedido explícito do cliente. Reaproveita `VeiculosTabela`/`VeiculoDetalheModal` já existentes via uma prop (`apenasMeus`), em vez de duplicar a tela; o escopo por usuário é sempre imposto pelo backend a partir do token, nunca aceito do cliente |

## 10. Log de Evolução / Changelog

- **2026-08-10** — **Transformação completa: Guia de Atendimento PROCAR → Gerenciamento e Distribuição de Veículos Grupo DVA.**
  - **Backend removido**: módulos `guia` e `gestor` (roteiro de vendas, dashboard de uso/sessão), `seed-guia.ts`, `jobs/retention.ts`.
  - **Backend novo/reescrito**: banco `dva_veiculos` (schema próprio, `setup.ts` simplificado — sem migração incremental, já que é banco novo); módulo `veiculos` (cadastro + upload via `multer` + catálogo cross-database); módulo `centros` (CRUD de centros de distribuição); módulo `monitoramento` (reescrito do zero: dashboard de veículos, não mais de uso/sessão); `middlewares/auth.ts`, `modules/auth/*` e `modules/usuarios/*` adaptados para 2 perfis (`operador`/`admin`) e `centro_distribuicao_id` único (substitui `marca`/`marcas`/`usuario_marcas`); `error-handler.ts` ganhou tratamento de `MulterError`; `app.ts` passou a servir `/api/uploads` atrás de `authenticate`.
  - **Frontend removido**: módulos `guia` e `gestor` (wizard de atendimento, guia gerado, dashboard de uso), `services/guia.service.ts`, `services/monitoramento.service.ts` (antigo, de auditoria de uso).
  - **Frontend novo/reescrito**: `modules/veiculos` (wizard de cadastro reaproveitando o padrão de revelação progressiva do antigo `AtendimentoWizard`, com fotos/vídeo/observações/destino novos; tela de confirmação); `modules/centros` (CRUD reaproveitando o padrão de `UsuariosPage`); `modules/monitoramento` (KPIs, gráfico de veículos/dia em SVG inline, rankings por centro/marca, primeira tabela HTML "de verdade" do projeto, modal de detalhe com galeria de fotos + vídeo); `types/index.ts`, `services/auth.service.ts`, `services/usuarios.service.ts`, `UsuariosPage.tsx` adaptados para `centroDistribuicaoId`; `App.tsx` com as novas rotas (`/veiculos/novo` como tela principal, `/monitoramento`, `/centros`, `/usuarios` lazy-loaded para Admin); `AuthContext.tsx` perdeu a lógica de cache do guia (não existe mais cache offline — o cadastro depende de rede pelo upload); Logo aumentada nos pontos de uso (`AppHeader`, telas de login).
  - **Dependência nova**: `multer` (2.x) no backend — único pacote novo, mantendo a filosofia de leveza do projeto.
  - Backend (`npm run typecheck` / `npm run build`) e frontend (`npm run typecheck` / `npm run build`) OK.
  - ⏳ **Pendências para produção**: rodar `npm run db:setup` contra um MySQL real (cria o banco `dva_veiculos` do zero); confirmar `GRANT SELECT` do usuário MySQL no banco antigo (`painel_procar`); validar a cobertura da FIPE para RAM/BYD/Denza (`npm run import:fipe:marcas` contra o banco antigo, se ainda não populado); testar upload de fotos/vídeo reais (tamanho grande e tipo inválido) contra os limites do `multer`; validação visual em tablet real (não foi possível neste ambiente).

- **2026-08-10** — **Ajustes pós-entrega: protocolo automático, exclusão de veículo, remoção de Cor e Centro de Distribuição, tela "Meus Registros".**
  - **Backend**: `veiculos.protocolo` (coluna nova, único, gerado no servidor — `shared/protocolo.ts`) + migração em `setup.ts` para bancos que já tinham veículos sem protocolo; `DELETE /api/veiculos/:id` (admin, limpa arquivos físicos); `GET /api/veiculos/meus-registros` (qualquer perfil, escopado ao usuário do token) e `GET /api/veiculos/:id` liberado para qualquer perfil autenticado (Operador só enxerga o próprio veículo — 404 para o resto); removidos por completo: tabela `cores`, tabela `centros_distribuicao`, módulo `modules/centros/`, colunas `veiculos.cor_id`/`veiculos.centro_distribuicao_id`/`usuarios.centro_distribuicao_id` (com migração de limpeza em `setup.ts` via `removerColunaSeExistir`, que derruba FK + coluna + tabela em bancos que já tinham esses campos de uma versão anterior); `monitoramento.service.ts` perdeu a distribuição "por centro".
  - **Frontend**: `modules/centros/` removido inteiramente; `VeiculoWizard` perdeu os passos "Centro de Distribuição" e "Cor" (fluxo agora é Marca → Modelo → Chassi → opcionais); cabeçalho do wizard mostra `usuario.nome`; nova tela `modules/monitoramento/MeusRegistrosPage.tsx` (rota `/meus-registros`, link no `AppHeader` para todos os perfis); `VeiculosTabela` ganhou a prop `apenasMeus` (reaproveitada pelas duas telas, sem duplicar código); link "Minha senha" removido do `AppHeader` (rota `/minha-senha` continua existindo, só não é mais linkada); logos de marca removidos dos chips de seleção (cobertura incompleta — `BrandLogo`/`brand-paths.ts` continuam no projeto, só não estão em uso); avatar vazio removido das listas de Usuários/Centros.
  - Correção de bug real (não relacionado às mudanças de escopo): CSS do `Modal` e de `ui.css` só carregava se o usuário já tivesse visitado `/usuarios` antes na mesma sessão (import por página, não global) — modal de detalhe do veículo abria sem estilo nenhum quando acessado direto via Monitoramento. Corrigido movendo `ui.css` para import único em `main.tsx` e o CSS do `Modal` para `components/Modal.css`, importado pelo próprio componente.
  - Backend e frontend (`npm run typecheck` / `npm run build`) OK.

## 11. Próximos Passos

1. ⏳ Rodar `npm run db:setup` no MySQL real (cria `dva_veiculos`) e confirmar que o usuário do banco tem `GRANT SELECT` em `painel_procar` também.
2. ⏳ Validar a cobertura de modelos da FIPE para as 7 marcas do DVA no banco antigo; rodar `npm run import:fipe:marcas` se necessário.
3. ⏳ Testar o fluxo fim a fim num tablet real: cadastro de veículo com fotos/vídeo grandes, monitoramento, gestão de usuários, Meus Registros.
4. ⏳ Revisar tetos de upload (15MB/foto, 200MB/vídeo, 8 fotos) — são suposições, ajustáveis em `backend/src/modules/veiculos/upload.ts`.
5. ⏳ Deploy: revisar `DEPLOY.md`/`DEPLOY-RAPIDO.md`/`SECURITY-REVIEW.md`/`IMPORTACAO-FIPE.md` (herdados do projeto anterior) — ainda descrevem a arquitetura de um banco só; precisam de um passe para refletir os dois bancos na mesma instância.
