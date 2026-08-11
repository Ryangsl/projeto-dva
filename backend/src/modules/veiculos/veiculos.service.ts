import { unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../../config/database.js';
import { env } from '../../config/env.js';
import { badRequest, notFound } from '../../shared/http-error.js';
import { gerarProtocolo } from '../../shared/protocolo.js';
import { MARCAS_DVA } from './marcas-dva.js';
import { UPLOAD_DIR } from './upload.js';

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

export interface OpcoesFormulario {
  marcas: Marca[];
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
  return { marcas: await obterMarcasComModelos() };
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

// Distingue QUAL chave única colidiu: chassi é erro do usuário (mensagem
// clara); protocolo é gerado pelo servidor, então uma colisão (extremamente
// improvável — 4 caracteres de um alfabeto de 32, por dia) é resolvida com
// nova tentativa em silêncio, nunca exposta como erro.
function chaveDuplicada(err: unknown): 'chassi' | 'protocolo' | null {
  if (typeof err !== 'object' || err === null) return null;
  const e = err as { code?: string; sqlMessage?: string; message?: string };
  if (e.code !== 'ER_DUP_ENTRY') return null;
  const msg = e.sqlMessage ?? e.message ?? '';
  if (msg.includes('protocolo')) return 'protocolo';
  if (msg.includes('chassi')) return 'chassi';
  return null;
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
  destino?: string;
  observacoes?: string;
}

export interface ArquivosVeiculo {
  fotos: Express.Multer.File[];
  video?: Express.Multer.File;
}

export interface UsuarioAutenticado {
  sub: number;
}

const SELECT_DETALHE = `
  SELECT v.id, v.chassi, v.protocolo, v.destino, v.observacoes, v.video_path, v.criado_em,
         v.marca_id, v.modelo_id, v.usuario_id,
         b.name AS marca_nome, m.name AS modelo_nome,
         u.nome AS usuario_nome
    FROM veiculos v
    JOIN \`${VDB}\`.vehicle_brands b ON b.id = v.marca_id
    LEFT JOIN \`${VDB}\`.vehicle_models m ON m.id = v.modelo_id
    JOIN usuarios u ON u.id = v.usuario_id
`;

interface VeiculoRow extends RowDataPacket {
  id: number;
  chassi: string;
  protocolo: string;
  destino: string | null;
  observacoes: string | null;
  video_path: string | null;
  criado_em: string;
  marca_id: number;
  modelo_id: number | null;
  usuario_id: number;
  marca_nome: string;
  modelo_nome: string | null;
  usuario_nome: string;
}

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

function mapearResumo(r: VeiculoRow): VeiculoResumo {
  return {
    id: r.id,
    chassi: r.chassi,
    protocolo: r.protocolo,
    marcaNome: r.marca_nome,
    modeloNome: r.modelo_nome,
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
  if (!(await existeMarca(dados.marcaId))) throw badRequest('Marca inválida');
  if (dados.modeloId !== undefined && !(await existeModelo(dados.modeloId, dados.marcaId))) {
    throw badRequest('Modelo inválido para a marca selecionada');
  }

  const videoPath = arquivos.video ? basename(arquivos.video.path) : null;
  const chassi = dados.chassi.toUpperCase().trim();

  let insertId: number | undefined;
  const TENTATIVAS_PROTOCOLO = 5;
  for (let tentativa = 0; tentativa < TENTATIVAS_PROTOCOLO; tentativa++) {
    const protocolo = gerarProtocolo();
    try {
      const [resultado] = await pool.query<ResultSetHeader>(
        `INSERT INTO veiculos
          (chassi, protocolo, marca_id, modelo_id, destino, observacoes, video_path, usuario_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          chassi,
          protocolo,
          dados.marcaId,
          dados.modeloId ?? null,
          dados.destino ?? null,
          dados.observacoes ?? null,
          videoPath,
          usuario.sub,
        ],
      );
      insertId = resultado.insertId;
      break;
    } catch (err) {
      const chave = chaveDuplicada(err);
      if (chave === 'chassi') throw badRequest('Já existe um veículo cadastrado com este chassi');
      if (chave === 'protocolo' && tentativa < TENTATIVAS_PROTOCOLO - 1) continue;
      throw err;
    }
  }
  if (insertId === undefined) {
    throw new Error('Não foi possível gerar um protocolo único para o veículo');
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

// Exclusão definitiva (só Admin — a rota também exige o perfil). O veículo já
// saiu para a concessionária: excluir aqui é corrigir um cadastro errado, não
// um fluxo comum. Junto com a linha vão os registros de `veiculo_fotos` (FK
// ON DELETE CASCADE) e, best-effort, os arquivos físicos em disco — uma falha
// ao apagar um arquivo (já removido manualmente, permissão, etc.) não deve
// impedir a exclusão do cadastro.
export async function excluir(id: number): Promise<void> {
  const [fotosRows] = await pool.query<RowDataPacket[]>(
    'SELECT caminho FROM veiculo_fotos WHERE veiculo_id = ?',
    [id],
  );
  const [veiculoRows] = await pool.query<RowDataPacket[]>(
    'SELECT video_path FROM veiculos WHERE id = ? LIMIT 1',
    [id],
  );
  if (veiculoRows.length === 0) throw notFound('Veículo não encontrado');

  const caminhos = [
    ...(fotosRows as { caminho: string }[]).map((f) => f.caminho),
    ...((veiculoRows[0] as { video_path: string | null }).video_path
      ? [(veiculoRows[0] as { video_path: string }).video_path]
      : []),
  ];

  await pool.query('DELETE FROM veiculos WHERE id = ?', [id]);

  await Promise.all(
    caminhos.map((caminho) =>
      unlink(join(UPLOAD_DIR, caminho)).catch(() => {
        /* arquivo já ausente ou sem permissão — não impede a exclusão do cadastro */
      }),
    ),
  );
}
