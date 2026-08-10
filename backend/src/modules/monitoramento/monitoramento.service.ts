import type { RowDataPacket } from 'mysql2';
import { pool } from '../../config/database.js';
import { env } from '../../config/env.js';

const VDB = env.db.vehiclesDatabase;

export interface ContagemPorGrupo {
  nome: string;
  total: number;
}

export interface PontoSerie {
  dia: string; // YYYY-MM-DD
  total: number;
}

export interface DashboardVeiculos {
  totalVeiculos: number;
  veiculosHoje: number;
  veiculosPeriodo: number;
  porCentro: ContagemPorGrupo[];
  porMarca: ContagemPorGrupo[];
  serieDiaria: PontoSerie[];
}

// YYYY-MM-DD a partir de hoje - offset dias (fuso do próprio servidor).
function diaOffset(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
}

// Preenche todo dia do período com 0 quando não há registro, para o gráfico
// não pular datas sem cadastro.
function montarSerie(dias: number, linhas: { dia: string; total: number }[]): PontoSerie[] {
  const porDia = new Map(linhas.map((l) => [l.dia, l.total]));
  const serie: PontoSerie[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    const dia = diaOffset(i);
    serie.push({ dia, total: porDia.get(dia) ?? 0 });
  }
  return serie;
}

export async function obterDashboard(dias: number): Promise<DashboardVeiculos> {
  const [
    [totalRows],
    [hojeRows],
    [periodoRows],
    [centroRows],
    [marcaRows],
    [serieRows],
  ] = await Promise.all([
    pool.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM veiculos'),
    pool.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM veiculos WHERE DATE(criado_em) = CURDATE()'),
    pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS total FROM veiculos WHERE criado_em >= (NOW() - INTERVAL ? DAY)',
      [dias],
    ),
    pool.query<RowDataPacket[]>(`
      SELECT cd.nome AS nome, COUNT(*) AS total
        FROM veiculos v
        JOIN centros_distribuicao cd ON cd.id = v.centro_distribuicao_id
       GROUP BY cd.id, cd.nome
       ORDER BY total DESC
    `),
    pool.query<RowDataPacket[]>(`
      SELECT b.name AS nome, COUNT(*) AS total
        FROM veiculos v
        JOIN \`${VDB}\`.vehicle_brands b ON b.id = v.marca_id
       GROUP BY b.id, b.name
       ORDER BY total DESC
    `),
    pool.query<RowDataPacket[]>(
      `SELECT DATE(criado_em) AS dia, COUNT(*) AS total
         FROM veiculos
        WHERE criado_em >= (NOW() - INTERVAL ? DAY)
        GROUP BY DATE(criado_em)`,
      [dias],
    ),
  ]);

  return {
    totalVeiculos: (totalRows[0] as { total: number }).total,
    veiculosHoje: (hojeRows[0] as { total: number }).total,
    veiculosPeriodo: (periodoRows[0] as { total: number }).total,
    porCentro: (centroRows as { nome: string; total: number }[]).map((r) => ({
      nome: r.nome,
      total: r.total,
    })),
    porMarca: (marcaRows as { nome: string; total: number }[]).map((r) => ({
      nome: r.nome,
      total: r.total,
    })),
    serieDiaria: montarSerie(
      dias,
      (serieRows as { dia: string; total: number }[]).map((r) => ({ dia: r.dia, total: r.total })),
    ),
  };
}
