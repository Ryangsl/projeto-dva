// Importa marcas e modelos da API da FIPE para vehicle_brands/vehicle_models.
// Passo 1 da importação (o script de anos depende dos modelos já existirem).
// Manual/ocasional — não roda no boot do servidor nem no db:setup.
// Uso: npm run import:fipe:marcas
import type { RowDataPacket } from 'mysql2';
import { pool } from '../../config/database.js';
import { exigirFipeApiKey, fipeGet } from './fipe-client.js';

interface FipeMarca {
  codigo: string;
  nome: string;
}

interface FipeModelo {
  codigo: number;
  nome: string;
}

interface FipeModelosResponse {
  modelos: FipeModelo[];
}

async function main(): Promise<void> {
  exigirFipeApiKey();

  console.log('\n========================================');
  console.log('IMPORTAÇÃO DE MARCAS E MODELOS');
  console.log('========================================\n');

  const marcas = await fipeGet<FipeMarca[]>('/marcas');
  console.log(`Total de marcas encontradas: ${marcas.length}\n`);

  let totalModelos = 0;

  for (let i = 0; i < marcas.length; i++) {
    const marca = marcas[i];
    console.log(`[${i + 1}/${marcas.length}] ${marca.nome}`);

    try {
      await pool.execute('INSERT IGNORE INTO vehicle_brands (fipe_brand_id, name) VALUES (?, ?)', [
        marca.codigo,
        marca.nome,
      ]);

      const [linhas] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM vehicle_brands WHERE fipe_brand_id = ?',
        [marca.codigo],
      );
      const marcaId = linhas[0].id as number;

      const { modelos } = await fipeGet<FipeModelosResponse>(`/marcas/${marca.codigo}/modelos`);
      console.log(`   ${modelos.length} modelos`);

      for (const modelo of modelos) {
        await pool.execute(
          'INSERT IGNORE INTO vehicle_models (brand_id, fipe_model_id, name) VALUES (?, ?, ?)',
          [marcaId, modelo.codigo, modelo.nome],
        );
        totalModelos++;
      }
    } catch (erro) {
      console.log(`   ✖ Erro na marca ${marca.nome}: ${(erro as Error).message}`);
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
