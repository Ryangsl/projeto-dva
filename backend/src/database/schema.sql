-- Schema do Grupo DVA — Gerenciamento e Distribuição de Veículos
-- Executado por src/database/setup.ts
--
-- Banco PRÓPRIO do DVA (padrão: dva_veiculos), separado do banco antigo do
-- Guia PROCAR (padrão: painel_procar), que não é tocado por este projeto.
--
-- `vehicle_brands`/`vehicle_models` (catálogo de marca/modelo, já importado da
-- FIPE) NÃO vivem aqui — continuam só no banco antigo. `veiculos.marca_id`/
-- `modelo_id` referenciam essas tabelas por id, mas SEM FOREIGN KEY (o MySQL
-- não permite FK entre bancos diferentes): a validação de que o id existe é
-- feita em `modules/veiculos/veiculos.service.ts`, via consulta cross-database
-- qualificada (`<DB_VEHICLES_NAME>.vehicle_brands`), a cada cadastro.

-- `senha_definida` = 0 quando a senha ainda é a temporária semeada/resetada: o
-- usuário é obrigado a trocá-la no primeiro acesso antes de usar o sistema
-- (POST /auth/senha). `perfil`: 'admin' (gerencia usuários e o monitoramento)
-- e 'operador' (cadastra veículos). Sem eixo de organização por centro/unidade
-- neste MVP — qualquer Operador cadastra para qualquer destino.
CREATE TABLE IF NOT EXISTS usuarios (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  nome           VARCHAR(120) NOT NULL,
  email          VARCHAR(160) NOT NULL UNIQUE,
  senha_hash     VARCHAR(255) NOT NULL,
  perfil         ENUM('operador', 'admin') NOT NULL DEFAULT 'operador',
  ultimo_login   DATETIME,
  senha_definida TINYINT(1) NOT NULL DEFAULT 0,
  ativo          TINYINT(1) NOT NULL DEFAULT 1,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Sessões: autoridade de sessão (o `sid` do JWT aponta para esta linha e o
-- middleware `authenticate` a consulta a cada requisição). `encerrada_em`
-- preenchida = sessão revogada (logout, troca ou reset de senha) → o token
-- correspondente para de valer na hora, mesmo dentro da validade do JWT.
CREATE TABLE IF NOT EXISTS sessoes (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id   INT NOT NULL,
  inicio       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultimo_visto TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  encerrada_em DATETIME NULL,
  CONSTRAINT fk_sessoes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  INDEX idx_sessoes_usuario_abertas (usuario_id, encerrada_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Uma linha por reset de senha executado pelo Admin sobre um Operador.
-- Sem PII além dos ids; a senha temporária gerada NUNCA é persistida em texto
-- puro, só devolvida uma vez na resposta da API. FKs em SET NULL (não CASCADE):
-- excluir um usuário não pode apagar o registro de que um reset aconteceu.
CREATE TABLE IF NOT EXISTS reset_senha_log (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id    INT NULL,
  executado_por INT NULL,
  criado_em     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reset_usuario  FOREIGN KEY (usuario_id)    REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_reset_executor FOREIGN KEY (executado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Cadastro central do DVA. `chassi` é o identificador único do veículo — não
-- permite dois cadastros para o mesmo veículo (é o que ele sai de lá para a
-- concessionária: o mesmo chassi não pode voltar a entrar).
-- `protocolo` é gerado no servidor a cada cadastro (AAAA + MMDD + 4
-- caracteres aleatórios, ex. 20260810X7K2) — um recibo curto e único da
-- operação, devolvido ao operador na hora e reexibido no monitoramento; é
-- gerado pelo backend, nunca aceito do cliente (ver veiculos.service.ts).
-- `marca_id`/`modelo_id` referenciam vehicle_brands/vehicle_models do banco
-- ANTIGO (painel_procar), sem FK (cross-database) — ver nota no topo do
-- arquivo. `modelo_id` é opcional: o cadastro não pode travar se a marca
-- escolhida tiver pouca cobertura de modelos na base FIPE.
CREATE TABLE IF NOT EXISTS veiculos (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  chassi       VARCHAR(32) NOT NULL,
  protocolo    VARCHAR(12) NOT NULL,
  marca_id     INT NOT NULL,
  modelo_id    INT NULL,
  destino      VARCHAR(160) NULL,
  observacoes  TEXT NULL,
  video_path   VARCHAR(255) NULL,
  usuario_id   INT NOT NULL,
  criado_em    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_veiculos_chassi     UNIQUE (chassi),
  CONSTRAINT uq_veiculos_protocolo  UNIQUE (protocolo),
  CONSTRAINT fk_veiculos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  INDEX idx_veiculos_criado (criado_em),
  INDEX idx_veiculos_marca  (marca_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS veiculo_fotos (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  veiculo_id BIGINT NOT NULL,
  caminho    VARCHAR(255) NOT NULL,
  ordem      INT NOT NULL DEFAULT 0,
  criado_em  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_veiculo_fotos_veiculo FOREIGN KEY (veiculo_id)
    REFERENCES veiculos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
