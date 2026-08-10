// Cria o banco (se não existir), aplica o schema e faz o seed do usuário gestor inicial.
// Uso: npm run db:setup
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';
import { seedGuia } from './seed-guia.js';
import { MARCAS_PRINCIPAIS } from '../modules/guia/marcas-principais.js';
// De shared/ (não do módulo usuarios): evita carregar o pool de conexões da
// aplicação dentro do script de setup, que usa a própria conexão.
import { gerarSenhaTemporaria } from '../shared/senha.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Adiciona uma coluna se ainda não existir (migração leve para bancos já
// criados antes da coluna entrar no schema.sql).
async function garantirColuna(
  conn: mysql.Connection,
  tabela: string,
  coluna: string,
  definicao: string,
): Promise<boolean> {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = ? AND table_name = ? AND column_name = ?`,
    [env.db.database, tabela, coluna],
  );
  if ((rows as unknown[]).length === 0) {
    await conn.query(`ALTER TABLE \`${tabela}\` ADD COLUMN ${coluna} ${definicao}`);
    console.log(`✔ Coluna ${tabela}.${coluna} adicionada.`);
    return true;
  }
  return false;
}

// Garante um índice, criando-o só se ainda não existir (migração leve).
async function garantirIndice(
  conn: mysql.Connection,
  tabela: string,
  indice: string,
  definicao: string,
): Promise<boolean> {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.statistics
     WHERE table_schema = ? AND table_name = ? AND index_name = ?`,
    [env.db.database, tabela, indice],
  );
  if ((rows as unknown[]).length === 0) {
    await conn.query(`ALTER TABLE \`${tabela}\` ADD ${definicao}`);
    console.log(`✔ Índice ${tabela}.${indice} criado.`);
    return true;
  }
  return false;
}

// E-mail de teste da concessionária: 'VW - VolksWagen' → volkswagen@procar.com.br
function emailDaMarca(marca: string): string {
  return `${marca.toLowerCase().replace(/[^a-z0-9]/g, '')}@procar.com.br`;
}

// Senha inicial do Admin (TI). Em produção é OBRIGATÓRIO fornecê-la pelo
// ambiente — nunca embutimos um valor padrão, porque uma senha publicada no
// repositório vira credencial universal de acesso total. Em desenvolvimento,
// geramos uma aleatória (o primeiro acesso força a troca de qualquer forma).
function senhaInicialAdmin(): string {
  if (env.adminSenhaInicial) return env.adminSenhaInicial;
  if (env.isProd) {
    throw new Error(
      'ADMIN_SENHA_INICIAL é obrigatória em produção: defina uma senha forte no .env antes de rodar o db:setup.',
    );
  }
  return gerarSenhaTemporaria();
}

