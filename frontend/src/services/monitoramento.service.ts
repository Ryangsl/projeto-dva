import { api } from './api';

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
  porMarca: ContagemPorGrupo[];
  serieDiaria: PontoSerie[];
}

export type PeriodoDias = 7 | 30 | 60;

export async function buscarDashboard(dias: PeriodoDias): Promise<DashboardVeiculos> {
  const { data } = await api.get<DashboardVeiculos>('/monitoramento/dashboard', { params: { dias } });
  return data;
}
