export interface Modelo {
  id: number;
  nome: string;
}

export interface Marca {
  id: number;
  nome: string;
  modelos: Modelo[];
}

export interface Cor {
  id: number;
  nome: string;
  hex: string;
}

export interface Centro {
  id: number;
  nome: string;
}

export interface OpcoesFormulario {
  marcas: Marca[];
  cores: Cor[];
  centros: Centro[];
}

// Estado do formulário de cadastro. Vive só em memória até o envio — nada é
// gravado no banco antes do "Salvar veículo" (upload exige rede de qualquer
// forma, então não há necessidade de cache offline aqui).
export interface NovoVeiculo {
  centro: Centro | null;
  marca: Marca | null;
  modelo: Modelo | null;
  chassi: string;
  cor: Cor | null;
  fotos: File[];
  video: File | null;
  observacoes: string;
  destino: string;
}

export const NOVO_VEICULO_VAZIO: NovoVeiculo = {
  centro: null,
  marca: null,
  modelo: null,
  chassi: '',
  cor: null,
  fotos: [],
  video: null,
  observacoes: '',
  destino: '',
};

export interface VeiculoResumo {
  id: number;
  chassi: string;
  marcaNome: string;
  modeloNome: string | null;
  corNome: string | null;
  corHex: string | null;
  centroNome: string;
  destino: string | null;
  usuarioNome: string;
  criadoEm: string;
}

export interface VeiculoDetalhe extends VeiculoResumo {
  observacoes: string | null;
  videoUrl: string | null;
  fotos: string[];
}
