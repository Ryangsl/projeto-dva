// Cria o banco do DVA (se não existir), aplica o schema e semeia os dados
// iniciais (admin + operadores de exemplo).
// O banco antigo do Guia PROCAR NÃO é tocado por este script.
// Uso: npm run db:setup
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';
import { gerarProtocolo } from '../shared/protocolo.js';
// De shared/ (não do módulo usuarios): evita carregar o pool de conexões da
// aplicação dentro do script de setup, que usa a própria conexão.
import { gerarSenhaTemporaria } from '../shared/senha.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Adiciona uma coluna se ainda não existir — migração leve para bancos já
// criados antes da coluna entrar no schema.sql (ex.: quem já tinha rodado
// db:setup e cadastrado veículos antes do protocolo existir).
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

// Remove uma coluna (e qualquer FK que aponte a partir dela) se ela ainda
// existir — migração de bancos que já tinham `cor_id`/`centro_distribuicao_id`
// de uma versão anterior do MVP (Cor e Centro de Distribuição foram removidos
// do produto). A FK precisa sair antes da coluna, senão o MySQL recusa o DROP.
async function removerColunaSeExistir(
  conn: mysql.Connection,
  tabela: string,
  coluna: string,
): Promise<void> {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = ? AND table_name = ? AND column_name = ?`,
    [env.db.database, tabela, coluna],
  );
  if ((rows as unknown[]).length === 0) return;

  const [fks] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT DISTINCT CONSTRAINT_NAME AS nome FROM information_schema.key_column_usage
     WHERE table_schema = ? AND table_name = ? AND column_name = ? AND referenced_table_name IS NOT NULL`,
    [env.db.database, tabela, coluna],
  );
  for (const fk of fks as { nome: string }[]) {
    await conn.query(`ALTER TABLE \`${tabela}\` DROP FOREIGN KEY \`${fk.nome}\``);
  }
  await conn.query(`ALTER TABLE \`${tabela}\` DROP COLUMN \`${coluna}\``);
  console.log(`✔ Coluna ${tabela}.${coluna} removida (recurso descontinuado).`);
}

// Veículos cadastrados antes do protocolo existir (bancos de desenvolvimento
// já em uso) precisam de um valor de backfill único antes da coluna virar
// NOT NULL + UNIQUE. Volume é sempre pequeno (dados de teste), então um
// retry simples em caso de colisão (extremamente improvável) é suficiente.
async function preencherProtocolosFaltantes(conn: mysql.Connection): Promise<void> {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    'SELECT id, criado_em FROM veiculos WHERE protocolo IS NULL OR protocolo = ?',
    [''],
  );
  const pendentes = rows as { id: number; criado_em: string }[];
  for (const v of pendentes) {
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      const protocolo = gerarProtocolo(new Date(v.criado_em));
      try {
        await conn.query('UPDATE veiculos SET protocolo = ? WHERE id = ?', [protocolo, v.id]);
        break;
      } catch (err) {
        if (!isDuplicateEntry(err) || tentativa === 4) throw err;
      }
    }
  }
  if (pendentes.length > 0) {
    console.log(`✔ Protocolo preenchido para ${pendentes.length} veículo(s) já cadastrado(s).`);
  }
}

function isDuplicateEntry(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ER_DUP_ENTRY';
}

// Usuários de exemplo pedidos pelo cliente.
const OPERADORES_SEED: Array<{ nome: string; email: string }> = [
  { nome: 'Luciano', email: 'teste1@teste.com' },
  { nome: 'Claudinei', email: 'teste2@teste.com' },
  { nome: 'Bruno', email: 'teste3@teste.com' },
];

// Senha inicial do Admin. Em produção é OBRIGATÓRIO fornecê-la pelo ambiente —
// nunca embutimos um valor padrão, porque uma senha publicada no repositório
// vira credencial universal de acesso total. Em desenvolvimento, geramos uma
// aleatória (o primeiro acesso força a troca de qualquer forma).
function senhaInicialAdmin(): string {
  if (env.adminSenhaInicial) return env.adminSenhaInicial;
  if (env.isProd) {
    throw new Error(
      'ADMIN_SENHA_INICIAL é obrigatória em produção: defina uma senha forte no .env antes de rodar o db:setup.',
    );
  }
  return gerarSenhaTemporaria();
}

