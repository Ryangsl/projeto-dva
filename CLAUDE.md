# Grupo ProCar — Gerenciamento e Distribuição de Veículos

> Documento vivo. Fonte de verdade sobre o projeto: visão, arquitetura, decisões, estrutura e log de evolução. **Atualizar a cada mudança relevante** (nova feature, decisão de arquitetura, migration, etc.).

## 0. Origem do projeto

Este projeto nasceu como o **"Guia de Atendimento" da PROCAR** (roteiro de vendas por veículo/cor/setor). Em 2026-08-10 o cliente pediu uma **transformação completa de propósito**: o produto passou a ser um **MVP de gerenciamento e distribuição de veículos do Grupo DVA**, reaproveitando ao máximo a estrutura já validada (autenticação JWT em cookie httpOnly, sessões, primeiro acesso, rate limit, headers de segurança, layout mobile-first, componentes de UI, padrões de CRUD) e substituindo por completo o domínio de negócio (roteiro de vendas → cadastro/distribuição de veículos).

O histórico detalhado da fase "Guia PROCAR" (ADRs e changelog de 2026-07-02 a 2026-07-31) não é reproduzido aqui — está preservado no histórico do git (`git log`) para quem precisar de arqueologia. Este documento descreve o produto **como ele é agora**.

> ℹ️ O produto foi batizado de "Grupo DVA" na transformação de 2026-08-10 e renomeado para **"Grupo ProCar"** em 2026-08-11 (ver §9/§10). Identificadores técnicos internos (nome do banco `dva_veiculos`, pacotes `dva-veiculos-*`, arquivo `marcas-dva.ts`) **não foram renomeados** — são infraestrutura interna, não a marca exibida ao usuário; se algo neste documento ainda disser "DVA" fora de um identificador técnico, é resquício a corrigir.

## 1. Visão do Produto

**O produto é um sistema de GERENCIAMENTO E DISTRIBUIÇÃO DE VEÍCULOS entre concessionárias do Grupo ProCar — não é um CRM nem um guia de vendas.**

Um **Operador** registra um veículo que será enviado a uma concessionária: informa marca, modelo, chassi, anexa fotos e vídeo, escreve observações e indica o destino. O **Chassi é o identificador único do veículo** no sistema — não existem dois cadastros para o mesmo chassi. Cada cadastro gera automaticamente um **protocolo** (recibo curto da operação).

Qualquer usuário autenticado — **Operador ou Admin** — acompanha tudo numa tela de **Monitoramento**: quantos veículos foram cadastrados (total, hoje, por período), a distribuição por marca, uma lista pesquisável por chassi com **todos** os veículos (de qualquer usuário) e o detalhe completo de cada um (fotos + vídeo + dados). A única diferença do Admin nessa tela é a permissão para **excluir** um registro — não existe uma versão "só meus registros" separada. O Admin também gerencia os **Usuários** (operadores).

