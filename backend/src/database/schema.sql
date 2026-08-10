-- Schema do PROCAR — Guia de Atendimento
-- Executado por src/database/setup.ts
--
-- NOTA: este schema cria a ESTRUTURA de vehicle_brands/vehicle_models
-- (tabelas vazias) para que o db:setup sozinho já deixe o banco pronto para
-- o import; os DADOS continuam vindo à parte, da API FIPE
-- (parallelum.com.br/fipe/api/v1) via `npm run import:fipe:marcas`
-- (backend/src/database/import-fipe/), nunca em tempo de boot/atendimento —
-- ver IMPORTACAO-FIPE.md. vehicle_years/vehicle_categories continuam
-- totalmente fora daqui (import opcional, ver IMPORTACAO-FIPE.md §6).

-- Estrutura das tabelas de veículos (FIPE) — populadas pelo script de import,
-- não pelo schema. UNIQUE KEY em fipe_brand_id/fipe_model_id é o que faz o
-- INSERT IGNORE do script não duplicar ao rodar de novo.
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

-- `marca` restringe o usuário a uma concessionária: quando preenchida, o guia
-- mostra apenas os veículos daquela marca (casada por LIKE contra
-- vehicle_brands.name). NULL = sem restrição (admin vê todas as marcas).
-- `senha_definida` = 0 quando a senha ainda é a temporária semeada/resetada: o
-- usuário é obrigado a trocá-la no primeiro acesso antes de usar o sistema
-- (POST /auth/senha). `perfil`: 'admin' (TI, gerencia todos os usuários,
-- senha trocada manualmente via SQL — sem fluxo no app), 'gestor' (gerencia
-- os consultores da própria `marca`) e 'consultor' (usa o guia de atendimento).
CREATE TABLE IF NOT EXISTS usuarios (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  nome           VARCHAR(120) NOT NULL,
  email          VARCHAR(160) NOT NULL UNIQUE,
  senha_hash     VARCHAR(255) NOT NULL,
  perfil         ENUM('consultor', 'gestor', 'admin') NOT NULL DEFAULT 'consultor',
  marca          VARCHAR(60),
  ultimo_login   DATETIME,
  senha_definida TINYINT(1) NOT NULL DEFAULT 0,
  ativo          TINYINT(1) NOT NULL DEFAULT 1,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Sessões de uso do guia. Serve a dois propósitos:
--   1. Métrica: o gestor monitora quais concessionárias usam o manual. Uma
--      linha por login; `ultimo_visto` avança via heartbeat do frontend
--      enquanto o consultor está ativo. Tempo logado = ultimo_visto - inicio.
--   2. AUTORIDADE da sessão: o `sid` do JWT aponta para esta linha e o
--      middleware `authenticate` a consulta a cada requisição. `encerrada_em`
--      preenchida = sessão revogada (logout, troca ou reset de senha) → o token
--      correspondente para de valer na hora, mesmo dentro da validade do JWT.
--      Sem isso, um token capturado continuaria válido e podendo ser renovado
--      indefinidamente pelo heartbeat.
CREATE TABLE IF NOT EXISTS sessoes (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id   INT NOT NULL,
  inicio       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultimo_visto TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  encerrada_em DATETIME NULL,
  CONSTRAINT fk_sessoes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  INDEX idx_sessoes_usuario_abertas (usuario_id, encerrada_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- Conteúdo do Guia de Atendimento (pequeno, seed local, cacheado no cliente).
-- Marcas/modelos vêm das tabelas vehicle_* (FIPE), não daqui.
-- =====================================================================

-- `argumento` é o "argumento por cor" do Manual de Vendas: texto de venda
-- específico da cor, injetado nos templates via placeholder {argumento_cor}.
CREATE TABLE IF NOT EXISTS cores (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  nome      VARCHAR(40) NOT NULL UNIQUE,
  hex       VARCHAR(7) NOT NULL DEFAULT '#cccccc',
  argumento TEXT,
  ordem     INT NOT NULL DEFAULT 0,
  ativo     TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS servicos (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  nome      VARCHAR(80) NOT NULL,
  selo      VARCHAR(60),
  descricao VARCHAR(255),
  ordem     INT NOT NULL DEFAULT 0,
  ativo     TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Etapas do roteiro; frase_template aceita {cliente}, {modelo}, {cor},
-- {fabricante}, {banco}, {cor_banco}, {setor} e {argumento_cor}.
-- setor/canal/banco filtram a etapa para o atendimento (NULL = qualquer):
-- os roteiros do Manual de Vendas variam por setor (Novos, Oficina...),
-- canal (presencial/telefone) e tipo de banco (tecido/couro).
CREATE TABLE IF NOT EXISTS roteiro_etapas (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  ordem          INT NOT NULL DEFAULT 0,
  setor          VARCHAR(40),
  canal          ENUM('presencial', 'telefone'),
  banco          ENUM('tecido', 'couro'),
  titulo         VARCHAR(80) NOT NULL,
  instrucao      TEXT NOT NULL,
  frase_template TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Regra: oferece um serviço quando a seleção casa com cor/categoria/modelo/banco.
-- Campos NULL significam "qualquer". argumento_template aceita os placeholders acima.
-- modelo_id referencia vehicle_models.id (sem FK, pois vehicle_models é externa/FIPE).
-- banco: tipo de banco do veículo informado no atendimento (tecido ou couro).
CREATE TABLE IF NOT EXISTS regras (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  ativo              TINYINT(1) NOT NULL DEFAULT 1,
  prioridade         INT NOT NULL DEFAULT 0,
  cor                VARCHAR(40),
  categoria          VARCHAR(40),
  modelo_id          INT,
  banco              ENUM('tecido', 'couro'),
  setor              VARCHAR(40),
  servico_id         INT NOT NULL,
  argumento_template TEXT NOT NULL,
  CONSTRAINT fk_regras_servico FOREIGN KEY (servico_id) REFERENCES servicos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Contorno de objeções e dicas de ouro do Manual de Vendas, exibidos no guia
-- como material de apoio (valem para qualquer atendimento).
CREATE TABLE IF NOT EXISTS objecoes (
  id       INT AUTO_INCREMENT PRIMARY KEY,
  tipo     ENUM('objecao', 'dica') NOT NULL DEFAULT 'objecao',
  ordem    INT NOT NULL DEFAULT 0,
  titulo   VARCHAR(160) NOT NULL,
  resposta TEXT NOT NULL,
  ativo    TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- Monitoramento de utilização (auditoria de uso da ferramenta).
-- =====================================================================

-- Um registro por atendimento conduzido no guia — APENAS para métricas de uso
-- do gestor. NÃO é cadastro de cliente: por construção não há coluna para nome,
-- telefone, CPF, placa, chassi ou qualquer PII; só metadados não-identificáveis
-- (marca, setor, canal, categoria, banco). `uuid` é gerado no cliente e liga o
-- início à conclusão de forma tolerante a offline (o mesmo uuid chega nas duas
-- chamadas). Registros são removidos automaticamente após 60 dias (retention job).
--
-- A unicidade é (usuario_id, uuid), NÃO uuid sozinho: como o uuid vem do
-- cliente, uma chave global permitiria que a requisição de um usuário casasse
-- no ON DUPLICATE KEY da linha de outro e alterasse o registro alheio. Com a
-- chave composta, o conflito só pode ocorrer dentro do próprio usuário.
CREATE TABLE IF NOT EXISTS atendimentos (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  uuid         CHAR(36) NOT NULL,
  usuario_id   INT NOT NULL,
  sessao_id    INT NULL,
  status       ENUM('iniciado', 'concluido') NOT NULL DEFAULT 'iniciado',
  marca        VARCHAR(60),
  setor        VARCHAR(40),
  canal        ENUM('presencial', 'telefone'),
  categoria    VARCHAR(40),
  banco        ENUM('tecido', 'couro'),
  iniciado_em  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  concluido_em DATETIME NULL,
  CONSTRAINT fk_atendimentos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_atendimentos_sessao  FOREIGN KEY (sessao_id)  REFERENCES sessoes(id)  ON DELETE SET NULL,
  UNIQUE KEY uk_atendimentos_usuario_uuid (usuario_id, uuid),
  INDEX idx_atendimentos_usuario (usuario_id, iniciado_em),
  INDEX idx_atendimentos_iniciado (iniciado_em),
  INDEX idx_atendimentos_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- Gerenciamento de usuários (Admin/Gestor) — auditoria de reset de senha.
-- =====================================================================

-- Uma linha por reset de senha executado por um Admin ou Gestor sobre outro
-- usuário (Admin reseta qualquer um; Gestor só consultores da própria loja —
-- ver módulo `usuarios`). Sem PII além dos ids (já existentes em `usuarios`);
-- a senha temporária gerada NUNCA é persistida em texto puro, só devolvida
-- uma vez na resposta da API para quem executou o reset comunicar ao usuário.
--
-- As duas FKs são ON DELETE SET NULL (não CASCADE) e as colunas são NULL:
-- excluir um usuário NÃO pode apagar o registro de que um reset aconteceu.
-- Com CASCADE, bastaria excluir o executor — ou a própria vítima — para
-- eliminar a evidência da ação, o que anularia o propósito da auditoria.
-- A linha sobrevive com o lado removido em NULL ("usuário removido").
CREATE TABLE IF NOT EXISTS reset_senha_log (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id    INT NULL,
  executado_por INT NULL,
  criado_em     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reset_usuario  FOREIGN KEY (usuario_id)    REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_reset_executor FOREIGN KEY (executado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Lojas (marcas) administradas por um Gestor — um Gestor pode administrar
-- MÚLTIPLAS concessionárias. Usada só para perfil 'gestor'; Consultor continua
-- com uma única loja em `usuarios.marca` (é onde ele atende). Quando um
-- usuário vira/é Gestor, `usuarios.marca` fica NULL e as lojas passam a viver
-- aqui — evita ambiguidade entre as duas fontes.
CREATE TABLE IF NOT EXISTS usuario_marcas (
  usuario_id INT NOT NULL,
  marca      VARCHAR(60) NOT NULL,
  PRIMARY KEY (usuario_id, marca),
  CONSTRAINT fk_usuario_marcas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
