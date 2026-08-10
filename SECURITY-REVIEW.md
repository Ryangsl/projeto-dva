# SECURITY-REVIEW.md — Auditoria de Segurança Pré-Produção

> **Escopo:** revisão completa do PROCAR — Guia de Atendimento (backend Node/Express, frontend React/TS, MySQL), com o `CLAUDE.md` como fonte de verdade da arquitetura e das regras de negócio.
> **Branch auditada:** `feat/monitoramento-e-seguranca` (commits `436f8b9` → `a5b1720`)
> **Data:** 2026-07-28
> **Postura adotada:** Pentester Sênior + Arquiteto de Segurança
> **Método:** leitura integral do código dos módulos `auth`, `usuarios`, `gestor`, `guia`, `monitoramento`, middlewares, `schema.sql`, `setup.ts`, camada de serviços do frontend e configuração de produção (`DEPLOY.md`); rastreio de fluxo de dados de entrada até operações sensíveis; verificação linha a linha das fronteiras de privilégio.

---

## 0. Status das correções (atualizado em 2026-07-28)

As correções foram aplicadas na branch `security/auditoria-pre-producao`. O corpo do relatório abaixo descreve o estado **original** de cada achado (que é o que documenta o risco); esta tabela registra o que já foi feito.

| # | Achado | Risco | Status |
|---|---|---|---|
| V-01 | Conta admin padrão isenta da troca de senha | 🔴 Crítico | ✅ **Corrigido** — `ADMIN_SENHA_INICIAL` (obrigatória em produção), admin nasce com `senha_definida = 0`, "Minha senha" liberada para o perfil |
| V-02 | Guarda de `JWT_SECRET` não cobre o placeholder | 🔴 Alto | ✅ **Corrigido** — validação por tamanho (≥32) + denylist; `.env.example` com o campo vazio |
| V-03 | Contas de concessionária com senha compartilhada | 🟠 Alto | ✅ **Corrigido** — não semeadas em produção; senha aleatória individual em dev; backfill da migração exclui as contas semeadas |
| V-04 | Sessões não revogadas no logout/troca/reset | 🟠 Médio | ✅ **Corrigido** — `sessoes.encerrada_em` + teto absoluto de 12 h, validados no `authenticate` |
| V-05 | `/api/gestor/*` expõe todas as lojas | 🟠 Médio | ✅ **Corrigido** — escopado por `usuario_marcas` (decisão do cliente); Admin mantém visão global |
| V-06 | Ausência de headers de segurança | 🟡 Médio | ✅ **Corrigido** — `security-headers.ts` na API + `add_header` (com CSP) no Nginx |
| V-07 | `uuid` de atendimento controlado pelo cliente | 🟡 Baixo | ✅ **Corrigido** — unicidade passou a ser `(usuario_id, uuid)` |
| V-08 | Cache do guia não limpo no logout | 🟡 Baixo | ✅ **Corrigido** — `limparGuiaCache` no logout e na expiração por inatividade |
| V-09 | `COOKIE_SECURE=false` documentado | 🟡 Baixo | ✅ **Mitigado por documentação** — `DEPLOY.md` usa HTTPS via Certbot; risco permanece só em instalação local sem TLS |
| V-10 | `jwt.verify` sem fixar algoritmo | 🟡 Baixo | ✅ **Corrigido** — `algorithms: ['HS256']` |
| V-11 | Dependências vulneráveis | ⚪ Info | ⚠️ **Parcial** — backend em 0 vulnerabilidades; no frontend restam `vite`/`esbuild` (**só dev server**, não vai para produção) e `react-router` (**não explorável**: todos os destinos de navegação são literais, sem SSR — correção exigiria major v7) |
| V-12 | Sem throttle na troca de senha | ⚪ Info | ✅ **Corrigido** — rate limit por usuário em `/auth/senha`, `POST /usuarios` e reset |

**Adicional (pedido do cliente):** rate limit global por IP (600 req/min) em toda a API e limite de 100 KB no corpo JSON.

**Em aberto (§4 — melhorias de arquitetura):** validade para senha temporária, tabela de auditoria geral, custo do bcrypt 10→12, rotação de `JWT_SECRET`, throttle compartilhado para múltiplas instâncias.

---

## 1. Resumo Executivo

**Veredito: o sistema NÃO está pronto para produção no estado atual — mas está a poucas correções pontuais de estar.**

A qualidade de segurança do código é **acima da média** para um projeto deste porte. As áreas classicamente mais perigosas foram tratadas com competência e, em vários pontos, com decisões deliberadamente conservadoras e documentadas:

| Área | Situação |
|---|---|
| **SQL Injection** | ✅ **Limpo.** 100% das consultas parametrizadas. Nenhuma interpolação de valor. |
| **Modelo de permissões (`usuarios`)** | ✅ **Correto.** Nenhum caminho de escalada de privilégio de Gestor→Admin encontrado. |
| **XSS** | ✅ **Limpo.** Nenhum `dangerouslySetInnerHTML`/`innerHTML`/`eval` no frontend. |
| **Allowlist de PII no monitoramento** | ✅ **Sustenta.** Nenhum dado pessoal atravessa para o banco. |
| **Vazamento de stack trace / erros** | ✅ **Limpo.** Error handler devolve mensagem genérica no 500. |
| **CSRF / Cookies / JWT** | ⚠️ **Desenho sólido**, com lacunas de revogação de sessão. |
| **Credenciais padrão (seed)** | 🔴 **Crítico.** É o bloqueador de produção. |
| **Gestão do segredo JWT** | 🔴 **Alto.** A guarda existente não protege contra o caminho real de deploy. |
| **Isolamento entre lojas no dashboard** | 🟠 **Médio.** Quebra de multi-tenancy documentada como intencional. |

**O que impede o go-live hoje** são três problemas, todos de configuração/provisionamento e todos corrigíveis em poucas horas:

1. **Conta `admin@procar.com` com senha `procar123`**, semeada com `senha_definida = 1` — ou seja, **deliberadamente isenta** da troca obrigatória de senha — e com a senha publicada no próprio repositório (`README.md`, `DEPLOY.md`, `CLAUDE.md`). Quem alcançar a tela de login assume o sistema inteiro.
2. **A guarda de `JWT_SECRET` em produção não cobre o placeholder que o operador realmente copia.** O fluxo documentado `cp .env.example .env` produz um segredo público que o servidor aceita sem reclamar — permitindo forjar um token de admin.
3. **Contas de concessionária semeadas com a mesma senha conhecida** e um caminho de migração que as marca como "senha já definida", transformando-as em contas permanentes de posse de quem chegar primeiro.

Nenhum desses três é um defeito de arquitetura — são resíduos de conveniência de desenvolvimento que nunca foram desarmados para produção. A arquitetura em si (JWT em cookie httpOnly, CSRF double-submit, escopo por loja aplicado no service, allowlist de monitoramento) está bem concebida.

**Recomendação:** corrigir os itens 🔴 e 🟠 desta auditoria antes de expor o sistema; os 🟡 podem entrar no ciclo seguinte.

---

## 2. Vulnerabilidades Encontradas

### Índice por criticidade

