// Cria o banco do DVA (se não existir), aplica o schema e semeia os dados
// iniciais (admin, centros de distribuição, operadores de exemplo, cores).
// O banco antigo do Guia PROCAR NÃO é tocado por este script.
// Uso: npm run db:setup
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';
// De shared/ (não do módulo usuarios): evita carregar o pool de conexões da
// aplicação dentro do script de setup, que usa a própria conexão.
import { gerarSenhaTemporaria } from '../shared/senha.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Cores semeadas — catálogo básico, sem o texto de venda que existia no Guia.
const CORES_SEED: Array<[nome: string, hex: string, ordem: number]> = [
  ['Preto', '#1a1a1a', 1],
  ['Branco', '#f5f5f5', 2],
  ['Prata', '#c7c9cc', 3],
  ['Cinza', '#6b6f76', 4],
  ['Vermelho', '#b0201f', 5],
  ['Azul', '#1f4fb0', 6],
  ['Verde', '#1f7a3f', 7],
  ['Amarelo', '#e0b400', 8],
];

// Um centro de distribuição + um operador por usuário de exemplo pedido pelo
// cliente. Nomes de centro são PLACEHOLDER (sem correspondência com praças
// reais) — editáveis depois pela tela /centros.
const OPERADORES_SEED: Array<{ centro: string; nome: string; email: string }> = [
  { centro: 'Centro de Distribuição Norte', nome: 'Luciano', email: 'teste1@teste.com' },
  { centro: 'Centro de Distribuição Sul', nome: 'Claudinei', email: 'teste2@teste.com' },
  { centro: 'Centro de Distribuição Leste', nome: 'Bruno', email: 'teste3@teste.com' },
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
  console.log(`✔ Schema aplicado em \`${env.db.database}\`.`);

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

  // Seed: cores.
  for (const [nome, hex, ordem] of CORES_SEED) {
    await root.query('INSERT IGNORE INTO cores (nome, hex, ordem) VALUES (?, ?, ?)', [nome, hex, ordem]);
  }
  console.log(`✔ ${CORES_SEED.length} cores semeadas (idempotente).`);

  // Seed: centros de distribuição + operadores de exemplo — material de
  // DESENVOLVIMENTO/demonstração. Em produção não são criados: o Admin
  // cadastra os operadores e centros pelas telas /usuarios e /centros.
  if (env.isProd) {
    console.log('• Centros e operadores de exemplo não são semeados em produção (crie-os em /usuarios e /centros).');
  } else {
    for (const { centro, nome, email } of OPERADORES_SEED) {
      await root.query('INSERT IGNORE INTO centros_distribuicao (nome) VALUES (?)', [centro]);
      const [[centroRow]] = await root.query<mysql.RowDataPacket[]>(
        'SELECT id FROM centros_distribuicao WHERE nome = ?',
        [centro],
      );
      const centroId = centroRow.id as number;

      const [existentes] = await root.query('SELECT id FROM usuarios WHERE email = ?', [email]);
      if ((existentes as unknown[]).length === 0) {
        // Senha ALEATÓRIA por conta (nunca um valor compartilhado) e
        // senha_definida = 0: o primeiro acesso obriga a trocá-la.
        const senhaTemp = gerarSenhaTemporaria();
        await root.query(
          'INSERT INTO usuarios (nome, email, senha_hash, perfil, centro_distribuicao_id, senha_definida) VALUES (?, ?, ?, ?, ?, 0)',
          [nome, email, await bcrypt.hash(senhaTemp, 12), 'operador', centroId],
        );
        console.log(`✔ Operador criado: ${nome} <${email}> / ${senhaTemp} — ${centro}`);
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
