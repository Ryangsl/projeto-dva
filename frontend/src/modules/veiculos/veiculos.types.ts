export interface Modelo {
  id: number;
  nome: string;
}

export interface Marca {
  id: number;
  nome: string;
  modelos: Modelo[];
}

export interface OpcoesFormulario {
  marcas: Marca[];
}

// Estado do formulário de cadastro. Vive só em memória até o envio — nada é
// gravado no banco antes do "Salvar veículo" (upload exige rede de qualquer
// forma, então não há necessidade de cache offline aqui).
export interface NovoVeiculo {
  marca: Marca | null;
  modelo: Modelo | null;
  chassi: string;
  fotos: File[];
  video: File | null;
  observacoes: string;
  destino: string;
}

export const NOVO_VEICULO_VAZIO: NovoVeiculo = {
  marca: null,
  modelo: null,
  chassi: '',
  fotos: [],
  video: null,
  observacoes: '',
  destino: '',
};

export interface VeiculoResumo {
  id: number;
  chassi: string;
  protocolo: string;
  marcaNome: string;
  modeloNome: string | null;
  destino: string | null;
  usuarioNome: string;
  criadoEm: string;
}

export interface VeiculoDetalhe extends VeiculoResumo {
  observacoes: string | null;
  videoUrl: string | null;
  fotos: string[];
}
