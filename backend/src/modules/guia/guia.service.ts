import type { RowDataPacket } from 'mysql2';
import { pool } from '../../config/database.js';
import { MARCAS_PRINCIPAIS } from './marcas-principais.js';

// Categoria de veículo (virá de vehicle_categories quando importada; por ora
// os modelos podem não ter categoria definida).
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
  // Argumento de venda específico da cor (Manual de Vendas), usado nos
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

// setor/canal/banco filtram a etapa para o atendimento (NULL = qualquer).
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

// Contorno de objeções e dicas de ouro do Manual de Vendas.
export interface Objecao {
  id: number;
  tipo: 'objecao' | 'dica';
  titulo: string;
  resposta: string;
}

// Todo o conteúdo do guia numa única resposta — o frontend cacheia e trabalha
// offline a partir daí (avaliando as regras no cliente). Ver §2/§7 do CLAUDE.md.
export interface GuiaDados {
  fabricantes: Fabricante[];
  cores: Cor[];
  servicos: Servico[];
  roteiro: RoteiroEtapa[];
  regras: Regra[];
  objecoes: Objecao[];
}

const CATEGORIAS_VALIDAS: Categoria[] = ['SUV', 'Hatch', 'Sedan', 'Picape', 'Outro'];
function normalizarCategoria(valor: unknown): Categoria | null {
  return CATEGORIAS_VALIDAS.includes(valor as Categoria) ? (valor as Categoria) : null;
}

// Marcas/modelos vêm das tabelas vehicle_* (importadas da FIPE), filtrados
// pelas marcas principais (marcas-principais.ts) para manter o guia leve.
// Consultor (uma loja) e Gestor (uma ou mais lojas) enxergam só as próprias
// marcas; null/vazio = sem restrição (admin vê todas as marcas principais).
async function obterFabricantes(marcasUsuario: string[] | null): Promise<Fabricante[]> {
  const marcas = marcasUsuario && marcasUsuario.length > 0 ? marcasUsuario : MARCAS_PRINCIPAIS;
  const filtro = marcas.map(() => 'name LIKE ?').join(' OR ');
  const params = marcas.map((m) => `%${m}%`);

  const [brands] = await pool.query<RowDataPacket[]>(
    `SELECT id, name FROM vehicle_brands WHERE ${filtro} ORDER BY name`,
    params,
  );
  if (brands.length === 0) return [];

  const brandIds = brands.map((b) => b.id);
  const [models] = await pool.query<RowDataPacket[]>(
    `SELECT id, brand_id, name, category FROM vehicle_models WHERE brand_id IN (?) ORDER BY name`,
    [brandIds],
  );

  return brands.map((b) => ({
    id: b.id,
    nome: b.name,
    modelos: models
      .filter((m) => m.brand_id === b.id)
      .map((m) => ({ id: m.id, nome: m.name, categoria: normalizarCategoria(m.category) })),
  }));
}

export async function obterDados(marcasUsuario: string[] | null): Promise<GuiaDados> {
  const [fabricantes, cores, servicos, roteiro, regras, objecoes] = await Promise.all([
    obterFabricantes(marcasUsuario),
    pool.query<RowDataPacket[]>(
      'SELECT id, nome, hex, argumento FROM cores WHERE ativo = 1 ORDER BY ordem, nome',
    ),
    pool.query<RowDataPacket[]>(
      'SELECT id, nome, selo, descricao FROM servicos WHERE ativo = 1 ORDER BY ordem, nome',
    ),
    pool.query<RowDataPacket[]>(
      'SELECT id, ordem, setor, canal, banco, titulo, instrucao, frase_template FROM roteiro_etapas ORDER BY ordem',
    ),
    pool.query<RowDataPacket[]>(
      'SELECT id, prioridade, cor, categoria, modelo_id, banco, setor, servico_id, argumento_template FROM regras WHERE ativo = 1 ORDER BY prioridade DESC',
    ),
    pool.query<RowDataPacket[]>(
      'SELECT id, tipo, titulo, resposta FROM objecoes WHERE ativo = 1 ORDER BY ordem, id',
    ),
  ]);

  return {
    fabricantes,
    cores: cores[0] as Cor[],
    servicos: servicos[0] as Servico[],
    roteiro: roteiro[0] as RoteiroEtapa[],
    regras: regras[0] as Regra[],
    objecoes: objecoes[0] as Objecao[],
  };
}
