import { api } from './api';
import type {
  NovoVeiculo,
  OpcoesFormulario,
  VeiculoDetalhe,
  VeiculoResumo,
} from '../modules/veiculos/veiculos.types';

// Fotos/vídeo vêm do backend como caminho relativo (`/api/uploads/...`, já
// atrás de autenticação — ver app.ts). `<img>`/`<video src>` fazem GET direto
// (não passam pelo axios), então precisam da origem completa da API.
const API_ORIGIN = (import.meta.env.VITE_API_URL ?? 'http://localhost:3333/api').replace(
  /\/api\/?$/,
  '',
);

export function urlMidia(caminho: string): string {
  return `${API_ORIGIN}${caminho}`;
}

export async function buscarOpcoes(): Promise<OpcoesFormulario> {
  const { data } = await api.get<OpcoesFormulario>('/veiculos/opcoes');
  return data;
}

export async function chassiExiste(chassi: string): Promise<boolean> {
  const { data } = await api.get<{ existe: boolean }>(
    `/veiculos/chassi/${encodeURIComponent(chassi)}`,
  );
  return data.existe;
}

// Monta multipart/form-data. Não define Content-Type manualmente — o axios
// detecta um FormData e gera o boundary sozinho; setar o header à mão quebra
// o envio (falta o boundary).
export async function criarVeiculo(dados: NovoVeiculo): Promise<VeiculoDetalhe> {
  const form = new FormData();
  form.append('chassi', dados.chassi);
  if (dados.marca) form.append('marcaId', String(dados.marca.id));
  if (dados.modelo) form.append('modeloId', String(dados.modelo.id));
  if (dados.cor) form.append('corId', String(dados.cor.id));
  if (dados.centro) form.append('centroDistribuicaoId', String(dados.centro.id));
  if (dados.destino.trim()) form.append('destino', dados.destino.trim());
  if (dados.observacoes.trim()) form.append('observacoes', dados.observacoes.trim());
  dados.fotos.forEach((foto) => form.append('fotos', foto));
  if (dados.video) form.append('video', dados.video);

  const { data } = await api.post<{ veiculo: VeiculoDetalhe }>('/veiculos', form);
  return data.veiculo;
}

export interface FiltrosListagem {
  chassi?: string;
  marcaId?: number;
  centroDistribuicaoId?: number;
  pagina?: number;
  limite?: number;
}

export interface ListagemVeiculos {
  veiculos: VeiculoResumo[];
  total: number;
  pagina: number;
  limite: number;
}

export async function listarVeiculos(filtros: FiltrosListagem): Promise<ListagemVeiculos> {
  const { data } = await api.get<ListagemVeiculos>('/veiculos', { params: filtros });
  return data;
}

export async function buscarVeiculoPorId(id: number): Promise<VeiculoDetalhe> {
  const { data } = await api.get<{ veiculo: VeiculoDetalhe }>(`/veiculos/${id}`);
  return data.veiculo;
}