// Catálogo de marca/modelo (dados vindos da FIPE, populados por
// `import:fipe:marcas`) vive no banco ANTIGO (`env.db.vehiclesDatabase`,
// `painel_procar`), não no do DVA — ver nota no topo do schema.sql. Em
// produção essas tabelas já existem lá (o projeto anterior as criou e
// populou); num ambiente novo/local, porém, `painel_procar` pode nem existir
// ainda. `CREATE ... IF NOT EXISTS` aqui é puramente aditivo — nunca altera
// nem apaga nada que já esteja no banco antigo, só garante que as duas
// tabelas de que este projeto depende existam antes do primeiro
// `import:fipe:marcas`. Definição idêntica à documentada em
// IMPORTACAO-FIPE.md §4 (mantenha as duas em sincronia se mudar uma).
async function garantirTabelasVeiculosFipe(conexao: {
  host: string;
  port: number;
  user: string;
  password: string;
}): Promise<void> {
  const root = await mysql.createConnection({ ...conexao, multipleStatements: true });

  await root.query(
    `CREATE DATABASE IF NOT EXISTS \`${env.db.vehiclesDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
  );
  await root.changeUser({ database: env.db.vehiclesDatabase });

  await root.query(`
    CREATE TABLE IF NOT EXISTS vehicle_brands (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      fipe_brand_id VARCHAR(20) NOT NULL,
      name          VARCHAR(120) NOT NULL,
      UNIQUE KEY uq_vehicle_brands_fipe (fipe_brand_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await root.query(`
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
  `);
  console.log(`✔ Tabelas vehicle_brands/vehicle_models garantidas em \`${env.db.vehiclesDatabase}\`.`);

  await root.end();
}

async function run(): Promise<void> {
  const credenciais = { host: env.db.host, port: env.db.port, user: env.db.user, password: env.db.password };

  await garantirTabelasVeiculosFipe(credenciais);

  // Conexão sem database selecionada para poder criá-la.
  const root = await mysql.createConnection({ ...credenciais, multipleStatements: true });

  await root.query(
    `CREATE DATABASE IF NOT EXISTS \`${env.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
  );
  await root.changeUser({ database: env.db.database });

  const schema = await readFile(join(__dirname, 'schema.sql'), 'utf8');
  await root.query(schema);
  console.log(`✔ Schema aplicado em \`${env.db.database}\`.`);

  // Migração leve: bancos que já tinham `veiculos` antes do protocolo existir
  // (cadastros de teste feitos antes desta versão) ganham a coluna, um
  // backfill único por linha e só então a restrição NOT NULL + UNIQUE — nessa
  // ordem, para nunca haver uma janela em que uma linha exista sem valor
  // numa coluna já obrigatória.
  const protocoloColunaCriada = await garantirColuna(root, 'veiculos', 'protocolo', 'VARCHAR(12) NULL AFTER chassi');
  await preencherProtocolosFaltantes(root);
  if (protocoloColunaCriada) {
    await root.query('ALTER TABLE veiculos MODIFY COLUMN protocolo VARCHAR(12) NOT NULL');
  }
  await garantirIndice(root, 'veiculos', 'uq_veiculos_protocolo', 'UNIQUE KEY uq_veiculos_protocolo (protocolo)');

  // Migração: Cor e Centro de Distribuição saíram do produto (não fazem
  // sentido para o fluxo do DVA) — bancos de desenvolvimento que já tinham
  // essas colunas/tabelas de uma versão anterior são limpos aqui.
  await removerColunaSeExistir(root, 'veiculos', 'cor_id');
  await removerColunaSeExistir(root, 'veiculos', 'centro_distribuicao_id');
  await removerColunaSeExistir(root, 'usuarios', 'centro_distribuicao_id');
  await root.query('DROP TABLE IF EXISTS cores, centros_distribuicao');

  // Seed: usuário Admin. Nasce com senha_definida = 0, como qualquer outro
  // perfil: o primeiro acesso obriga a definir uma senha própria.
  const emailAdmin = 'admin@dva.com.br';
  const [adminExistente] = await root.query('SELECT id FROM usuarios WHERE email = ?', [emailAdmin]);
  if ((adminExistente as unknown[]).length === 0) {
    const senhaAdmin = senhaInicialAdmin();
    await root.query(
      'INSERT INTO usuarios (nome, email, senha_hash, perfil, senha_definida) VALUES (?, ?, ?, ?, 0)',
      ['Administrador', emailAdmin, await bcrypt.hash(senhaAdmin, 12), 'admin'],
    );
    if (env.isProd) {
      console.log(`✔ Usuário admin criado: ${emailAdmin} (senha definida via ADMIN_SENHA_INICIAL).`);
      console.log('  Troque-a no primeiro acesso — o sistema vai exigir.');
    } else {
      console.log(`✔ Usuário admin criado: ${emailAdmin} / ${senhaAdmin}`);
    }
  } else {
    console.log('• Usuário admin já existe, seed ignorado.');
  }

  // Seed: operadores de exemplo — material de DESENVOLVIMENTO/demonstração.
  // Em produção não são criados: o Admin cadastra os operadores pela tela
  // /usuarios, que já gera senha aleatória individual.
  if (env.isProd) {
    console.log('• Operadores de exemplo não são semeados em produção (crie-os em /usuarios).');
  } else {
    for (const { nome, email } of OPERADORES_SEED) {
      const [existentes] = await root.query('SELECT id FROM usuarios WHERE email = ?', [email]);
      if ((existentes as unknown[]).length === 0) {
        // Senha ALEATÓRIA por conta (nunca um valor compartilhado) e
        // senha_definida = 0: o primeiro acesso obriga a trocá-la.
        const senhaTemp = gerarSenhaTemporaria();
        await root.query(
          'INSERT INTO usuarios (nome, email, senha_hash, perfil, senha_definida) VALUES (?, ?, ?, ?, 0)',
          [nome, email, await bcrypt.hash(senhaTemp, 12), 'operador'],
        );
        console.log(`✔ Operador criado: ${nome} <${email}> / ${senhaTemp}`);
      }
    }
  }

  await root.end();
  console.log('✔ Setup concluído.');
}

run().catch((err) => {
  console.error('✖ Falha no setup do banco:', err);
  process.exit(1);
});
