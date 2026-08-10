import { api } from './api';

export interface Centro {
  id: number;
  nome: string;
  ativo: boolean;
  criadoEm: string;
}

export async function listarCentros(): Promise<Centro[]> {
  const { data } = await api.get<{ centros: Centro[] }>('/centros');
  return data.centros;
}

export async function criarCentro(nome: string): Promise<Centro> {
  const { data } = await api.post<{ centro: Centro }>('/centros', { nome });
  return data.centro;
}

export async function atualizarCentro(
  id: number,
  dados: { nome?: string; ativo?: boolean },
): Promise<Centro> {
  const { data } = await api.put<{ centro: Centro }>(`/centros/${id}`, dados);
  return data.centro;
}