### Personas
- **Operador**: cadastra veículos que serão enviados a uma concessionária e acompanha o Monitoramento de todos os veículos cadastrados (não só os próprios). Sem vínculo com nenhuma unidade/centro — qualquer operador cadastra para qualquer destino. Não pode excluir registros.
- **Admin**: tudo que o Operador faz, mais: gerencia usuários e pode excluir veículos cadastrados por qualquer pessoa. Único perfil administrativo do MVP.

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
| ★ | **Monitoramento: KPIs, gráfico por dia, distribuição por marca, tabela + busca por chassi (todos os veículos, todos os perfis), detalhe com fotos/vídeo, exclusão (admin)** | ✅ Feito |
| P2 | Melhorias de UX (validação de VIN real, notificações, status do envio, edição de veículo) | ⏳ Fora do MVP |

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
│   │   │   └── monitoramento/# ★ dashboard agregando a tabela `veiculos`, aberto a todos os perfis
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
│   │   │   └── monitoramento/# ★ dashboard + tabela + detalhe (todos os perfis)
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
- `GET /api/veiculos` — listagem paginada (filtros por chassi/marca), todos os veículos de todos os usuários. Qualquer perfil autenticado — base da tabela de Monitoramento.
- `GET /api/veiculos/:id` — detalhe completo (fotos + vídeo). Qualquer perfil autenticado pode ver qualquer veículo (não há escopo por usuário).
- `DELETE /api/veiculos/:id` — exclusão definitiva (linha + fotos via FK CASCADE + arquivos físicos em disco, best-effort). Só Admin. O veículo já pode ter saído para a concessionária — existe para corrigir cadastro errado, não como fluxo comum.
- `GET /api/uploads/:arquivo` — serve a mídia (fotos/vídeo), atrás de `authenticate` (GET, então CSRF não se aplica).
- `GET /api/monitoramento/dashboard?dias=7|30|60` — total de veículos, cadastrados hoje, cadastrados no período, distribuição por marca, série diária. Qualquer perfil autenticado.
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
| 2026-08-10 | **"Meus Registros" criada e removida no mesmo dia** — a tela e a rota `GET /api/veiculos/meus-registros` foram implementadas e, horas depois, retiradas: **Monitoramento passou a ser visível a qualquer perfil autenticado, mostrando os registros de todos os usuários** (não só os próprios); a única diferença do Admin continua sendo a permissão de excluir | Pedido explícito do cliente: "os demais perfis poderao ver sim a tela de monitoracao... mostrando todos, ate de outros usuarios". `GET /api/veiculos` e `GET /api/monitoramento/dashboard` deixaram de exigir `authorize('admin')`; `VeiculosTabela` perdeu a prop `apenasMeus` (sempre mostra a coluna Usuário) |
| 2026-08-11 | **Marca do produto renomeada de "Grupo DVA" para "Grupo ProCar"** — texto visível ao usuário (faixa de navegação, tela de login, `index.html`, READMEs); identificadores técnicos internos (banco `dva_veiculos`, pacotes npm `dva-veiculos-*`, arquivo `marcas-dva.ts`) **não foram tocados**, por não serem parte da marca exibida e por renomeá-los ter custo/risco de infraestrutura não pedido | Pedido explícito do cliente |
| 2026-08-11 | **Faixa de navegação (`AppHeader`) passou a exibir um título fixo** ("Gerenciamento e distribuição de veículos do Grupo ProCar") **em vez do título por tela** ("Cadastro de Veículo"/"Usuários"/"Monitoramento"/"Minha senha") | Pedido explícito do cliente: "o título deve aparecer em todas as páginas". `AppHeader` perdeu a prop `titulo`; como a frase é bem mais longa que os títulos curtos de antes, `.app-topo-titulo`/`.app-topo-esq` em `global.css` ganharam `min-width: 0` para o truncamento (`text-overflow: ellipsis`) realmente funcionar em telas estreitas, em vez de estourar a faixa |
| 2026-08-13 | **Grupo ProCar sobe em `dva.procarservice.com.br` (porta `3334`, processo PM2 `dva-veiculos-api`), ao lado do sistema antigo já em produção em `guia.procarservice.com.br`** (porta `3333`, `procar-api`) na mesma VPS — em vez de reprovisionar uma VPS nova ou reaproveitar domínio/porta do antigo | O cliente já tinha o antigo "PROCAR — Guia de Atendimento" (`painel-procar`) rodando nessa VPS quando o Grupo ProCar chegou perto de produção. Subdomínio + porta + processo PM2 + usuário MySQL próprios (`dva_app`, com `GRANT SELECT` cross-database em `painel_procar`) eliminam qualquer colisão sem tocar no sistema antigo; o Nginx roteia os dois pelo `server_name` no mesmo `80`/`443`, e o mesmo daemon PM2 (usuário `procar`, já com `pm2 startup` configurado) passa a gerenciar os dois processos |

## 10. Log de Evolução / Changelog

