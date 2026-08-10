import { basename } from 'node:path';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../../config/database.js';
import { env } from '../../config/env.js';
import type { Perfil } from '../../middlewares/auth.js';
import { badRequest, forbidden, notFound } from '../../shared/http-error.js';
import { MARCAS_DVA } from './marcas-dva.js';

// Nome do banco antigo do PROCAR (mesma instância MySQL), só para qualificar
// as consultas cross-database ao catálogo de veículos já importado da FIPE.
// O valor vem só de `env` (nunca de input do usuário) — não é injeção.
const VDB = env.db.vehiclesDatabase;

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

// Marcas do DVA presentes no catálogo FIPE (cross-database), com seus
// modelos aninhados. Se uma marca não tiver correspondência na base FIPE
// (cobertura incompleta para marcas recentes/nicho), ela simplesmente não
// aparece — degradação suave, o cadastro continua possível com modelo vazio.
async function obterMarcasComModelos(): Promise<Marca[]> {
  const condicoes = MARCAS_DVA.map(() => 'name LIKE ?').join(' OR ');
  const parametros = MARCAS_DVA.map((m) => `%${m}%`);
  const [marcasRows] = await pool.query<RowDataPacket[]>(
    `SELECT id, name FROM \`${VDB}\`.vehicle_brands WHERE ${condicoes} ORDER BY name`,
    parametros,
  );
  const marcas = marcasRows as { id: number; name: string }[];
  if (marcas.length === 0) return [];

  const ids = marcas.map((m) => m.id);
  const [modelosRows] = await pool.query<RowDataPacket[]>(
    `SELECT id, brand_id, name FROM \`${VDB}\`.vehicle_models WHERE brand_id IN (?) ORDER BY name`,
    [ids],
  );
  const modelosPorMarca = new Map<number, Modelo[]>();
  for (const r of modelosRows as { id: number; brand_id: number; name: string }[]) {
    const lista = modelosPorMarca.get(r.brand_id) ?? [];
    lista.push({ id: r.id, nome: r.name });
    modelosPorMarca.set(r.brand_id, lista);
  }
  return marcas.map((m) => ({ id: m.id, nome: m.name, modelos: modelosPorMarca.get(m.id) ?? [] }));
}

export async function obterOpcoes(): Promise<OpcoesFormulario> {
  const [marcas, [coresRows], [centrosRows]] = await Promise.all([
    obterMarcasComModelos(),
    pool.query<RowDataPacket[]>('SELECT id, nome, hex FROM cores WHERE ativo = 1 ORDER BY ordem, nome'),
    pool.query<RowDataPacket[]>(
      'SELECT id, nome FROM centros_distribuicao WHERE ativo = 1 ORDER BY nome',
    ),
  ]);
  return {
    marcas,
    cores: (coresRows as { id: number; nome: string; hex: string }[]).map((r) => ({
      id: r.id,
      nome: r.nome,
      hex: r.hex,
    })),
    centros: (centrosRows as { id: number; nome: string }[]).map((r) => ({ id: r.id, nome: r.nome })),
  };
}

async function existeMarca(marcaId: number): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 FROM \`${VDB}\`.vehicle_brands WHERE id = ? LIMIT 1`,
    [marcaId],
  );
  return rows.length > 0;
}

async function existeModelo(modeloId: number, marcaId: number): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 FROM \`${VDB}\`.vehicle_models WHERE id = ? AND brand_id = ? LIMIT 1`,
    [modeloId, marcaId],
  );
  return rows.length > 0;
}

function isDuplicateChassi(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ER_DUP_ENTRY';
}

export async function chassiExiste(chassi: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT 1 FROM veiculos WHERE chassi = ? LIMIT 1', [
    chassi.toUpperCase().trim(),
  ]);
  return rows.length > 0;
}

export interface DadosCriacaoVeiculo {
  chassi: string;
  marcaId: number;
  modeloId?: number;
  corId?: number;
  centroDistribuicaoId?: number; // só usado/obrigatório quando quem cadastra é admin
  destino?: string;
  observacoes?: string;
}

export interface ArquivosVeiculo {
  fotos: Express.Multer.File[];
  video?: Express.Multer.File;
}

export interface UsuarioAutenticado {
  sub: number;
  perfil: Perfil;
  centroDistribuicaoId: number | null;
}

const SELECT_DETALHE = `
  SELECT v.id, v.chassi, v.destino, v.observacoes, v.video_path, v.criado_em,
         v.marca_id, v.modelo_id, v.cor_id,
         b.name AS marca_nome, m.name AS modelo_nome,
         c.nome AS cor_nome, c.hex AS cor_hex,
         cd.id AS centro_id, cd.nome AS centro_nome,
         u.nome AS usuario_nome
    FROM veiculos v
    JOIN \`${VDB}\`.vehicle_brands b ON b.id = v.marca_id
    LEFT JOIN \`${VDB}\`.vehicle_models m ON m.id = v.modelo_id
    LEFT JOIN cores c ON c.id = v.cor_id
    JOIN centros_distribuicao cd ON cd.id = v.centro_distribuicao_id
    JOIN usuarios u ON u.id = v.usuario_id
`;

