import { api } from './api';

// Uso do guia por usuário/concessionária (visão do gestor).
// Status e tempos são calculados no servidor (relógio único).
export interface UsoUsuario {
  id: number;
  nome: string;
  email: string;
  marca: string | null;
  ultimo_login: string | null;
  acessos: number;
  segundos_logado: number;
  fichas_iniciadas: number;
  fichas_concluidas: number;
  online: boolean;
  segundos_sessao_atual: number | null;
  segundos_desde_atividade: number | null;
}

export interface PontoSerie {
  dia: string; // 'YYYY-MM-DD'
  acessos: number;
  iniciadas: number;
  concluidas: number;
}

// Painel consolidado: KPIs + série temporal + rankings.
export interface Dashboard {
  periodoDias: number;
  consultoresAtivos: number;
  consultoresInativos: number;
  onlineAgora: number;
  acessosHoje: number;
  acessosPeriodo: number;
  fichasIniciadas: number;
  fichasConcluidas: number;
  taxaConclusao: number; // 0..1
  serieDiaria: PontoSerie[];
  maisUsam: UsoUsuario[];
  semUsoRecente: UsoUsuario[];
}

export type OrdenacaoConsultores = 'mais_usam' | 'sem_uso' | 'nome';

export interface ListaConsultores {
  itens: UsoUsuario[];
  total: number;
  pagina: number;
  limite: number;
}

export type PeriodoDias = 7 | 30 | 60;

export async function buscarDashboard(dias: PeriodoDias): Promise<Dashboard> {
  const { data } = await api.get<Dashboard>('/gestor/dashboard', { params: { dias } });
  return data;
}

export async function buscarConsultores(opts: {
  dias: PeriodoDias;
  ordenar: OrdenacaoConsultores;
  pagina: number;
  limite: number;
}): Promise<ListaConsultores> {
  const { data } = await api.get<ListaConsultores>('/gestor/consultores', { params: opts });
  return data;
}