- **2026-08-13** — **`DEPLOY-RAPIDO.md` reescrito para deploy de coexistência na VPS real.**
  - O `DEPLOY-RAPIDO.md` herdado do projeto anterior ainda descrevia um provisionamento de VPS do zero (criação de usuário, SSH, firewall, pacotes, MySQL) clonando o repositório **antigo** (`painel-procar`) — nunca tinha sido adaptado para este projeto, e não refletia que a VPS real já hospeda o sistema antigo em produção (`guia.procarservice.com.br`).
  - Reescrito do zero: pula todo o provisionamento já feito (VPS, usuário `procar`, SSH, UFW, pacotes, MySQL, PM2 daemon, fail2ban — tudo reaproveitado sem alteração) e soma só o necessário para este sistema conviver com o antigo — domínio `dva.procarservice.com.br`, banco `dva_veiculos` + usuário MySQL `dva_app` (com `GRANT SELECT` cross-database em `painel_procar`), porta de backend `3334`, processo PM2 `dva-veiculos-api` no mesmo daemon, `server{}` Nginx próprio (zona de rate limit `dva_api`, `client_max_body_size 250M`/timeouts de proxy maiores — vídeo de até 200MB, ausente no site antigo), chave de deploy do GitHub própria (`~/.ssh/deploy_dva`, alias `github.com-dva` — evita a chave errada ser tentada por padrão), scripts de backup e atalho de CLI (`dva-veiculos`) próprios, cron escalonado (`03:10`/`03:15`) para não competir por I/O do MySQL com o backup do sistema antigo (`03:00`/`03:05`).
  - Nova tabela "de não-colisão" no topo do documento e nova §12 do `CLAUDE.md` (Portas Utilizadas) documentam lado a lado o que cada sistema ocupa — referência para adicionar um terceiro sistema no futuro.
  - **Não alterado**: `DEPLOY.md` (guia longo, com explicações) e `SECURITY-REVIEW.md`/`IMPORTACAO-FIPE.md` continuam descrevendo o deploy solo antigo — mesma pendência já registrada em §11, ainda aberta.
  - Nenhuma mudança de código de aplicação — só documentação de deploy.

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

- **2026-08-10** — **Monitoramento aberto a todos os perfis; "Meus Registros" removida (mesmo dia em que foi criada).**
  - **Backend**: `veiculos.service.ts` perdeu o conceito de escopo por usuário (`UsuarioAutenticado` volta a ser só `{ sub }`, `buscarPorId`/`listar` sem parâmetro de escopo/`usuarioId`); `veiculos.controller.ts` perdeu o handler `meusRegistros`; `veiculos.routes.ts` perdeu a rota `GET /meus-registros` e `GET /` deixou de exigir `authorize('admin')`; `monitoramento.routes.ts` deixou de exigir `authorize('admin')` no `.use()` — só `DELETE /api/veiculos/:id` continua admin-only.
  - **Frontend**: `modules/monitoramento/MeusRegistrosPage.tsx` excluído; rota `/meus-registros` removida de `App.tsx`; `services/veiculos.service.ts` perdeu `listarMeusRegistros`; `VeiculosTabela.tsx` perdeu a prop `apenasMeus` (sempre chama `listarVeiculos`, sempre mostra a coluna Usuário); links de navegação ("Meus Registros") removidos de `VeiculoPage`/`UsuariosPage`/`MonitoramentoPage`; link "Monitoramento" passou a aparecer para qualquer perfil (antes só Admin); link "Usuários" continua Admin-only.
  - **Não implementado nesta passagem**: o pedido mencionava também "editar" registros como permissão exclusiva do Admin, mas não há hoje nenhuma funcionalidade de edição de veículo no sistema (nem para Admin, nem para Operador) — não foi criada por falta de especificação (quais campos, que UI); fica registrada como item aberto no Roadmap (§4) e nos Próximos Passos (§11).
  - Backend e frontend (`npm run typecheck` / `npm run build`) OK.

- **2026-08-11** — **Marca renomeada para "Grupo ProCar"; título fixo na faixa de navegação em todas as telas.**
  - **Texto/branding**: `Grupo DVA` → `Grupo ProCar` em `frontend/index.html` (`<title>`), tagline da `LoginPage`, descrições de `backend/package.json`/`frontend/package.json`, comentário de `BrandLogo.tsx` e título/visão do `README.md` e deste `CLAUDE.md`. Identificadores técnicos (banco `dva_veiculos`, nomes dos pacotes npm `dva-veiculos-*`, arquivo `marcas-dva.ts`) permanecem inalterados — são infraestrutura interna, renomear teria custo/risco não pedido.
  - **`AppHeader.tsx`**: perdeu a prop `titulo`; passou a exibir sempre a mesma frase fixa ("Gerenciamento e distribuição de veículos do Grupo ProCar") no lugar do título por tela. Todos os chamadores (`VeiculoPage`, `UsuariosPage`, `MonitoramentoPage`, `AlterarSenhaPage`) pararam de passar `titulo`.
  - **`global.css`**: `.app-topo-esq` (`flex: none` → `flex: 0 1 auto`) e `.app-topo-titulo` (novo `min-width: 0`) — sem isso o item flex não encolhe abaixo do tamanho do conteúdo (mínimo padrão é `auto`) e a frase fixa, bem mais longa que os títulos curtos de antes, estouraria a faixa em telas estreitas em vez de truncar com reticências.
  - Backend e frontend (`npm run typecheck` / `npm run build`) OK.

