// Importa marcas e modelos da API da FIPE (v2) para vehicle_brands/vehicle_models.
// Passo 1 da importação (o script de anos depende dos modelos já existirem).
// Manual/ocasional — não roda no boot do servidor nem no db:setup.
//
// Importa TODAS as marcas/modelos que a FIPE devolve, sem filtrar pelas 7
// marcas do grupo (`MARCAS_DVA`, em `modules/veiculos/marcas-dva.ts`) — esse
// filtro é só de EXIBIÇÃO, aplicado em `veiculos.service.ts` na hora de
// montar o formulário de cadastro. Manter o catálogo completo aqui evita
// reimportar do zero se o grupo passar a vender outra marca no futuro.
//
// Uso: npm run import:fipe:marcas
import type { RowDataPacket } from 'mysql2';
import { pool } from '../../config/database.js';
import { env } from '../../config/env.js';
import { fipeGet, obterFipeSubscriptionToken } from './fipe-client.js';

interface FipeMarca {
  code: string;
  name: string;
}

interface FipeModelo {
  code: string;
  name: string;
}

// vehicle_brands/vehicle_models vivem no banco ANTIGO (`painel_procar`), não
// no do DVA — o `pool` compartilhado (config/database.ts) conecta em
// `env.db.database` por padrão. Mesmo padrão de qualificação cross-database
// já usado em `modules/veiculos/veiculos.service.ts` (valor só de `env`,
// nunca de input — não é injeção).
const VDB = env.db.vehiclesDatabase;

async function main(): Promise<void> {
  console.log('\n========================================');
  console.log('IMPORTAÇÃO DE MARCAS E MODELOS (FIPE v2)');
  console.log('========================================\n');

  if (!obterFipeSubscriptionToken()) {
    console.log(
      'ℹ️  FIPE_SUBSCRIPTION_TOKEN não configurado — seguindo sem token ' +
        '(limite de 500 requisições/dia). Ver IMPORTACAO-FIPE.md.\n',
    );
  }

  const marcas = await fipeGet<FipeMarca[]>('/brands');
  console.log(`Total de marcas encontradas: ${marcas.length}\n`);

  let totalModelos = 0;

  for (let i = 0; i < marcas.length; i++) {
    const marca = marcas[i];
    console.log(`[${i + 1}/${marcas.length}] ${marca.name}`);

    try {
      await pool.query(
        `INSERT IGNORE INTO \`${VDB}\`.vehicle_brands (fipe_brand_id, name) VALUES (?, ?)`,
        [marca.code, marca.name],
      );

      const [linhas] = await pool.query<RowDataPacket[]>(
        `SELECT id FROM \`${VDB}\`.vehicle_brands WHERE fipe_brand_id = ?`,
        [marca.code],
      );
      const marcaId = linhas[0].id as number;

      const modelos = await fipeGet<FipeModelo[]>(`/brands/${marca.code}/models`);
      console.log(`   ${modelos.length} modelos`);

      for (const modelo of modelos) {
        await pool.query(
          `INSERT IGNORE INTO \`${VDB}\`.vehicle_models (brand_id, fipe_model_id, name) VALUES (?, ?, ?)`,
          [marcaId, modelo.code, modelo.name],
        );
        totalModelos++;
      }
    } catch (erro) {
      console.log(`   ✖ Erro na marca ${marca.name}: ${(erro as Error).message}`);
    }
  }

  await pool.end();

  console.log('\n========================================');
  console.log('IMPORTAÇÃO FINALIZADA');
  console.log('========================================');
  console.log(`Marcas: ${marcas.length}`);
  console.log(`Modelos importados: ${totalModelos}`);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
