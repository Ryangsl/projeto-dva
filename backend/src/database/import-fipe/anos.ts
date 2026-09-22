// Importa os anos disponíveis de cada modelo já cadastrado (vehicle_years),
// via FIPE v2. Passo 2 da importação: depende de `import:fipe:marcas` já ter
// rodado. Retomável — só processa modelos com years_imported = 0 e marca a
// flag ao concluir cada um, então parar (ex.: limite diário 429 da API) e
// rodar de novo é seguro. Manual/ocasional — não roda no boot do servidor nem
// no db:setup.
// Uso: npm run import:fipe:anos
import type { RowDataPacket } from 'mysql2';
import { pool } from '../../config/database.js';
import { env } from '../../config/env.js';
import { fipeGet, FipeHttpError, obterFipeSubscriptionToken, sleep } from './fipe-client.js';

interface FipeAno {
  code: string;
  name: string;
}

interface ModeloPendente extends RowDataPacket {
  id: number;
  name: string;
  fipe_model_id: string;
  fipe_brand_id: string;
}

// vehicle_models/vehicle_years vivem no banco ANTIGO (`painel_procar`), não no
// do DVA — mesmo padrão de qualificação cross-database de marcas-modelos.ts.
const VDB = env.db.vehiclesDatabase;

async function main(): Promise<void> {
  console.log('\n========================================');
  console.log('IMPORTAÇÃO DE ANOS (FIPE v2)');
  console.log('========================================\n');

  if (!obterFipeSubscriptionToken()) {
    console.log(
      'ℹ️  FIPE_SUBSCRIPTION_TOKEN não configurado — seguindo sem token ' +
        '(limite de 500 requisições/dia, contra milhares de modelos: espere ' +
        'precisar de várias execuções em dias diferentes).\n',
    );
  }

  const [modelos] = await pool.query<ModeloPendente[]>(
    `SELECT vm.id, vm.name, vm.fipe_model_id, vb.fipe_brand_id
     FROM \`${VDB}\`.vehicle_models vm
     INNER JOIN \`${VDB}\`.vehicle_brands vb ON vb.id = vm.brand_id
     WHERE vm.years_imported = 0
     ORDER BY vm.id`,
  );

  console.log(`Modelos pendentes: ${modelos.length}\n`);

  for (let i = 0; i < modelos.length; i++) {
    const modelo = modelos[i];
    console.log(`[${i + 1}/${modelos.length}] ${modelo.name}`);

    try {
      await sleep(200);

      const anos = await fipeGet<FipeAno[]>(
        `/brands/${modelo.fipe_brand_id}/models/${modelo.fipe_model_id}/years`,
      );

      for (const ano of anos) {
        await pool.query(
          `INSERT IGNORE INTO \`${VDB}\`.vehicle_years (model_id, fipe_year_code, year_name) VALUES (?, ?, ?)`,
          [modelo.id, ano.code, ano.name],
        );
      }

      await pool.query(`UPDATE \`${VDB}\`.vehicle_models SET years_imported = 1 WHERE id = ?`, [modelo.id]);

      console.log(`   ✔ ${anos.length} anos importados`);
    } catch (erro) {
      if (erro instanceof FipeHttpError && erro.status === 429) {
        console.log('\n========================================');
        console.log('LIMITE DA API ATINGIDO');
        console.log('========================================');
        console.log('Execute novamente mais tarde. O script continuará de onde parou.');
        break;
      }
      console.log(`   ✖ ${(erro as Error).message}`);
    }
  }

  await pool.end();

  console.log('\n========================================');
  console.log('PROCESSO FINALIZADO');
  console.log('========================================');
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