## 11. Próximos Passos

1. ⏳ Rodar `npm run db:setup` no MySQL real (cria `dva_veiculos`) e confirmar que o usuário do banco tem `GRANT SELECT` em `painel_procar` também.
2. ⏳ Validar a cobertura de modelos da FIPE para as 7 marcas do DVA no banco antigo; rodar `npm run import:fipe:marcas` se necessário.
3. ⏳ Testar o fluxo fim a fim num tablet real: cadastro de veículo com fotos/vídeo grandes, monitoramento (como Operador e como Admin), gestão de usuários.
4. ⏳ Revisar tetos de upload (15MB/foto, 200MB/vídeo, 8 fotos) — são suposições, ajustáveis em `backend/src/modules/veiculos/upload.ts`.
5. ✅ `DEPLOY-RAPIDO.md` reescrito para a VPS real (§9/§10, 2026-08-13): sobe o Grupo ProCar ao lado do sistema antigo já em produção (`guia.procarservice.com.br`), sem repetir provisionamento e sem colidir porta/domínio/processo. ⏳ `DEPLOY.md` (guia longo, com explicações) e `SECURITY-REVIEW.md`/`IMPORTACAO-FIPE.md` ainda não passaram pela mesma revisão — continuam descrevendo um deploy solo (banco único, primeiro sistema da VPS); usar o `DEPLOY-RAPIDO.md` como fonte de verdade até lá.
6. ⏳ **Edição de veículo** — mencionada pelo cliente como permissão exclusiva do Admin, mas sem especificação (campos editáveis, UI); não existe hoje no sistema (nem para Admin nem para Operador). Levantar requisitos antes de implementar.

## 12. Portas Utilizadas e Coexistência na VPS

> A VPS (Hostinger, domínio `procarservice.com.br`) **já hospeda outro sistema** em produção: o antigo "PROCAR — Guia de Atendimento" (repositório `painel-procar`, domínio `guia.procarservice.com.br`, processo PM2 `procar-api`, porta `3333`, banco `painel_procar`). O Grupo ProCar (este projeto) sobe **ao lado**, sem tocar nele — domínio próprio, porta própria, processo PM2 próprio, banco próprio (com leitura cross-database no banco antigo, ver §5). Passo a passo operacional completo em [DEPLOY-RAPIDO.md](./DEPLOY-RAPIDO.md), que documenta a tabela de não-colisão inteira.

| Porta/recurso | Sistema antigo (guia) | Grupo ProCar (este projeto) | Exposto na internet? |
|---|---|---|---|
| 80/443 Nginx | compartilhado — `server{}` próprio por `server_name` | compartilhado — `server{}` próprio por `server_name` | Sim |
| Domínio | `guia.procarservice.com.br` | `dva.procarservice.com.br` | — |
| Backend (Node/Express, PM2) | `procar-api`, porta `3333` | `dva-veiculos-api`, porta `3334` | **Não** — só `127.0.0.1`, o Nginx local fala com cada um via `proxy_pass`. Porta configurável por `PORT` no `.env` (ver `backend/src/config/env.ts`) |
| 22 SSH | compartilhado | compartilhado | Sim — só chave pública, com fail2ban |
| 3306 MySQL | banco `painel_procar` | banco `dva_veiculos` (+ leitura em `painel_procar`, ver §5) | **Não** — só `127.0.0.1`, uma única instância `mysql-server` serve os dois bancos |
| 5173 Vite dev server | — | Só em desenvolvimento local (`npm run dev` no frontend) | Não se aplica — build de produção é estática, servida pelo Nginx; não sobe na VPS |

**Para hospedar um terceiro software na mesma VPS**: escolha uma porta livre para o backend (ex. `3335`, nunca `3333`/`3334`), banco/usuário MySQL próprio, `server{}` Nginx com `server_name` (domínio/subdomínio) próprio e processo PM2 com nome próprio — mesmo padrão usado para somar este projeto ao lado do antigo. `sudo ss -tlnp` na VPS confirma o que já está escutando em cada porta antes de decidir a próxima.