async function run(): Promise<void> {
  // Conexão sem database selecionada para poder criá-la.
  const root = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    multipleStatements: true,
  });

  await root.query(
    `CREATE DATABASE IF NOT EXISTS \`${env.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
  );
  await root.changeUser({ database: env.db.database });

  const schema = await readFile(join(__dirname, 'schema.sql'), 'utf8');
  await root.query(schema);
  console.log('✔ Schema aplicado.');

  // Migrações leves (bancos criados antes destas colunas existirem).
  await garantirColuna(root, 'usuarios', 'marca', 'VARCHAR(60) NULL AFTER perfil');
  await garantirColuna(root, 'usuarios', 'ultimo_login', 'DATETIME NULL AFTER marca');
  // Primeiro acesso: 1 = senha já trocada pelo usuário; 0 = ainda é a temporária.
  // Coluna nasce com DEFAULT 0 (igual ao schema.sql) para que novos usuários
  // sejam obrigados a definir a senha. Ao MIGRAR um banco já em uso, os usuários
  // existentes (que já têm senha em uso) são marcados como definida (1) uma única
  // vez, para não forçar troca retroativa. Os semeados abaixo nascem com 0.
  const senhaDefinidaCriada = await garantirColuna(
    root,
    'usuarios',
    'senha_definida',
    'TINYINT(1) NOT NULL DEFAULT 0 AFTER ultimo_login',
  );
  if (senhaDefinidaCriada) {
    // Usuários reais já têm senha própria em uso — marcá-los como definida
    // evita forçar troca retroativa. As contas SEMEADAS, porém, ainda usam a
    // senha do seed: se entrassem nesse backfill, virariam contas permanentes
    // com senha conhecida. Elas ficam de fora e continuam obrigadas ao
    // primeiro acesso.
    const emailsSemeados = MARCAS_PRINCIPAIS.map(emailDaMarca);
    await root.query('UPDATE usuarios SET senha_definida = 1 WHERE email NOT IN (?)', [
      emailsSemeados,
    ]);
    console.log('✔ Usuários existentes marcados como senha já definida (contas semeadas excluídas).');
  }
  // Perfil Admin (TI): separado do Gestor para o gerenciamento de usuários
  // por loja. Só altera o enum se 'admin' ainda não existir (idempotente).
  const [[perfilCol]] = await root.query<mysql.RowDataPacket[]>(
    `SELECT COLUMN_TYPE AS tipo FROM information_schema.columns
     WHERE table_schema = ? AND table_name = 'usuarios' AND column_name = 'perfil'`,
    [env.db.database],
  );
  if (perfilCol && !String(perfilCol.tipo).includes("'admin'")) {
    await root.query(
      "ALTER TABLE usuarios MODIFY COLUMN perfil ENUM('consultor','gestor','admin') NOT NULL DEFAULT 'consultor'",
    );
    console.log('✔ Coluna usuarios.perfil ampliada com o perfil admin.');
  }
  // Múltiplas lojas por Gestor: migra qualquer gestor legado que ainda tenha
  // `usuarios.marca` preenchida (do modelo antigo, uma loja só) para a nova
  // tabela `usuario_marcas`, depois limpa a coluna antiga (fica só p/ consultor).
  const [gestoresComMarcaLegada] = await root.query<mysql.RowDataPacket[]>(
    "SELECT id, marca FROM usuarios WHERE perfil = 'gestor' AND marca IS NOT NULL",
  );
  for (const g of gestoresComMarcaLegada as { id: number; marca: string }[]) {
    await root.query('INSERT IGNORE INTO usuario_marcas (usuario_id, marca) VALUES (?, ?)', [
      g.id,
      g.marca,
    ]);
  }
  if ((gestoresComMarcaLegada as unknown[]).length > 0) {
    await root.query("UPDATE usuarios SET marca = NULL WHERE perfil = 'gestor'");
    console.log(
      `✔ ${(gestoresComMarcaLegada as unknown[]).length} gestor(es) migrado(s) para usuario_marcas (múltiplas lojas).`,
    );
  }

  await garantirColuna(root, 'regras', 'banco', "ENUM('tecido','couro') NULL AFTER modelo_id");
  // Manual de Vendas: roteiro/regras por setor e canal, argumento por cor.
  await garantirColuna(root, 'regras', 'setor', 'VARCHAR(40) NULL AFTER banco');
  await garantirColuna(root, 'roteiro_etapas', 'setor', 'VARCHAR(40) NULL AFTER ordem');
  await garantirColuna(root, 'roteiro_etapas', 'canal', "ENUM('presencial','telefone') NULL AFTER setor");
  await garantirColuna(root, 'roteiro_etapas', 'banco', "ENUM('tecido','couro') NULL AFTER canal");
  await garantirColuna(root, 'cores', 'argumento', 'TEXT NULL AFTER hex');
  // instrucao era VARCHAR(255); os roteiros do manual têm instruções longas.
  await root.query('ALTER TABLE roteiro_etapas MODIFY COLUMN instrucao TEXT NOT NULL');

  // Revogação de sessão: `encerrada_em` permite invalidar um token antes de ele
  // expirar (logout, troca e reset de senha). Sessões antigas ficam NULL, ou
  // seja, continuam válidas — a migração não desloga ninguém.
  await garantirColuna(root, 'sessoes', 'encerrada_em', 'DATETIME NULL AFTER ultimo_visto');
  await garantirIndice(
    root,
    'sessoes',
    'idx_sessoes_usuario_abertas',
    'INDEX idx_sessoes_usuario_abertas (usuario_id, encerrada_em)',
  );

  // Unicidade do atendimento passa a ser (usuario_id, uuid): com o uuid vindo
  // do cliente, a chave global permitia que a requisição de um usuário casasse
  // no ON DUPLICATE KEY da linha de outro.
  //
  // Ordem importa: primeiro garantimos a chave nova, só depois removemos a
  // antiga — a tabela nunca fica sem proteção de duplicidade. A remoção é
  // avaliada a CADA execução (e não só quando a chave nova acabou de ser
  // criada), senão uma execução interrompida no meio deixaria o índice antigo
  // para sempre.
  const CHAVE_ATENDIMENTO = 'uk_atendimentos_usuario_uuid';
  await garantirIndice(
    root,
    'atendimentos',
    CHAVE_ATENDIMENTO,
    `UNIQUE KEY ${CHAVE_ATENDIMENTO} (usuario_id, uuid)`,
  );

  // Auditoria de reset resiste à exclusão do usuário: as FKs passam de CASCADE
  // para SET NULL (e as colunas viram NULL). Com CASCADE, excluir o executor —
  // ou a própria vítima — apagaria a evidência de que o reset aconteceu, o que
  // anularia o propósito do log.
  const [fksReset] = await root.query<mysql.RowDataPacket[]>(
    `SELECT CONSTRAINT_NAME AS nome, DELETE_RULE AS regra
       FROM information_schema.referential_constraints
      WHERE constraint_schema = ? AND table_name = 'reset_senha_log'`,
    [env.db.database],
  );
  const fksEmCascata = (fksReset as { nome: string; regra: string }[]).filter(
    (f) => f.regra !== 'SET NULL',
  );
  if (fksEmCascata.length > 0) {
    // Remove as FKs antes de alterar as colunas (o MySQL não permite tornar
    // nulável uma coluna referenciada por uma FK CASCADE em algumas versões).
    for (const fk of fksEmCascata) {
      await root.query(`ALTER TABLE reset_senha_log DROP FOREIGN KEY \`${fk.nome}\``);
    }
    await root.query('ALTER TABLE reset_senha_log MODIFY COLUMN usuario_id INT NULL');
    await root.query('ALTER TABLE reset_senha_log MODIFY COLUMN executado_por INT NULL');
    await root.query(
      `ALTER TABLE reset_senha_log
         ADD CONSTRAINT fk_reset_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
         ADD CONSTRAINT fk_reset_executor FOREIGN KEY (executado_por) REFERENCES usuarios(id) ON DELETE SET NULL`,
    );
    console.log('✔ reset_senha_log: FKs migradas para ON DELETE SET NULL (auditoria sobrevive à exclusão).');
  }

  // Aliases explícitos: no MySQL 8 as colunas de information_schema voltam em
  // MAIÚSCULAS, então ler `row.index_name` daria undefined.
  const [colunasDeIndice] = await root.query<mysql.RowDataPacket[]>(
    `SELECT INDEX_NAME AS nome, COLUMN_NAME AS coluna
       FROM information_schema.statistics
      WHERE table_schema = ? AND table_name = 'atendimentos'`,
    [env.db.database],
  );
  // Agrupa as colunas de cada índice para identificar com precisão os índices
  // de UMA coluna sobre `uuid` — sem arriscar remover a chave composta nova
  // (que também contém `uuid`) ou a PRIMARY.
  const colunasPorIndice = new Map<string, string[]>();
  for (const r of colunasDeIndice as { nome: string; coluna: string }[]) {
    colunasPorIndice.set(r.nome, [...(colunasPorIndice.get(r.nome) ?? []), r.coluna]);
  }
  for (const [nome, colunas] of colunasPorIndice) {
    const ehIndiceAntigoDeUuid =
      nome !== CHAVE_ATENDIMENTO && nome !== 'PRIMARY' && colunas.length === 1 && colunas[0] === 'uuid';
    if (ehIndiceAntigoDeUuid) {
      await root.query(`ALTER TABLE atendimentos DROP INDEX \`${nome}\``);
      console.log(`✔ Índice antigo atendimentos.${nome} removido (substituído pela chave composta).`);
    }
  }

  // Seed: usuário Admin (TI) inicial (marca NULL = vê todas as marcas). Nasce
  // com senha_definida = 0, como qualquer outro perfil: o primeiro acesso
  // obriga a definir uma senha própria. Não há exceção — uma conta de acesso
  // total isenta da troca é o pior lugar possível para uma senha padrão.
  const email = 'admin@procar.com';
  const [rows] = await root.query('SELECT id FROM usuarios WHERE email = ?', [email]);
  if ((rows as unknown[]).length === 0) {
    const senhaAdmin = senhaInicialAdmin();
    await root.query(
      'INSERT INTO usuarios (nome, email, senha_hash, perfil, senha_definida) VALUES (?, ?, ?, ?, 0)',
      ['Administrador', email, await bcrypt.hash(senhaAdmin, 12), 'admin'],
    );
    if (env.isProd) {
      console.log(`✔ Usuário admin criado: ${email} (senha definida via ADMIN_SENHA_INICIAL).`);
      console.log('  Troque-a no primeiro acesso — o sistema vai exigir.');
    } else {
      console.log(`✔ Usuário admin criado: ${email} / ${senhaAdmin}`);
    }
  } else {
    // Bancos migrados de uma versão anterior tinham esse usuário como
    // 'gestor' — promove a 'admin'. NÃO mexemos em senha_definida aqui: quem
    // já trocou a senha continua como está; quem não trocou continua obrigado.
    const [promovido] = await root.query<mysql.ResultSetHeader>(
      "UPDATE usuarios SET perfil = 'admin' WHERE email = ? AND perfil <> 'admin'",
      [email],
    );
    if (promovido.affectedRows > 0) {
      console.log(`✔ Usuário ${email} promovido a admin (TI).`);
    } else {
      console.log('• Usuário admin já existe, seed ignorado.');
    }
  }

  // Seed: um usuário consultor por concessionária — material de DESENVOLVIMENTO.
  // Em produção não são criados: o Admin cadastra os consultores pela tela
  // /usuarios, que já gera senha aleatória individual e registra a ação.
  if (env.isProd) {
    console.log('• Contas de concessionária não são semeadas em produção (crie-as em /usuarios).');
  } else {
    for (const marca of MARCAS_PRINCIPAIS) {
      const emailMarca = emailDaMarca(marca);
      const [existentes] = await root.query('SELECT id FROM usuarios WHERE email = ?', [emailMarca]);
      if ((existentes as unknown[]).length === 0) {
        // Senha ALEATÓRIA por conta (nunca um valor compartilhado) e
        // senha_definida = 0: o primeiro acesso obriga a trocá-la.
        const senhaTemp = gerarSenhaTemporaria();
        await root.query(
          'INSERT INTO usuarios (nome, email, senha_hash, perfil, marca, senha_definida) VALUES (?, ?, ?, ?, ?, 0)',
          [`Concessionária ${marca}`, emailMarca, await bcrypt.hash(senhaTemp, 12), 'consultor', marca],
        );
        console.log(`✔ Usuário da concessionária criado: ${emailMarca} / ${senhaTemp}`);
      }
    }
  }

  // Seed do conteúdo do Guia de Atendimento.
  await seedGuia(root);

  await root.end();
  console.log('✔ Setup concluído.');
}

run().catch((err) => {
  console.error('✖ Falha no setup do banco:', err);
  process.exit(1);
});
