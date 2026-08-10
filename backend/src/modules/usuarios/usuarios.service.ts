import bcrypt from 'bcryptjs';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../../config/database.js';
import { badRequest, forbidden, notFound } from '../../shared/http-error.js';
import { gerarSenhaTemporaria } from '../../shared/senha.js';
import { encerrarSessoesDoUsuario } from '../auth/auth.service.js';

// Perfil gerido por este módulo — contas 'admin' nunca são alvo aqui: só o
// Admin administra usuários, e ele próprio não é gerido pelo app.
export type PerfilGerenciavel = 'operador';

// Só o Admin gerencia usuários neste MVP (não existe mais o caso "gestor
// administrando a própria loja").
export interface Escopo {
  usuarioId: number;
}

export interface UsuarioGerenciado {
  id: number;
  nome: string;
  email: string;
  perfil: PerfilGerenciavel;
  ativo: boolean;
  senhaDefinida: boolean;
  ultimoLogin: string | null;
  criadoEm: string;
}

interface UsuarioRow extends RowDataPacket {
  id: number;
  nome: string;
  email: string;
  perfil: PerfilGerenciavel;
  ativo: number;
  senha_definida: number;
  ultimo_login: string | null;
  created_at: string;
}

const CAMPOS = 'id, nome, email, perfil, ativo, senha_definida, ultimo_login, created_at';

function mapear(r: UsuarioRow): UsuarioGerenciado {
  return {
    id: r.id,
    nome: r.nome,
    email: r.email,
    perfil: r.perfil,
    ativo: Boolean(r.ativo),
    senhaDefinida: Boolean(r.senha_definida),
    ultimoLogin: r.ultimo_login,
    criadoEm: r.created_at,
  };
}

function isDuplicateEmail(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ER_DUP_ENTRY';
}

// Reexportado para não quebrar quem já importava daqui (a implementação vive
// em shared/senha.ts, para o db:setup poder usá-la sem carregar o pool).
export { gerarSenhaTemporaria };

// Lista todos os operadores (contas admin nunca aparecem aqui).
export async function listar(): Promise<UsuarioGerenciado[]> {
  const [rows] = await pool.query<UsuarioRow[]>(
    `SELECT ${CAMPOS} FROM usuarios WHERE perfil = 'operador' ORDER BY nome`,
  );
  return rows.map(mapear);
}

async function buscarOperador(id: number): Promise<UsuarioRow> {
  const [rows] = await pool.query<UsuarioRow[]>(`SELECT ${CAMPOS} FROM usuarios WHERE id = ? LIMIT 1`, [
    id,
  ]);
  const usuario = rows[0];
  if (!usuario) throw notFound('Usuário não encontrado');
  if (usuario.perfil !== 'operador') {
    throw forbidden('Contas de administrador não são gerenciadas por aqui');
  }
  return usuario;
}

export interface DadosCriacao {
  nome: string;
  email: string;
}

export interface ResultadoCriacao {
  usuario: UsuarioGerenciado;
  senhaTemporaria: string;
}

export async function criar(dados: DadosCriacao): Promise<ResultadoCriacao> {
  const senhaTemporaria = gerarSenhaTemporaria();
  const senhaHash = await bcrypt.hash(senhaTemporaria, 10);

  let insertId: number;
  try {
    const [resultado] = await pool.query<ResultSetHeader>(
      'INSERT INTO usuarios (nome, email, senha_hash, perfil, senha_definida) VALUES (?, ?, ?, ?, 0)',
      [dados.nome, dados.email, senhaHash, 'operador'],
    );
    insertId = resultado.insertId;
  } catch (err) {
    if (isDuplicateEmail(err)) throw badRequest('E-mail já cadastrado');
    throw err;
  }

  const usuario = mapear(await buscarOperador(insertId));
  return { usuario, senhaTemporaria };
}

export interface DadosAtualizacao {
  nome?: string;
  email?: string;
  ativo?: boolean;
}

export async function atualizar(id: number, dados: DadosAtualizacao): Promise<UsuarioGerenciado> {
  await buscarOperador(id);

  const campos: string[] = [];
  const valores: unknown[] = [];
  if (dados.nome !== undefined) {
    campos.push('nome = ?');
    valores.push(dados.nome);
  }
  if (dados.email !== undefined) {
    campos.push('email = ?');
    valores.push(dados.email);
  }
  if (dados.ativo !== undefined) {
    campos.push('ativo = ?');
    valores.push(dados.ativo ? 1 : 0);
  }

  if (campos.length > 0) {
    try {
      await pool.query(`UPDATE usuarios SET ${campos.join(', ')} WHERE id = ?`, [...valores, id]);
    } catch (err) {
      if (isDuplicateEmail(err)) throw badRequest('E-mail já cadastrado');
      throw err;
    }
  }

  return mapear(await buscarOperador(id));
}

// Exclusão definitiva do usuário (restrita ao Admin — a rota também exige o
// perfil). O que some junto, por FK ON DELETE CASCADE: `sessoes` do usuário —
// o histórico de uso dele sai das métricas do monitoramento retroativamente.
// O que NÃO some: `reset_senha_log` (SET NULL) nem os `veiculos` cadastrados
// por ele (usuario_id não é FK CASCADE — o cadastro do veículo é permanente,
// independente de quem o registrou continuar ativo no sistema).
export async function excluir(id: number, escopo: Escopo): Promise<void> {
  if (id === escopo.usuarioId) {
    throw badRequest('Você não pode excluir a própria conta');
  }
  await buscarOperador(id);
  await pool.query('DELETE FROM usuarios WHERE id = ?', [id]);
}

export interface ResultadoReset {
  usuario: UsuarioGerenciado;
  senhaTemporaria: string;
}

// Invalida a senha atual e força a definição de uma nova no próximo login —
// reaproveita o mecanismo de primeiro acesso (senha_definida = 0). Registra
// quem executou o reset em `reset_senha_log` (auditoria, sem PII extra).
export async function resetarSenha(id: number, escopo: Escopo): Promise<ResultadoReset> {
  if (id === escopo.usuarioId) {
    throw badRequest('Para trocar sua própria senha, use a opção "Minha senha"');
  }
  await buscarOperador(id);

  const senhaTemporaria = gerarSenhaTemporaria();
  const senhaHash = await bcrypt.hash(senhaTemporaria, 10);
  await pool.query('UPDATE usuarios SET senha_hash = ?, senha_definida = 0 WHERE id = ?', [senhaHash, id]);
  // Derruba TODAS as sessões abertas do alvo (sem exceção): o reset é a
  // resposta a "esta conta pode estar comprometida", então precisa expulsar
  // quem já estiver dentro — trocar o hash sozinho não invalidava o token.
  await encerrarSessoesDoUsuario(id);
  await pool.query('INSERT INTO reset_senha_log (usuario_id, executado_por) VALUES (?, ?)', [
    id,
    escopo.usuarioId,
  ]);

  const usuario = mapear(await buscarOperador(id));
  return { usuario, senhaTemporaria };
}