| # | Vulnerabilidade | Risco | Categoria |
|---|---|---|---|
| [V-01](#v-01) | Conta admin padrão (`procar123`) isenta da troca obrigatória de senha | 🔴 **Crítico** | Credenciais padrão / bypass de autenticação |
| [V-02](#v-02) | Guarda de `JWT_SECRET` não cobre o placeholder do `.env.example` | 🔴 **Alto** | Gestão de segredos / forja de token |
| [V-03](#v-03) | Contas de concessionária com senha compartilhada conhecida | 🟠 **Alto** | Credenciais padrão / account takeover |
| [V-04](#v-04) | Sessões não são revogadas no logout, troca ou reset de senha | 🟠 **Médio** | Gestão de sessão |
| [V-05](#v-05) | `/api/gestor/*` expõe consultores de todas as lojas | 🟠 **Médio** | Broken Access Control / exposição de dados |
| [V-06](#v-06) | Ausência de headers de segurança HTTP | 🟡 **Médio** | Configuração insegura |
| [V-07](#v-07) | `uuid` de atendimento controlado pelo cliente | 🟡 **Baixo** | Integridade de auditoria |
| [V-08](#v-08) | Cache do guia não é limpo no logout (tablet compartilhado) | 🟡 **Baixo** | Exposição de dados locais |
| [V-09](#v-09) | `COOKIE_SECURE=false` documentado como caminho válido | 🟡 **Baixo** | Transporte inseguro |
| [V-10](#v-10) | `jwt.verify` sem fixação de algoritmo | 🟡 **Baixo** | Defesa em profundidade |
| [V-11](#v-11) | Dependências com vulnerabilidades conhecidas | ⚪ **Informativo** | Supply chain |
| [V-12](#v-12) | Sem throttle na troca de senha autenticada | ⚪ **Informativo** | Brute force |

---

<a id="v-01"></a>
## V-01 — Conta administrativa padrão, isenta da troca obrigatória de senha

| | |
|---|---|
| **Risco** | 🔴 **CRÍTICO** |
| **Categoria** | Credenciais padrão / bypass de autenticação (OWASP A07:2021 — Identification and Authentication Failures) |
| **Evidência** | [backend/src/database/setup.ts:119-144](backend/src/database/setup.ts#L119-L144) |
| **Confiança** | Alta — verificado diretamente no código-fonte |

### Descrição

O script de instalação documentado (`npm run db:setup`, item obrigatório da Seção 7 do `DEPLOY.md`) cria uma conta de perfil `admin` — o perfil de acesso total ao sistema — com senha fixa embutida no código:

```ts
const senhaHash = await bcrypt.hash('procar123', 10);                    // setup.ts:119
const email = 'admin@procar.com';                                        // setup.ts:124
'INSERT INTO usuarios (nome, email, senha_hash, perfil, senha_definida) VALUES (?, ?, ?, ?, 1)'  // setup.ts:128
```

O agravante não é a senha padrão em si — é o **`senha_definida = 1`**. Todo o mecanismo de primeiro acesso construído nesta branch (`exigirSenhaDefinida`, [backend/src/middlewares/auth.ts:83-93](backend/src/middlewares/auth.ts#L83-L93)) existe justamente para impedir que uma senha temporária vire permanente. A conta admin é **explicitamente excluída** desse controle, e a exclusão é **reafirmada a cada execução** do setup:

```ts
"UPDATE usuarios SET perfil = 'admin', senha_definida = 1 WHERE email = ? AND perfil <> 'admin'"  // setup.ts:136
```

Some-se a isso que a credencial está publicada em três arquivos versionados do repositório (`README.md`, `DEPLOY.md` Seção 7, `CLAUDE.md`) e impressa no stdout do servidor durante o setup (`setup.ts:131`). E que a interface não oferece caminho de troca: [frontend/src/modules/auth/AlterarSenhaPage.tsx:33](frontend/src/modules/auth/AlterarSenhaPage.tsx#L33) redireciona o perfil `admin` para fora da tela "Minha senha".

Ou seja: **nada no sistema em execução força, lembra ou sequer permite (pela UI) a rotação dessa credencial.** A proteção depende inteiramente de o operador lembrar de um item de checklist manual.

### Cenário de exploração

1. O atacante alcança a tela de login — trivial após o deploy, já que o `DEPLOY.md` publica a aplicação em domínio próprio com HTTPS na internet aberta.
2. Envia `POST /api/auth/login` com `{"email":"admin@procar.com","senha":"procar123"}`. O throttle de login não interfere: o primeiro palpite acerta.
3. Recebe um JWT de perfil `admin` em cookie httpOnly e passa a ter:
   - `GET /api/usuarios` — nome e e-mail corporativo de **todos** os consultores e gestores de **todas** as concessionárias;
   - `POST /api/usuarios` — criação de novas contas Gestor (persistência do acesso);
   - `PUT /api/usuarios/:id` — alteração de perfil e loja de qualquer usuário;
   - `POST /api/usuarios/:id/resetar-senha` — **tomada de qualquer conta**, já que o reset devolve a senha temporária em texto puro na resposta;
   - `GET /api/gestor/dashboard` — toda a base de métricas de uso.

Comprometimento total do sistema, sem exploração técnica alguma.

### Impacto para o negócio

- **Confidencialidade:** vazamento da lista completa de funcionários (nome + e-mail corporativo + horários de atividade) de todas as concessionárias clientes — insumo direto para phishing dirigido e de valor competitivo.
- **Integridade:** o atacante pode desativar consultores em massa (negação de acesso ao guia no balcão, em horário comercial) ou alterar silenciosamente permissões.
- **Contratual/Reputacional:** cada concessionária é um cliente distinto. Um incidente aqui não afeta um cliente — afeta a carteira inteira de uma vez, com exposição de dados de funcionários de terceiros (relevante para LGPD, ainda que o sistema não guarde dados de clientes finais).

### Recomendação técnica

Tratar a conta admin como qualquer outra: **sem exceção ao primeiro acesso**.

1. Semear com `senha_definida = 0` e remover a reafirmação de `senha_definida = 1` em `setup.ts:136`.
2. Liberar o perfil `admin` na tela `/minha-senha` (remover o redirect em `AlterarSenhaPage.tsx:33`). O backend **já aceita** `POST /api/auth/senha` para admin — só a UI bloqueia; a correção é de uma linha.
3. Ler a senha inicial de variável de ambiente e **recusar semear um valor padrão quando `NODE_ENV=production`**.
4. Parar de imprimir a credencial no stdout.

### Exemplo de implementação segura

```ts
// backend/src/database/setup.ts

// A senha inicial do admin nunca é embutida no código. Em produção é
// obrigatório fornecê-la pelo ambiente; em dev, geramos uma aleatória e a
// exibimos uma única vez (o primeiro acesso força a troca de qualquer forma).
function senhaInicialAdmin(): string {
  const doAmbiente = process.env.ADMIN_SENHA_INICIAL;
  if (doAmbiente) return doAmbiente;
  if (env.isProd) {
    throw new Error(
      'ADMIN_SENHA_INICIAL é obrigatória em produção: defina uma senha forte no ambiente.',
    );
  }
  return gerarSenhaTemporaria(); // já existe em modules/usuarios/usuarios.service.ts
}

const senhaAdmin = senhaInicialAdmin();
const senhaHash = await bcrypt.hash(senhaAdmin, 12);

// senha_definida = 0 → o admin cai obrigatoriamente em /primeiro-acesso,
// exatamente como qualquer outro perfil. Sem exceções.
await root.query(
  'INSERT INTO usuarios (nome, email, senha_hash, perfil, senha_definida) VALUES (?, ?, ?, ?, 0)',
  ['Administrador', email, senhaHash, 'admin'],
);

if (!env.isProd) {
  console.log(`✔ Admin criado: ${email} — senha temporária: ${senhaAdmin}`);
} else {
  console.log(`✔ Admin criado: ${email} — troque a senha no primeiro acesso.`);
}
```

E remover o `UPDATE ... senha_definida = 1` da promoção (mantendo apenas a mudança de `perfil`):

```ts
"UPDATE usuarios SET perfil = 'admin' WHERE email = ? AND perfil <> 'admin'"
```

---

<a id="v-02"></a>
## V-02 — A guarda de `JWT_SECRET` em produção não cobre o placeholder real do deploy

| | |
|---|---|
| **Risco** | 🔴 **ALTO** |
| **Categoria** | Gestão de segredos / forja de token (OWASP A02:2021 — Cryptographic Failures) |
| **Evidência** | [backend/src/config/env.ts:17,31,50-54](backend/src/config/env.ts#L17) + [backend/.env.example:12](backend/.env.example#L12) |
| **Confiança** | Alta — ambos os arquivos verificados |

### Descrição

O `env.ts` implementa uma guarda que impede o servidor de subir em produção com um segredo inseguro. A intenção é correta; a execução tem um furo exato:

```ts
const JWT_SECRET_INSEGURO = 'dev-secret-inseguro';        // env.ts:17
secret: required('JWT_SECRET', JWT_SECRET_INSEGURO),      // env.ts:31
if (isProd && env.jwt.secret === JWT_SECRET_INSEGURO) {   // env.ts:50
  throw new Error('JWT_SECRET não configurado em produção: ...');
}
```

A guarda compara com **igualdade exata** contra o literal `'dev-secret-inseguro'`. Mas o arquivo que o operador realmente copia no deploy — `.env.example`, conforme instruído em `DEPLOY.md` Seção 6 (`cp .env.example .env`) — contém um placeholder **diferente**:

```bash
JWT_SECRET=troque-este-segredo-em-producao   # .env.example:12
```

O fluxo documentado de instalação (`cp .env.example .env` → editar os campos de banco → esquecer o JWT) produz portanto uma aplicação que **sobe em produção sem qualquer aviso**, assinando todos os tokens com uma chave HMAC publicada no repositório. A guarda existe, roda, e não dispara.

### Cenário de exploração

1. O atacante identifica o software (a tela de login exibe a marca PROCAR; o repositório é encontrável) e presume o placeholder — ou simplesmente testa os dois valores conhecidos.
2. Assina localmente um token com a chave `troque-este-segredo-em-producao`:
   ```js
   jwt.sign(
     { sub: 1, nome: 'x', perfil: 'admin', marca: null, sd: true, sid: 1 },
     'troque-este-segredo-em-producao',
     { expiresIn: '30m' },
   );
   ```
3. Define o cookie `procar_token` com esse valor e, para as rotas mutantes, um par qualquer `procar_csrf` + header `X-CSRF-Token` idênticos entre si — a verificação CSRF ([middlewares/csrf.ts:24-30](backend/src/middlewares/csrf.ts#L24-L30)) é uma comparação de igualdade entre dois valores que o próprio atacante fornece, e não oferece resistência a quem já controla a requisição.
4. `authenticate` valida a assinatura, relê o usuário `id=1` no banco e concede acesso de admin.

**Bypass completo de autenticação, sem nenhuma credencial.** Combinado com V-01, o atacante tem dois caminhos independentes para o mesmo resultado.

### Impacto para o negócio

Idêntico ao V-01 (comprometimento total), com o agravante de ser **silencioso e sem rastro**: não há tentativa de login falha, não há registro em `sessoes` correlacionável, e o `reset_senha_log` só registra resets. A intrusão é indistinguível de uso legítimo do admin.

### Recomendação técnica

Validar a **qualidade** do segredo, não a sua identidade. Uma denylist de literais conhecidos sempre ficará atrás da criatividade dos placeholders; a verificação de entropia mínima cobre a classe inteira do problema.

### Exemplo de implementação segura

```ts
// backend/src/config/env.ts

// Placeholders conhecidos que já circularam em .env.example/DEPLOY.md.
// A lista é uma rede de segurança — a checagem de tamanho abaixo é a
// defesa real, porque cobre qualquer placeholder futuro.
const SEGREDOS_PROIBIDOS = new Set([
  'dev-secret-inseguro',
  'troque-este-segredo-em-producao',
  'changeme',
  'secret',
]);

const TAMANHO_MINIMO_SEGREDO = 32;

if (isProd) {
  const s = env.jwt.secret;
  if (SEGREDOS_PROIBIDOS.has(s) || s.length < TAMANHO_MINIMO_SEGREDO) {
    throw new Error(
      `JWT_SECRET inválido em produção: use um valor aleatório de ao menos ${TAMANHO_MINIMO_SEGREDO} caracteres. ` +
        'Gere um com: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
    );
  }
}
```

Adicionalmente, **remover o fallback** em `required('JWT_SECRET', JWT_SECRET_INSEGURO)` — um segredo ausente deve falhar em qualquer ambiente, não apenas em produção. E atualizar o `.env.example` para deixar o campo **vazio** (`JWT_SECRET=`), de modo que copiá-lo sem preencher quebre imediatamente, em vez de funcionar de forma insegura.

---

<a id="v-03"></a>
## V-03 — Contas de concessionária semeadas com senha compartilhada conhecida

| | |
|---|---|
| **Risco** | 🟠 **ALTO** |
| **Categoria** | Credenciais padrão / account takeover |
| **Evidência** | [backend/src/database/setup.ts:36-38,148-159](backend/src/database/setup.ts#L148-L159) e [setup.ts:67-76](backend/src/database/setup.ts#L67-L76) |
| **Confiança** | Alta |

### Descrição

O setup cria **uma conta de consultor por marca principal**, todas com a mesma senha `procar123`, e com endereço de e-mail **deterministicamente derivável** do nome da marca:

```ts
function emailDaMarca(marca: string): string {          // setup.ts:36-38
  return `${marca.toLowerCase().replace(/[^a-z0-9]/g, '')}@procar.com.br`;
}
// → bmw@procar.com.br, volkswagen@procar.com.br, audi@procar.com.br, ...
```

Essas contas nascem com `senha_definida = 0`, o que **bloqueia o acesso às rotas da aplicação** — mas **não bloqueia o login**, e `POST /api/auth/senha` está deliberadamente fora do gate `exigirSenhaDefinida` ([auth.routes.ts:12](backend/src/modules/auth/auth.routes.ts#L12)), como tem que estar para o primeiro acesso funcionar.

A consequência é que **a senha temporária não limita *quem* a consome — apenas *quantas vezes*.** Quem apresentá-la primeiro fica com a conta.

Há ainda um segundo caminho, mais grave, na migração de bancos existentes:

```ts
if (senhaDefinidaCriada) {
  await root.query('UPDATE usuarios SET senha_definida = 1');   // setup.ts:74
}
```

Ao adicionar a coluna `senha_definida` a um banco que já existia, **todos** os usuários são marcados como "senha já definida" — inclusive as contas semeadas em execuções anteriores que ainda usam `procar123`. Nesse cenário, as contas de concessionária deixam de exigir troca e passam a ser contas plenamente funcionais com senha pública.

### Cenário de exploração

O padrão de e-mail e a senha estão ambos publicados no repositório e no `DEPLOY.md`.

1. Antes de o consultor legítimo fazer o primeiro login, o atacante tenta `audi@procar.com.br` / `procar123`.
2. O login **é bem-sucedido** (retorna `mustChangePassword: true`).
3. O atacante chama `POST /api/auth/senha` com `{senhaAtual: "procar123", novaSenha: "<a dele>"}`.
4. `senha_definida` vira 1, o token é reemitido com `sd=true`, e o atacante passa a ter uma conta permanente e plenamente funcional dentro daquela loja.
5. O consultor legítimo, ao tentar entrar, encontra a senha "errada" — e o mais provável é que o incidente seja tratado como esquecimento de senha, não como intrusão.

### Impacto para o negócio

- Acesso ao conteúdo comercial completo daquela concessionária (Manual de Vendas: tabela de preços, argumentos, política de descontos) — informação de valor direto para um concorrente.
- Poluição das métricas de uso do gestor com atividade não legítima.
- Nas contas cobertas pelo caminho de migração (`senha_definida = 1`), o acesso é imediato, sem sequer precisar trocar a senha.

### Recomendação técnica

1. **Senha distinta e aleatória por conta semeada** — a função `gerarSenhaTemporaria()` já existe em [usuarios.service.ts:115](backend/src/modules/usuarios/usuarios.service.ts#L115) e produz exatamente o formato adequado (`xxxx-xxxx`, sem caracteres ambíguos).
2. **Não semear contas de teste em produção.** Elas existem para desenvolvimento; em `NODE_ENV=production` o Admin deve criar os consultores pela tela `/usuarios`, que já faz isso corretamente.
3. **Restringir o backfill da migração** para não abranger contas que ainda usam a senha semeada.
4. **Adicionar validade à senha temporária** (ex.: coluna `senha_temp_expira_em`), para que um reset não reivindicado não permaneça resgatável indefinidamente. Isso vale para todo o fluxo de reset, não só para o seed.

### Exemplo de implementação segura

```ts
// backend/src/database/setup.ts

// Contas de concessionária são material de DESENVOLVIMENTO. Em produção, o
// Admin cria os consultores pela tela /usuarios (que já gera senha aleatória
// individual e registra a ação).
if (!env.isProd) {
  for (const marca of MARCAS_PRINCIPAIS) {
    const emailMarca = emailDaMarca(marca);
    const [existentes] = await root.query('SELECT id FROM usuarios WHERE email = ?', [emailMarca]);
    if ((existentes as unknown[]).length === 0) {
      // Senha ALEATÓRIA por conta — nunca um valor compartilhado.
      const senhaTemp = gerarSenhaTemporaria();
      await root.query(
        'INSERT INTO usuarios (nome, email, senha_hash, perfil, marca, senha_definida) VALUES (?, ?, ?, ?, ?, 0)',
        [`Concessionária ${marca}`, emailMarca, await bcrypt.hash(senhaTemp, 12), 'consultor', marca, ],
      );
      console.log(`✔ ${emailMarca} / ${senhaTemp}`);
    }
  }
}
```

E tornar o backfill da migração conservador:

```ts
if (senhaDefinidaCriada) {
  // Marca como "já definida" apenas quem NÃO nasceu de um seed — contas
  // semeadas continuam obrigadas ao primeiro acesso.
  await root.query(
    "UPDATE usuarios SET senha_definida = 1 WHERE email NOT LIKE '%@procar.com.br'",
  );
}
```

---

<a id="v-04"></a>
## V-04 — Sessões não são revogadas no logout, na troca nem no reset de senha

| | |
|---|---|
| **Risco** | 🟠 **MÉDIO** |
| **Categoria** | Gestão de sessão (OWASP A07:2021) |
| **Evidência** | [auth.controller.ts:64-67](backend/src/modules/auth/auth.controller.ts#L64-L67), [middlewares/auth.ts:37-67](backend/src/middlewares/auth.ts#L37-L67), [usuarios.service.ts:323](backend/src/modules/usuarios/usuarios.service.ts#L323) |
| **Confiança** | Alta |

### Descrição

A autenticação é puramente stateless por assinatura. O middleware `authenticate` verifica o JWT e relê o usuário no banco — o que corretamente revoga contas **desativadas** na hora — mas **nunca consulta a linha de `sessoes` apontada pelo `sid`** do token. A tabela `sessoes` existe e é alimentada, mas serve apenas para métricas; não tem autoridade sobre a validade da sessão.

Decorrências:

1. **`logout` não revoga nada** — apenas limpa cookies no cliente (`limparCookiesAuth`). Qualquer cópia do token continua válida.
2. **`definirSenha` não invalida sessões anteriores** ([auth.service.ts:112-116](backend/src/modules/auth/auth.service.ts#L112-L116)) — não há versionamento de token nem corte por `iat`.
3. **`resetarSenha` — a alavanca explícita de "esta conta foi comprometida" — também não revoga nada.**
4. **Renovação deslizante sem teto absoluto:** `POST /auth/atividade` reassina um token novo de 30 min a cada chamada ([auth.controller.ts:94-101](backend/src/modules/auth/auth.controller.ts#L94-L101)). Quem detém um token e faz polling a cada 5 min permanece autenticado **indefinidamente**.

### Cenário de exploração

Contexto real do produto: **tablet compartilhado no balcão** (requisito explícito do `CLAUDE.md` §9).

1. O atacante obtém um `procar_token` — tablet deixado desbloqueado, extensão de navegador, ou captura de rede caso o servidor rode em HTTP puro (caminho documentado, ver V-09).
2. O gestor percebe algo estranho e **reseta a senha do consultor** — a resposta documentada para conta comprometida.
3. `senha_definida` vai a 0, o que bloqueia o atacante em `/guia` e `/usuarios`… **mas `/auth/atividade` não está atrás de `exigirSenhaDefinida`**, então ele continua deslizando o token.
4. Assim que o usuário legítimo conclui o primeiro acesso e `senha_definida` volta a 1, o token do atacante — reconstruído do banco a cada requisição — **recupera acesso pleno**.

**A remediação documentada para conta comprometida não remedia.**

### Impacto para o negócio

Perda da capacidade de resposta a incidentes. O gestor acredita ter cortado o acesso; não cortou. Hoje, o único mecanismo real de revogação em massa é desativar a conta (`ativo = 0`) ou rotacionar o `JWT_SECRET` — que derruba todos os usuários simultaneamente.

### Recomendação técnica

Tornar `sessoes` autoritativa. A tabela já existe e já carrega o `sid` no token — falta apenas consultá-la.

### Exemplo de implementação segura

```sql
-- schema.sql — encerramento explícito de sessão
ALTER TABLE sessoes ADD COLUMN encerrada_em DATETIME NULL AFTER ultimo_visto;
```

```ts
// backend/src/middlewares/auth.ts — a sessão passa a ter autoridade
const payload = verificarToken(token);
if (!payload) return next(unauthorized('Sessão expirada ou inválida'));

// A sessão do token precisa existir, pertencer ao usuário, não estar encerrada
// e não ter ultrapassado o teto absoluto — a renovação deslizante do heartbeat
// não pode prolongar uma sessão para sempre.
const [[sessao]] = await pool.query<RowDataPacket[]>(
  `SELECT id FROM sessoes
    WHERE id = ? AND usuario_id = ? AND encerrada_em IS NULL
      AND inicio >= (NOW() - INTERVAL ? HOUR) LIMIT 1`,
  [payload.sid, payload.sub, TETO_SESSAO_HORAS],
);
if (!sessao) return next(unauthorized('Sessão encerrada'));
```

```ts
// backend/src/modules/auth/auth.service.ts — helper de revogação
export async function encerrarSessoes(usuarioId: number, exceto?: number): Promise<void> {
  await pool.query(
    `UPDATE sessoes SET encerrada_em = NOW()
      WHERE usuario_id = ? AND encerrada_em IS NULL ${exceto ? 'AND id <> ?' : ''}`,
    exceto ? [usuarioId, exceto] : [usuarioId],
  );
}
```

Chamar `encerrarSessoes` em três pontos: no `logout` (só a sessão corrente), no `definirSenha` (todas exceto a corrente — o usuário que acabou de trocar a senha não deve ser deslogado) e no `resetarSenha` (**todas**, sem exceção — é exatamente o objetivo da operação).

---

<a id="v-05"></a>
## V-05 — `/api/gestor/*` ignora o escopo de loja e expõe consultores de todas as concessionárias

| | |
|---|---|
| **Risco** | 🟠 **MÉDIO** |
| **Categoria** | Broken Access Control / exposição de dados (OWASP A01:2021) |
| **Evidência** | [gestor.routes.ts:11](backend/src/modules/gestor/gestor.routes.ts#L11), [gestor.service.ts:46-64](backend/src/modules/gestor/gestor.service.ts#L46-L64) |
| **Confiança** | Alta |

### Descrição

Toda a razão de existir de `usuario_marcas` e de `buscarNoEscopo` ([usuarios.service.ts:144-158](backend/src/modules/usuarios/usuarios.service.ts#L144-L158)) é garantir que um Gestor veja apenas os consultores das lojas que administra — e no módulo `usuarios` isso é aplicado **corretamente**. O módulo `gestor` não aplica filtro nenhum:

```sql
FROM usuarios u
WHERE u.ativo = 1 AND u.perfil = 'consultor'   -- gestor.service.ts:61-62 — sem predicado de marca
```

E o `SELECT` devolve `u.nome`, `u.email`, `u.marca`, `u.ultimo_login` mais as contagens de sessões e atendimentos por usuário. A única barreira é `authorize('gestor', 'admin')`.

> **Nota:** o `CLAUDE.md` §9 (2026-07-23) registra isso como **decisão explícita do cliente** — "manter o comportamento já validado do monitoramento; escopar só o que é novo". A decisão é legítima do ponto de vista de gestão de produto, e a reporto aqui porque continua sendo uma quebra de isolamento entre inquilinos, agora **inconsistente** com o modelo de escopo que esta mesma branch introduziu no módulo `usuarios`. A decisão precisa ser reconfirmada com consciência do que expõe — não é uma questão puramente técnica.

### Cenário de exploração

Não requer exploração — é o comportamento normal da API para um usuário legítimo:

Um Gestor que administra apenas a loja Audi chama `GET /api/gestor/uso` (ou `/consultores?limite=100`) e recebe o quadro completo de funcionários de **todas** as concessionárias da plataforma: nome completo, e-mail corporativo, último login, horas logadas e atividade diária. São exatamente os dados que `GET /api/usuarios` **deliberadamente nega** ao mesmo usuário. A tela `/gestor/uso` faz polling a cada 30 s, então o conjunto está sempre atualizado.

### Impacto para o negócio

Concessionárias distintas são frequentemente **concorrentes diretas na mesma praça**. Entregar a um gestor da loja A a lista nominal de funcionários da loja B — com e-mail e padrão de jornada — é um problema comercial e contratual antes de ser técnico, e um insumo pronto para aliciamento de equipe ou phishing dirigido.

### Recomendação técnica

Propagar o escopo do chamador para o service, espelhando o que `usuarios.service.listar` já faz corretamente ([usuarios.service.ts:134-137](backend/src/modules/usuarios/usuarios.service.ts#L134-L137)). Admin mantém a visão global.

### Exemplo de implementação segura

```ts
// backend/src/modules/gestor/gestor.service.ts

// Admin (marcas = null) enxerga tudo; Gestor só as lojas que administra —
// mesmo critério já aplicado no módulo `usuarios`.
async function buscarUsoConsultores(dias: number, marcas: string[] | null): Promise<UsoUsuario[]> {
  const filtroMarca = marcas ? 'AND u.marca IN (?)' : '';
  const params = marcas ? [dias, dias, marcas] : [dias, dias];

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT u.id, u.nome, u.marca, u.ultimo_login, ...
       FROM usuarios u
      WHERE u.ativo = 1 AND u.perfil = 'consultor' ${filtroMarca}`,
    params,
  );
  // ...
}
```

```ts
// backend/src/modules/gestor/gestor.controller.ts
const escopoMarcas = req.user!.perfil === 'gestor' ? req.user!.marcas : null;
const dados = await gestorService.obterDashboard(dias, escopoMarcas);
```

Se, por decisão de produto, a visão global for mantida para o Gestor, **remover ao menos o campo `email` do payload para chamadores não-admin** — a tela de monitoramento não o utiliza, e é o campo de maior valor para um atacante.

---

<a id="v-06"></a>
## V-06 — Ausência de headers de segurança HTTP

| | |
|---|---|
| **Risco** | 🟡 **MÉDIO** |
| **Categoria** | Configuração insegura (OWASP A05:2021 — Security Misconfiguration) |
| **Evidência** | [backend/src/app.ts:9-27](backend/src/app.ts#L9-L27) (sem `helmet`); [DEPLOY.md](DEPLOY.md) Seção 10.1 (bloco Nginx sem `add_header`) |
| **Confiança** | Alta |

### Descrição

Nem o Express nem o Nginx configurado no `DEPLOY.md` emitem headers de segurança. Estão ausentes:

- `Strict-Transport-Security` (HSTS) — sem ele, o primeiro acesso em HTTP é rebaixável (SSL stripping), mesmo com o Certbot configurado;
- `X-Frame-Options` / `frame-ancestors` — a tela `/usuarios`, com ações destrutivas de um clique (desativar usuário, resetar senha), é enquadrável em iframe → **clickjacking**;
- `X-Content-Type-Options: nosniff`;
- `Content-Security-Policy` — a defesa em profundidade que limitaria o estrago caso um XSS surja no futuro;
- `Referrer-Policy`.

Com a arquitetura de VPS única definida no `DEPLOY.md` (frontend estático + `/api` no mesmo Nginx), o Nginx é o ponto natural para aplicá-los de uma vez para os dois.

### Cenário de exploração

Um Gestor autenticado é atraído a uma página do atacante que embute `https://seudominio.com.br/usuarios` num iframe transparente sobreposto a um jogo/CAPTCHA. Os cliques do gestor caem nos botões reais — desativando consultores ou disparando resets de senha. O cookie `SameSite=Strict` **não protege** aqui: a navegação de topo dentro do frame carrega a página com os cookies do usuário, e as ações partem da própria origem (com o CSRF token correto).

### Recomendação técnica

Aplicar `helmet` no Express (protege a API mesmo se o proxy mudar) **e** os headers no Nginx (protege o frontend estático). Defesa nas duas camadas, ambas baratas.

### Exemplo de implementação segura

```ts
// backend/src/app.ts
import helmet from 'helmet';

// API REST não renderiza HTML: CSP e CORP do helmet não atrapalham, mas
// desligamos o CSP padrão aqui porque quem serve HTML é o Nginx (ver DEPLOY.md).
app.use(
  helmet({
    contentSecurityPolicy: false,
    hsts: { maxAge: 31536000, includeSubDomains: true },
  }),
);
```

```nginx
# /etc/nginx/sites-available/procar — dentro do bloco server (HTTPS)
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy
  "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'" always;
```

> `script-src 'unsafe-inline'` é necessário pelo script inline de tema em `index.html`. Para endurecer depois, mover esse script para um arquivo próprio ou adicionar um nonce.

---

<a id="v-07"></a>
## V-07 — `uuid` de atendimento é controlado pelo cliente e único globalmente

| | |
|---|---|
| **Risco** | 🟡 **BAIXO** |
| **Categoria** | Integridade de auditoria / Broken Access Control |
| **Evidência** | [monitoramento.service.ts:24-40,52-73](backend/src/modules/monitoramento/monitoramento.service.ts#L24-L40), [schema.sql:124](backend/src/database/schema.sql#L124) |
| **Confiança** | Média-alta |

### Descrição

`atendimentos.uuid` é `CHAR(36) NOT NULL UNIQUE` — único **globalmente**, não por usuário — e é fornecido inteiramente pelo cliente. Ambos os caminhos de escrita usam `INSERT ... ON DUPLICATE KEY UPDATE` chaveado nesse uuid **sem guarda de `usuario_id`**. Uma requisição do usuário B que colida com o uuid do usuário A altera a linha de A (status, metadados), enquanto a linha mantém `usuario_id = A`.

Independentemente da colisão, qualquer consultor autenticado pode enviar uuids arbitrários e inflar os próprios `fichas_iniciadas`/`fichas_concluidas` — e essas linhas são a **única** fonte dos KPIs, rankings e taxa de conclusão do painel do gestor.

### Cenário de exploração

Um consultor mal posicionado no ranking "sem uso recente" roda algumas centenas de pares `POST /monitoramento/atendimento/iniciar` + `/concluir` com uuids novos, e aparece no topo de "quem mais usa" com 100% de conclusão — corrompendo exatamente a métrica que o módulo existe para produzir. A variante de sobrescrita entre usuários exige adivinhar um uuid v4 alheio (impraticável na prática, já que [gerarUuid](frontend/src/services/monitoramento.service.ts#L17-L29) usa `crypto.randomUUID`/`getRandomValues`, caindo em `Math.random` apenas num fallback improvável).

### Impacto para o negócio

Baixo em confidencialidade; relevante em **confiabilidade da informação gerencial**. Se o painel de uso vier a embasar avaliação de desempenho ou renovação de contrato por concessionária, uma métrica falsificável por quem é medido perde valor decisório.

### Recomendação técnica

```sql
-- Unicidade por usuário: um cliente nunca alcança a linha de outro.
ALTER TABLE atendimentos DROP INDEX uuid;
ALTER TABLE atendimentos ADD UNIQUE KEY uk_atendimento_usuario (usuario_id, uuid);
```

```ts
// E, na conclusão, restringir explicitamente ao dono:
`INSERT INTO atendimentos (uuid, usuario_id, ...) VALUES (?, ?, ...)
   ON DUPLICATE KEY UPDATE status = 'concluido', ...`
// com a chave composta acima, o ON DUPLICATE só casa a própria linha do usuário.
```

---

<a id="v-08"></a>
## V-08 — Cache do guia permanece no `localStorage` após o logout

| | |
|---|---|
| **Risco** | 🟡 **BAIXO** |
| **Categoria** | Exposição de dados locais |
| **Evidência** | [frontend/src/services/guia.service.ts:23-27](frontend/src/services/guia.service.ts#L23-L27), [contexts/AuthContext.tsx:38-42](frontend/src/contexts/AuthContext.tsx#L38-L42) |
| **Confiança** | Alta |

### Descrição

`buscarGuia` grava todo o conteúdo do guia em `localStorage` sob a chave `procar.guia.dados.{usuarioId}`. A função `sair()` limpa o estado React e chama o logout, mas **não remove o cache**. O `localStorage` é persistente por origem e sobrevive ao fechamento do navegador — comportamento diretamente contrário ao requisito de sessão efêmera em tablet compartilhado (`CLAUDE.md` §9).

### Cenário de exploração

No tablet compartilhado do balcão, qualquer pessoa com acesso ao dispositivo abre o DevTools (ou uma página que leia `localStorage` na mesma origem) e recupera o conteúdo comercial completo da concessionária do usuário anterior — tabela de preços, argumentos de venda, política de objeções — sem precisar de credencial nenhuma.

### Recomendação técnica

```ts
// frontend/src/services/guia.service.ts
export function limparGuiaCache(usuarioId: number): void {
  localStorage.removeItem(cacheKey(usuarioId));
}
```

```ts
// frontend/src/contexts/AuthContext.tsx
const sair = useCallback((): void => {
  // O cache do guia é conteúdo comercial da loja: não pode sobreviver à
  // sessão num tablet compartilhado (CLAUDE.md §9).
  if (usuario) limparGuiaCache(usuario.id);
  setUsuario(null);
  setPrecisaTrocarSenha(false);
  void authService.logout();
}, [usuario]);
```

> **Trade-off consciente:** isso força um novo download do guia no próximo login. Dado que a resposta é pequena (§2 do `CLAUDE.md`) e que o login já exige rede, o impacto no offline-first é nulo — o cache continua servindo durante toda a sessão, que é onde ele importa.

---

<a id="v-09"></a>
## V-09 — `COOKIE_SECURE=false` documentado como caminho válido de produção

| | |
|---|---|
| **Risco** | 🟡 **BAIXO** (🟠 Médio se efetivamente adotado) |
| **Categoria** | Transporte inseguro |
| **Evidência** | [backend/src/config/env.ts:40-43](backend/src/config/env.ts#L40-L43), `CLAUDE.md` §11 item 3b |
| **Confiança** | Alta |

### Descrição

O `env.ts` e o `CLAUDE.md` instruem definir `COOKIE_SECURE=false` caso o servidor rode em HTTP puro na rede local. Nessa configuração, o cookie de sessão e as credenciais de login trafegam **em texto claro** pela LAN da concessionária — uma rede compartilhada com visitantes, oficina e Wi-Fi de clientes. É também o cenário que torna o V-04 (ausência de revogação) materialmente mais fácil de explorar.

O `DEPLOY.md` reescrito nesta sessão já resolve isso para a VPS Hostinger (HTTPS via Certbot). O risco permanece apenas para uma eventual instalação em servidor local.

### Recomendação técnica

Terminar TLS mesmo no servidor local — certificado interno ou `mkcert` para a rede da loja. Se o HTTP puro for inevitável, documentar explicitamente o risco aceito e restringir o acesso por VLAN/firewall à sub-rede do balcão.

---

<a id="v-10"></a>
## V-10 — `jwt.verify` sem fixação de algoritmo

| | |
|---|---|
| **Risco** | 🟡 **BAIXO** (defesa em profundidade) |
| **Categoria** | Configuração criptográfica |
| **Evidência** | [backend/src/modules/auth/token.ts:40-48](backend/src/modules/auth/token.ts#L40-L48) |
| **Confiança** | Alta |

### Descrição

```ts
const decoded = jwt.verify(token, env.jwt.secret);   // token.ts:42 — sem { algorithms }
```

Na versão 9 do `jsonwebtoken`, um segredo do tipo string já restringe implicitamente a família HMAC e `alg: none` é rejeitado — **não há vulnerabilidade explorável hoje**. Registro como defesa em profundidade: a fixação explícita elimina a dependência de um comportamento default e protege contra regressões numa futura migração para chaves assimétricas.

### Recomendação técnica

```ts
const decoded = jwt.verify(token, env.jwt.secret, {
  algorithms: ['HS256'],   // explícito: nunca aceitar 'none' nem troca de família
});
```

---

<a id="v-11"></a>
## V-11 — Dependências com vulnerabilidades conhecidas

| | |
|---|---|
| **Risco** | ⚪ **Informativo** |
| **Categoria** | Supply chain |
| **Evidência** | `npm audit` executado em 2026-07-28 |

**Backend** (`--omit=dev`) — 1 vulnerabilidade baixa:

| Pacote | Severidade | Nota |
|---|---|---|
| `body-parser <1.20.6` | Baixa | DoS por limite inválido. Transitiva do Express 4. `npm audit fix` resolve. |

**Frontend** — 5 vulnerabilidades (2 altas, 3 moderadas):

| Pacote | Severidade | Nota |
|---|---|---|
| `postcss <=8.5.17` | **Alta** | Path traversal via sourceMappingURL. Só build-time. `npm audit fix` resolve. |
| `react-router` / `react-router-dom` 6.x | Moderada | Open redirect via backslash em `<Link>`/`useNavigate`. **Runtime** — o mais relevante da lista. `npm audit fix` resolve. |
| `esbuild <=0.24.2` / `vite <=6.4.2` | Moderada | Dev server lê respostas de qualquer origem. Só desenvolvimento. Correção exige `vite@8` (breaking). |

**Recomendação:** rodar `npm audit fix` (não-breaking) nos dois projetos antes do deploy — resolve o `postcss` e o `react-router`. O `esbuild`/`vite` afeta apenas o servidor de desenvolvimento e pode ser agendado. Adicionar `npm audit --omit=dev` ao pipeline.

---

<a id="v-12"></a>
## V-12 — Sem throttle na troca de senha autenticada

| | |
|---|---|
| **Risco** | ⚪ **Informativo** |
| **Categoria** | Brute force |
| **Evidência** | [auth.routes.ts:12](backend/src/modules/auth/auth.routes.ts#L12) |

`POST /auth/senha` valida `senhaAtual` sem limite de tentativas. Exige sessão autenticada já válida, o que reduz muito o cenário — mas num tablet compartilhado deixado logado, permite adivinhar a senha atual do usuário sem custo. O `login-throttle.ts` já existe e pode ser reaproveitado com a chave `senha|${usuarioId}`.

Registro também que o throttle de login é **em memória** (documentado no próprio arquivo): zera a cada deploy e não sobrevive a escala horizontal. Adequado ao porte atual; se o sistema crescer para múltiplas instâncias, migrar o contador para um store compartilhado.

---

## 3. O que foi verificado e está correto

Tão importante quanto a lista de falhas — estas eram as áreas de maior risco no escopo, e elas se sustentam sob análise:

### SQL Injection — limpo em 100% das consultas

Todas as queries dos módulos `usuarios`, `gestor`, `guia`, `monitoramento` e `auth` são parametrizadas. As construções dinâmicas são **derivadas de contagem, nunca de valor**:

- `obterFabricantes` monta `marcas.map(() => 'name LIKE ?')` ([guia.service.ts:90-91](backend/src/modules/guia/guia.service.ts#L90-L91)) — gera placeholders, não valores;
- `substituirMarcasDoGestor` monta `marcas.map(() => '(?, ?)')` ([usuarios.service.ts:81](backend/src/modules/usuarios/usuarios.service.ts#L81));
- `atualizar` concatena apenas literais de coluna fixos ([usuarios.service.ts:294](backend/src/modules/usuarios/usuarios.service.ts#L294)), com `campos` e `valores` mantidos alinhados em todos os ramos — incluindo o `marca = NULL`, que corretamente não empurra valor.

O ponto onde a maioria dos projetos falha — `ORDER BY` e paginação dinâmicos, que não aceitam placeholder — foi **deliberadamente evitado**: `gestor.service.ts` ordena e pagina em JavaScript ([linhas 88-129](backend/src/modules/gestor/gestor.service.ts#L88-L129)), com comentário explicando a escolha. A única instrução interpolada, `purgarAtendimentosAntigos` ([monitoramento.service.ts:88](backend/src/modules/monitoramento/monitoramento.service.ts#L88)), recebe apenas constantes internas do job e ainda aplica `Math.floor`.

### Modelo de privilégios do módulo `usuarios` — sem escalada

Rastreei cada caminho que um Gestor poderia tentar para escalar privilégios. Todos fecham:

| Tentativa | Barreira |
|---|---|
| Enviar `perfil: 'gestor'` ao criar usuário | `criar` sobrescreve com `perfil = 'consultor'` no servidor ([:187](backend/src/modules/usuarios/usuarios.service.ts#L187)) |
| Criar consultor em loja alheia | `marca` validada contra `escopo.marcas` ([:184](backend/src/modules/usuarios/usuarios.service.ts#L184)) |
| Alterar `perfil`/`marca`/`marcas` de alguém | Todo o bloco está atrás de `escopo.perfil === 'admin'` ([:261](backend/src/modules/usuarios/usuarios.service.ts#L261)) — mass assignment não alcança |
| Editar/resetar usuário de outra loja | `buscarNoEscopo` → `404` (não `403`, evitando confirmar existência por enumeração) |
| Atribuir a si mesmo novas lojas | `buscarNoEscopo` bloqueia o próprio Gestor (perfil ≠ consultor) |
| Tocar em conta `admin` | Bloqueada explicitamente ([:148-150](backend/src/modules/usuarios/usuarios.service.ts#L148-L150)) |
| Resetar a própria senha por essa via | Bloqueado ([:316](backend/src/modules/usuarios/usuarios.service.ts#L316)) |

O escopo é derivado sempre de `req.user`, **nunca do corpo da requisição** ([usuarios.controller.ts:8-11](backend/src/modules/usuarios/usuarios.controller.ts#L8-L11)) — o padrão correto. E o Zod valida cada `marca` contra `MARCAS_PRINCIPAIS`.

### Demais verificações

- **Allowlist de PII (monitoramento):** `eventoSchema` descarta chaves desconhecidas (comportamento padrão do Zod), a tabela `atendimentos` não tem coluna de PII por construção, e o cliente genuinamente omite o nome do cliente final. **Sustenta.**
- **XSS:** nenhum `dangerouslySetInnerHTML`, `innerHTML`, `eval` ou `document.write` em todo o frontend. React escapa por padrão.
- **Tratamento de erros:** `error-handler.ts` devolve mensagem genérica no 500; stack traces vão só para o log do servidor.
- **CSRF:** o desenho double-submit é válido — a proteção real vem do `SameSite=Strict` no `procar_token`, e o double-submit é a camada complementar correta. Login isento está certo (não há credencial ambiente a abusar).
- **Revogação de conta desativada:** `authenticate` relê o usuário a cada requisição — desativar (`ativo = 0`) corta o acesso **imediatamente**, sem esperar o token expirar. Bom design.
- **`trust proxy: 1`:** correto para a topologia do `DEPLOY.md`. Com o Nginx usando `$proxy_add_x_forwarded_for` (que **anexa** o IP real à direita) e o Express tomando 1 salto a partir da direita, um `X-Forwarded-For` forjado pelo cliente **não** contamina o `req.ip` do throttle. Verificado.
- **Command injection / Path traversal / SSRF / Prototype pollution / Deserialização:** sem superfície. Não há `child_process`, operações de arquivo com entrada do usuário, requisições HTTP de saída, nem uploads em todo o backend.
- **Uploads:** inexistentes no sistema.

---

## 4. Melhorias de Arquitetura Recomendadas

Itens que não são vulnerabilidades hoje, mas que se tornam risco conforme o sistema cresce.

### 4.1. `sessoes` como fonte de verdade da sessão (prioritário)

Detalhado no V-04. Além de resolver a revogação, isso destrava recursos que o cliente provavelmente pedirá: "encerrar todas as sessões deste usuário", "ver quem está logado agora e derrubar", limite de sessões simultâneas por conta. Hoje a tabela existe e é alimentada, mas não tem autoridade — o custo de promovê-la é uma coluna e uma consulta no middleware.

### 4.2. Generalizar `reset_senha_log` em uma tabela de auditoria

Hoje só o reset de senha é auditado. As ações de maior alcance — **criação de conta, mudança de perfil, mudança de loja, desativação** — não deixam rastro algum. Se um Gestor for comprometido, não há como reconstruir o que ele fez.

```sql
CREATE TABLE auditoria (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  ator_id       INT NOT NULL,
  acao          VARCHAR(40) NOT NULL,  -- 'usuario.criar', 'usuario.perfil', 'senha.reset'...
  alvo_id       INT NULL,
  detalhe       JSON NULL,             -- só metadados, nunca senha/PII
  criado_em     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_auditoria_ator (ator_id, criado_em),
  INDEX idx_auditoria_alvo (alvo_id, criado_em)
) ENGINE=InnoDB;
```

Migrar `reset_senha_log` para cá mantém uma fonte única. A política de retenção de 60 dias do job existente pode ser estendida (auditoria costuma merecer retenção maior — 1 ano é usual).

### 4.3. Validade para senhas temporárias

Hoje uma senha temporária gerada por reset é resgatável **indefinidamente**. Se o Gestor resetar a senha de um consultor de férias e o papel com a senha ficar no balcão por três semanas, a janela de exposição é de três semanas. Uma coluna `senha_temp_expira_em DATETIME NULL`, verificada no login quando `senha_definida = 0`, fecha isso com pouco código.

### 4.4. Custo do bcrypt e biblioteca

`bcryptjs` (implementação pura em JS, mais lenta que a nativa para o mesmo trabalho útil) com custo **10**. Para 2026, o custo recomendado está em 12. Como o volume de logins é baixo (poucos balcões), subir para 12 não tem impacto perceptível de performance e dobra o custo de um ataque offline caso os hashes vazem. Trocar por `bcrypt` nativo ou `argon2` é opcional — o ganho está mais no custo do que na biblioteca.

### 4.5. Rotação do `JWT_SECRET`

Não há mecanismo de rotação: trocar o segredo derruba todas as sessões de uma vez. Suportar uma lista de segredos (o primeiro assina, todos verificam) permite rotação sem interrupção. Combinado com o 4.1, o segredo deixa de ser o único botão de emergência.

### 4.6. Throttle de login compartilhado

O contador em memória (`login-throttle.ts`) zera a cada restart e não funciona com múltiplas instâncias — limitação já documentada no próprio arquivo. Enquanto for uma instância só, está adequado; se o deploy evoluir para PM2 em modo cluster (tentador numa VPS com mais de 1 vCPU), o throttle **efetivamente deixa de funcionar** sem nenhum sinal. Vale um comentário no `DEPLOY.md` alertando para não usar `pm2 start -i max` sem antes migrar o contador.

### 4.7. CORS preparado para múltiplas origens

`corsOrigin` aceita uma única origem — correto e conservador hoje, especialmente com a arquitetura de VPS única (mesma origem, CORS praticamente irrelevante). Se um segundo frontend surgir (app do gestor, ambiente de homologação), a mudança deve ser para uma **lista de origens permitidas**, nunca para `*` — que é incompatível com `credentials: true` de qualquer forma.

---

## 5. Checklist Final de Hardening para Produção

### 🔴 Bloqueadores — resolver antes de expor o sistema

- [ ] **V-01** — Semear o admin com `senha_definida = 0`; remover o `UPDATE ... senha_definida = 1` da promoção; ler a senha inicial de `ADMIN_SENHA_INICIAL`; liberar o admin em `/minha-senha`.
- [ ] **V-01** — Trocar a senha de `admin@procar.com` no banco de produção (se o setup já rodou com o padrão).
- [ ] **V-02** — Substituir a comparação exata de `JWT_SECRET` por validação de tamanho mínimo (≥32) + denylist; deixar `JWT_SECRET=` **vazio** no `.env.example`; remover o fallback do `required()`.
- [ ] **V-02** — Confirmar que o `JWT_SECRET` de produção foi gerado aleatoriamente (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) e **não** é o placeholder.
- [ ] **V-03** — Não semear contas de concessionária quando `NODE_ENV=production`; senha aleatória individual em desenvolvimento.
- [ ] **V-03** — Remover ou resetar todas as contas `*@procar.com.br` que ainda usem `procar123` no banco de produção.
- [ ] **V-03** — Restringir o backfill `UPDATE usuarios SET senha_definida = 1` para não abranger contas semeadas.

### 🟠 Alta prioridade — resolver no primeiro ciclo pós-deploy

- [ ] **V-04** — Adicionar `sessoes.encerrada_em`; validar a sessão em `authenticate`; encerrar sessões no logout, na troca e no reset de senha; teto absoluto de sessão.
- [ ] **V-05** — Decidir conscientemente com o cliente: escopar `/api/gestor/*` por loja **ou** documentar a exposição como risco aceito. Em qualquer cenário, remover `email` do payload para não-admin.
- [ ] **V-06** — `helmet` no Express + `add_header` no Nginx (HSTS, nosniff, X-Frame-Options, CSP, Referrer-Policy).
- [ ] **V-11** — `npm audit fix` no backend e no frontend (resolve `postcss` alto e `react-router` moderado).

### 🟡 Média prioridade

- [ ] **V-07** — Trocar `UNIQUE(uuid)` por `UNIQUE(usuario_id, uuid)` em `atendimentos`.
- [ ] **V-08** — Limpar o cache do guia no `localStorage` durante o logout.
- [ ] **V-09** — Garantir HTTPS mesmo em instalação local; evitar `COOKIE_SECURE=false`.
- [ ] **V-10** — `algorithms: ['HS256']` em `jwt.verify`.
- [ ] **V-12** — Aplicar throttle em `POST /auth/senha`.

### ⚙️ Configuração de infraestrutura (VPS / Nginx / MySQL)

- [ ] `NODE_ENV=production` no `.env` do backend.
- [ ] MySQL acessado por usuário próprio da aplicação (`procar_app`), nunca `root`.
- [ ] Portas 3306 (MySQL) e 3333 (backend) **não** expostas à internet — confirmar com `sudo ufw status`.
- [ ] Firewall em duas camadas: hPanel (22/80/443) **e** `ufw` na VPS.
- [ ] Acesso SSH por chave; `PasswordAuthentication no` após confirmar que a chave funciona.
- [ ] Usuário Linux não-root (`procar`) para operação diária.
- [ ] HTTPS ativo com renovação automática do Certbot (`sudo certbot renew --dry-run` para confirmar).
- [ ] `CORS_ORIGIN` apontando para a URL final com `https://`.
- [ ] Backup diário do MySQL agendado e **restauração testada ao menos uma vez** (backup não testado não é backup).
- [ ] `pm2 startup` confirmado — o backend volta sozinho após reboot.
- [ ] **Não** usar `pm2 start -i max` (modo cluster) enquanto o throttle de login for em memória — ver 4.6.
- [ ] Permissões do `.env` restritas (`chmod 600`) e proprietário correto.
- [ ] Log de erros do Nginx e do PM2 monitorados nos primeiros dias.

### 📋 Processo

- [ ] `npm audit --omit=dev` adicionado ao pipeline de build.
- [ ] Procedimento de resposta a incidente definido: *como revogar o acesso de um usuário comprometido?* (hoje a resposta correta é `ativo = 0`, **não** o reset de senha — ver V-04).
- [ ] Rever esta auditoria após implementar V-01 a V-06.

---

## 6. Conclusão

O PROCAR foi construído com atenção real à segurança — o que fica evidente nas escolhas que **não** aparecem como achados: consultas parametrizadas sem exceção, `ORDER BY` dinâmico deliberadamente evitado, escopo de permissão derivado do token e nunca do corpo, `404` em vez de `403` para não vazar existência de contas, allowlist rígido no monitoramento, revogação imediata de conta desativada. Essas decisões são de quem pensou no problema, não de quem seguiu um template.

As falhas encontradas concentram-se num único ponto cego: **a fronteira entre o ambiente de desenvolvimento e o de produção**. As credenciais semeadas, a guarda de segredo que valida o placeholder errado e o backfill permissivo da migração são todos artefatos de conveniência de desenvolvimento que nunca foram desarmados para o mundo real. São correções pontuais, não redesenhos — nenhuma delas exige repensar a arquitetura.

Corrigidos os sete itens bloqueadores da Seção 5, o sistema tem uma postura de segurança **adequada ao seu contexto de uso e ao dado que manipula**. Os itens de prioridade alta (revogação de sessão, escopo do dashboard, headers HTTP) elevam-no de "adequado" para "sólido", e valem o esforço no primeiro ciclo após o go-live.

---

*Auditoria conduzida por leitura integral do código-fonte, sem execução de exploits contra ambiente ativo. As linhas citadas referem-se ao estado da branch `feat/monitoramento-e-seguranca` no commit `a5b1720` (2026-07-28).*
