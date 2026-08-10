export type Categoria = 'SUV' | 'Hatch' | 'Sedan' | 'Picape' | 'Outro';

export interface Modelo {
  id: number;
  nome: string;
  categoria: Categoria | null;
}
export interface Fabricante {
  id: number;
  nome: string;
  modelos: Modelo[];
}
export interface Cor {
  id: number;
  nome: string;
  hex: string;
  // Argumento de venda específico da cor (Manual de Vendas): entra nos
  // templates via placeholder {argumento_cor}.
  argumento: string | null;
}
export interface Servico {
  id: number;
  nome: string;
  selo: string | null;
  descricao: string | null;
}
export type Banco = 'tecido' | 'couro';
export type Canal = 'presencial' | 'telefone';

// setor/canal/banco filtram a etapa para o atendimento (null = qualquer):
// os roteiros do Manual de Vendas variam por setor, canal e tipo de banco.
export interface RoteiroEtapa {
  id: number;
  ordem: number;
  setor: string | null;
  canal: Canal | null;
  banco: Banco | null;
  titulo: string;
  instrucao: string;
  frase_template: string;
}

export interface Regra {
  id: number;
  prioridade: number;
  cor: string | null;
  categoria: Categoria | null;
  modelo_id: number | null;
  banco: Banco | null;
  setor: string | null;
  servico_id: number;
  argumento_template: string;
}

// Contorno de objeções e dicas de ouro do Manual de Vendas (material de apoio).
export interface Objecao {
  id: number;
  tipo: 'objecao' | 'dica';
  titulo: string;
  resposta: string;
}

export interface GuiaDados {
  fabricantes: Fabricante[];
  cores: Cor[];
  servicos: Servico[];
  roteiro: RoteiroEtapa[];
  regras: Regra[];
  objecoes: Objecao[];
}

// Dados do atendimento em curso. Vivem apenas em memória (nada vai ao banco):
// o guia é gerado na hora, para aquele cliente, naquele momento.
export interface Atendimento {
  cliente: string;
  fabricante: Fabricante | null;
  modelo: Modelo | null;
  cor: Cor | null;
  banco: Banco | null;
  corBanco: string | null; // cor do couro (apenas quando banco === 'couro')
  setor: string | null; // setor do atendimento (Novos, Seminovos, Oficina...)
  canal: Canal | null; // presencial ou telefone (Manual de Vendas)
}

export const ATENDIMENTO_VAZIO: Atendimento = {
  cliente: '',
  fabricante: null,
  modelo: null,
  cor: null,
  banco: null,
  corBanco: null,
  setor: null,
  canal: null,
};

// Setores de atendimento do Manual de Vendas (estático: parte do formulário).
// Os nomes precisam casar com roteiro_etapas.setor / regras.setor do seed.
export const SETORES: string[] = [
  'Novos',
  'Novos - Recém retirado',
  'Seminovos',
  'Oficina',
  'Funilaria',
];

// Canais de venda do Manual de Vendas.
export const CANAIS: { valor: Canal; rotulo: string }[] = [
  { valor: 'presencial', rotulo: 'Presencial' },
  { valor: 'telefone', rotulo: 'Telefone' },
];

// Cores de couro oferecidas (estático: faz parte do formulário, não do banco).
export const CORES_COURO: { nome: string; hex: string }[] = [
  { nome: 'Preto', hex: '#1b1e23' },
  { nome: 'Marrom', hex: '#5b3a24' },
  { nome: 'Caramelo', hex: '#a9683a' },
  { nome: 'Bege', hex: '#d9c6a5' },
  { nome: 'Vermelho', hex: '#8c2f2f' },
  { nome: 'Branco', hex: '#efede8' },
];

// Uma oportunidade resolvida (serviço + argumento já personalizado).
export interface Oportunidade {
  servico: Servico;
  argumento: string;
}
