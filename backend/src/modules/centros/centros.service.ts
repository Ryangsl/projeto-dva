import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../../config/database.js';
import { badRequest, notFound } from '../../shared/http-error.js';

export interface Centro {
  id: number;
  nome: string;
  ativo: boolean;
  criadoEm: string;
}

interface CentroRow extends RowDataPacket {
  id: number;
  nome: string;
  ativo: number;
  criado_em: string;
}

function mapear(r: CentroRow): Centro {
  return { id: r.id, nome: r.nome, ativo: Boolean(r.ativo), criadoEm: r.criado_em };
}

function isDuplicateName(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ER_DUP_ENTRY';
}

export async function listar(): Promise<Centro[]> {
  const [rows] = await pool.query<CentroRow[]>('SELECT * FROM centros_distribuicao ORDER BY nome');
  return rows.map(mapear);
}

export async function criar(nome: string): Promise<Centro> {
  let insertId: number;
  try {
    const [resultado] = await pool.query<ResultSetHeader>(
      'INSERT INTO centros_distribuicao (nome) VALUES (?)',
      [nome],
    );
    insertId = resultado.insertId;
  } catch (err) {
    if (isDuplicateName(err)) throw badRequest('Já existe um centro de distribuição com esse nome');
    throw err;
  }
  const [rows] = await pool.query<CentroRow[]>('SELECT * FROM centros_distribuicao WHERE id = ?', [
    insertId,
  ]);
  return mapear(rows[0]);
}

export interface DadosAtualizacao {
  nome?: string;
  ativo?: boolean;
}

// Sem exclusão física: `usuarios`/`veiculos` referenciam o centro por FK — só
// desativar (reversível), mesma filosofia já usada em `usuarios`.
export async function atualizar(id: number, dados: DadosAtualizacao): Promise<Centro> {
  const [existentes] = await pool.query<CentroRow[]>('SELECT * FROM centros_distribuicao WHERE id = ?', [
    id,
  ]);
  if (existentes.length === 0) throw notFound('Centro de distribuição não encontrado');

  const campos: string[] = [];
  const valores: unknown[] = [];
  if (dados.nome !== undefined) {
    campos.push('nome = ?');
    valores.push(dados.nome);
  }
  if (dados.ativo !== undefined) {
    campos.push('ativo = ?');
    valores.push(dados.ativo ? 1 : 0);
  }

  if (campos.length > 0) {
    try {
      await pool.query(`UPDATE centros_distribuicao SET ${campos.join(', ')} WHERE id = ?`, [
        ...valores,
        id,
      ]);
    } catch (err) {
      if (isDuplicateName(err)) throw badRequest('Já existe um centro de distribuição com esse nome');
      throw err;
    }
  }

  const [rows] = await pool.query<CentroRow[]>('SELECT * FROM centros_distribuicao WHERE id = ?', [id]);
  return mapear(rows[0]);
}
