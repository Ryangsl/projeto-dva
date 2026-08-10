// Importa os anos disponíveis de cada modelo já cadastrado (vehicle_years).
// Passo 2 da importação: depende de `import:fipe:marcas` já ter rodado.
// Retomável — só processa modelos com years_imported = 0 e marca a flag ao
// concluir cada um, então parar (ex.: limite 429 da API) e rodar de novo é
// seguro. Manual/ocasional — não roda no boot do servidor nem no db:setup.
// Uso: npm run import:fipe:anos
import type { RowDataPacket } from 'mysql2';
import { pool } from '../../config/database.js';
import { exigirFipeApiKey, fipeGet, FipeHttpError, sleep } from './fipe-client.js';

interface FipeAno {
  codigo: string;
  nome: string;
}

interface ModeloPendente extends RowDataPacket {
  id: number;
  name: string;
  fipe_model_id: string;
  fipe_brand_id: string;
}

async function main(): Promise<void> {
  exigirFipeApiKey();

  console.log('\n========================================');
  console.log('IMPORTAÇÃO DE ANOS');
  console.log('========================================\n');

  const [modelos] = await pool.query<ModeloPendente[]>(
    `SELECT vm.id, vm.name, vm.fipe_model_id, vb.fipe_brand_id
     FROM vehicle_models vm
     INNER JOIN vehicle_brands vb ON vb.id = vm.brand_id
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
        `/marcas/${modelo.fipe_brand_id}/modelos/${modelo.fipe_model_id}/anos`,
      );

      for (const ano of anos) {
        await pool.execute(
          'INSERT IGNORE INTO vehicle_years (model_id, fipe_year_code, year_name) VALUES (?, ?, ?)',
          [modelo.id, ano.codigo, ano.nome],
        );
      }

      await pool.execute('UPDATE vehicle_models SET years_imported = 1 WHERE id = ?', [modelo.id]);

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