interface VeiculoRow extends RowDataPacket {
  id: number;
  chassi: string;
  destino: string | null;
  observacoes: string | null;
  video_path: string | null;
  criado_em: string;
  marca_id: number;
  modelo_id: number | null;
  cor_id: number | null;
  marca_nome: string;
  modelo_nome: string | null;
  cor_nome: string | null;
  cor_hex: string | null;
  centro_id: number;
  centro_nome: string;
  usuario_nome: string;
}

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

function mapearResumo(r: VeiculoRow): VeiculoResumo {
  return {
    id: r.id,
    chassi: r.chassi,
    marcaNome: r.marca_nome,
    modeloNome: r.modelo_nome,
    corNome: r.cor_nome,
    corHex: r.cor_hex,
    centroNome: r.centro_nome,
    destino: r.destino,
    usuarioNome: r.usuario_nome,
    criadoEm: r.criado_em,
  };
}

async function mapearDetalhe(r: VeiculoRow): Promise<VeiculoDetalhe> {
  const [fotosRows] = await pool.query<RowDataPacket[]>(
    'SELECT caminho FROM veiculo_fotos WHERE veiculo_id = ? ORDER BY ordem',
    [r.id],
  );
  return {
    ...mapearResumo(r),
    observacoes: r.observacoes,
    videoUrl: r.video_path ? `/api/uploads/${r.video_path}` : null,
    fotos: (fotosRows as { caminho: string }[]).map((f) => `/api/uploads/${f.caminho}`),
  };
}

export async function criar(
  dados: DadosCriacaoVeiculo,
  arquivos: ArquivosVeiculo,
  usuario: UsuarioAutenticado,
): Promise<VeiculoDetalhe> {
  let centroId: number;
  if (usuario.perfil === 'operador') {
    // Nunca confia no corpo: o centro do operador é sempre o próprio, fixo.
    if (!usuario.centroDistribuicaoId) {
      throw forbidden('Sua conta não tem centro de distribuição associado');
    }
    centroId = usuario.centroDistribuicaoId;
  } else {
    if (!dados.centroDistribuicaoId) throw badRequest('Selecione o centro de distribuição');
    centroId = dados.centroDistribuicaoId;
  }

  if (!(await existeMarca(dados.marcaId))) throw badRequest('Marca inválida');
  if (dados.modeloId !== undefined && !(await existeModelo(dados.modeloId, dados.marcaId))) {
    throw badRequest('Modelo inválido para a marca selecionada');
  }

  const videoPath = arquivos.video ? basename(arquivos.video.path) : null;
  const chassi = dados.chassi.toUpperCase().trim();

  let insertId: number;
  try {
    const [resultado] = await pool.query<ResultSetHeader>(
      `INSERT INTO veiculos
        (chassi, marca_id, modelo_id, cor_id, centro_distribuicao_id, destino, observacoes, video_path, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        chassi,
        dados.marcaId,
        dados.modeloId ?? null,
        dados.corId ?? null,
        centroId,
        dados.destino ?? null,
        dados.observacoes ?? null,
        videoPath,
        usuario.sub,
      ],
    );
    insertId = resultado.insertId;
  } catch (err) {
    if (isDuplicateChassi(err)) throw badRequest('Já existe um veículo cadastrado com este chassi');
    throw err;
  }

  if (arquivos.fotos.length > 0) {
    const placeholders = arquivos.fotos.map(() => '(?, ?, ?)').join(', ');
    const valores = arquivos.fotos.flatMap((f, i) => [insertId, basename(f.path), i]);
    await pool.query(
      `INSERT INTO veiculo_fotos (veiculo_id, caminho, ordem) VALUES ${placeholders}`,
      valores,
    );
  }

  return buscarPorId(insertId);
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

export async function listar(filtros: FiltrosListagem): Promise<ListagemVeiculos> {
  const condicoes: string[] = [];
  const parametros: unknown[] = [];
  if (filtros.chassi) {
    condicoes.push('v.chassi LIKE ?');
    parametros.push(`%${filtros.chassi.toUpperCase().trim()}%`);
  }
  if (filtros.marcaId) {
    condicoes.push('v.marca_id = ?');
    parametros.push(filtros.marcaId);
  }
  if (filtros.centroDistribuicaoId) {
    condicoes.push('v.centro_distribuicao_id = ?');
    parametros.push(filtros.centroDistribuicaoId);
  }
  const where = condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : '';

  const limite = Math.min(Math.max(filtros.limite ?? 20, 1), 100);
  const pagina = Math.max(filtros.pagina ?? 1, 1);
  const offset = (pagina - 1) * limite;

  const [totalRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM veiculos v ${where}`,
    parametros,
  );
  const total = (totalRows[0] as { total: number }).total;

  const [rows] = await pool.query<VeiculoRow[]>(
    `${SELECT_DETALHE} ${where} ORDER BY v.criado_em DESC LIMIT ${limite} OFFSET ${offset}`,
    parametros,
  );

  return { veiculos: rows.map(mapearResumo), total, pagina, limite };
}

export async function buscarPorId(id: number): Promise<VeiculoDetalhe> {
  const [rows] = await pool.query<VeiculoRow[]>(`${SELECT_DETALHE} WHERE v.id = ? LIMIT 1`, [id]);
  const veiculo = rows[0];
  if (!veiculo) throw notFound('Veículo não encontrado');
  return mapearDetalhe(veiculo);
}
