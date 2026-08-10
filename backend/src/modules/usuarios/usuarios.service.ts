import bcrypt from 'bcryptjs';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../../config/database.js';
import { badRequest, forbidden, notFound } from '../../shared/http-error.js';
import { gerarSenhaTemporaria } from '../../shared/senha.js';
import { encerrarSessoesDoUsuario } from '../auth/auth.service.js';
import { MARCAS_PRINCIPAIS } from '../guia/marcas-principais.js';

// Perfis geridos por este módulo — contas 'admin' (TI) nunca são alvo aqui:
// a senha do Admin é trocada manualmente via SQL, sem fluxo no app.
export type PerfilGerenciavel = 'consultor' | 'gestor';

// Quem está chamando: Admin enxerga tudo; Gestor só as próprias lojas (marcas
// que administra — pode ser mais de uma).
export interface Escopo {
  usuarioId: number;
  perfil: 'admin' | 'gestor';
  marcas: string[];
}

export interface UsuarioGerenciado {
  id: number;
  nome: string;
  email: string;
  perfil: PerfilGerenciavel;
  // Loja única do Consultor (null p/ gestor — ele usa `marcas`).
  marca: string | null;
  // Lojas administradas pelo Gestor (vazio p/ consultor).
  marcas: string[];
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
  marca: string | null;
  ativo: number;
  senha_definida: number;
  ultimo_login: string | null;
  created_at: string;
}

const CAMPOS = 'id, nome, email, perfil, marca, ativo, senha_definida, ultimo_login, created_at';

function mapear(r: UsuarioRow): UsuarioGerenciado {
  return {
    id: r.id,
    nome: r.nome,
    email: r.email,
    perfil: r.perfil,
    marca: r.marca,
    marcas: [],
    ativo: Boolean(r.ativo),
    senhaDefinida: Boolean(r.senha_definida),
    ultimoLogin: r.ultimo_login,
    criadoEm: r.created_at,
  };
}

function isDuplicateEmail(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ER_DUP_ENTRY';
}

// Lojas administradas por um Gestor (tabela `usuario_marcas`).
async function marcasDoGestor(usuarioId: number): Promise<string[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT marca FROM usuario_marcas WHERE usuario_id = ? ORDER BY marca',
    [usuarioId],
  );
  return rows.map((r) => r.marca as string);
}

async function substituirMarcasDoGestor(usuarioId: number, marcas: string[]): Promise<void> {
  await pool.query('DELETE FROM usuario_marcas WHERE usuario_id = ?', [usuarioId]);
  if (marcas.length === 0) return;
  await pool.query(
    `INSERT INTO usuario_marcas (usuario_id, marca) VALUES ${marcas.map(() => '(?, ?)').join(', ')}`,
    marcas.flatMap((m) => [usuarioId, m]),
  );
}

// Anexa as lojas administradas às linhas de Gestor de uma lista (1 query extra
// no total, não por linha) — Consultor não precisa (usa só `marca`).
async function anexarMarcas(usuarios: UsuarioGerenciado[]): Promise<UsuarioGerenciado[]> {
  const idsGestores = usuarios.filter((u) => u.perfil === 'gestor').map((u) => u.id);
  if (idsGestores.length === 0) return usuarios;
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT usuario_id, marca FROM usuario_marcas WHERE usuario_id IN (?) ORDER BY marca',
    [idsGestores],
  );
  const porUsuario = new Map<number, string[]>();
  for (const r of rows as { usuario_id: number; marca: string }[]) {
    const lista = porUsuario.get(r.usuario_id) ?? [];
    lista.push(r.marca);
    porUsuario.set(r.usuario_id, lista);
  }
  return usuarios.map((u) => (u.perfil === 'gestor' ? { ...u, marcas: porUsuario.get(u.id) ?? [] } : u));
}

// Reexportado para não quebrar quem já importava daqui (a implementação vive
// em shared/senha.ts, para o db:setup poder usá-la sem carregar o pool).
export { gerarSenhaTemporaria };

export function marcasDisponiveis(): string[] {
  return MARCAS_PRINCIPAIS;
}

// Lista os usuários geridos pelo escopo de quem pediu: Admin vê todos os
// consultores/gestores (contas admin nunca aparecem); Gestor só os
// consultores das lojas que administra.
export async function listar(escopo: Escopo): Promise<UsuarioGerenciado[]> {
  if (escopo.perfil === 'admin') {
    const [rows] = await pool.query<UsuarioRow[]>(
      `SELECT ${CAMPOS} FROM usuarios WHERE perfil IN ('consultor','gestor') ORDER BY nome`,
    );
    return anexarMarcas(rows.map(mapear));
  }
  if (escopo.marcas.length === 0) return [];
  const [rows] = await pool.query<UsuarioRow[]>(
    `SELECT ${CAMPOS} FROM usuarios WHERE perfil = 'consultor' AND marca IN (?) ORDER BY nome`,
    [escopo.marcas],
  );
  return rows.map(mapear);
}

// Busca o usuário garantindo que está dentro do escopo de quem gerencia.
// Fora do escopo do Gestor = tratado como inexistente (não confirma a
// existência de contas de outra loja).
async function buscarNoEscopo(id: number, escopo: Escopo): Promise<UsuarioRow> {
  const [rows] = await pool.query<UsuarioRow[]>(`SELECT ${CAMPOS} FROM usuarios WHERE id = ? LIMIT 1`, [id]);
  const usuario = rows[0];
  if (!usuario) throw notFound('Usuário não encontrado');
  if (usuario.perfil !== 'consultor' && usuario.perfil !== 'gestor') {
    throw forbidden('Contas de administrador (TI) não são gerenciadas por aqui');
  }
  if (
    escopo.perfil === 'gestor' &&
    (usuario.perfil !== 'consultor' || !usuario.marca || !escopo.marcas.includes(usuario.marca))
  ) {
    throw notFound('Usuário não encontrado');
  }
  return usuario;
}

export interface DadosCriacao {
  nome: string;
  email: string;
  perfil: PerfilGerenciavel;
  // Consultor: uma loja. Gestor: uma ou mais (só Admin define; Gestor sempre
  // cria Consultor e escolhe UMA das lojas que ele próprio administra).
  marca?: string;
  marcas?: string[];
}

export interface ResultadoCriacao {
  usuario: UsuarioGerenciado;
  senhaTemporaria: string;
}

// Cria um novo Consultor/Gestor. Gestor só cria Consultor numa das lojas que
// administra — perfil enviado pelo cliente é ignorado e forçado no servidor.
export async function criar(dados: DadosCriacao, escopo: Escopo): Promise<ResultadoCriacao> {
  let perfil: PerfilGerenciavel;
  let marca: string | null = null;
  let marcasGestor: string[] = [];

  if (escopo.perfil === 'gestor') {
    if (escopo.marcas.length === 0) throw forbidden('Sua conta de gestor não tem loja associada');
    if (!dados.marca || !escopo.marcas.includes(dados.marca)) {
      throw badRequest('Selecione uma das lojas que você administra');
    }
    perfil = 'consultor';
    marca = dados.marca;
  } else {
    perfil = dados.perfil;
    if (perfil === 'consultor') {
      if (!dados.marca) throw badRequest('Selecione a loja (marca) do usuário');
      marca = dados.marca;
    } else {
      if (!dados.marcas || dados.marcas.length === 0) {
        throw badRequest('Selecione ao menos uma loja para o gestor');
      }
      marcasGestor = dados.marcas;
    }
  }

  const senhaTemporaria = gerarSenhaTemporaria();
  const senhaHash = await bcrypt.hash(senhaTemporaria, 10);

  let insertId: number;
  try {
    const [resultado] = await pool.query<ResultSetHeader>(
      'INSERT INTO usuarios (nome, email, senha_hash, perfil, marca, senha_definida) VALUES (?, ?, ?, ?, ?, 0)',
      [dados.nome, dados.email, senhaHash, perfil, marca],
    );
    insertId = resultado.insertId;
  } catch (err) {
    if (isDuplicateEmail(err)) throw badRequest('E-mail já cadastrado');
    throw err;
  }

  if (marcasGestor.length > 0) {
    await substituirMarcasDoGestor(insertId, marcasGestor);
  }

  const [rows] = await pool.query<UsuarioRow[]>(`SELECT ${CAMPOS} FROM usuarios WHERE id = ?`, [insertId]);
  const usuario = mapear(rows[0]);
  usuario.marcas = marcasGestor;
  return { usuario, senhaTemporaria };
}

export interface DadosAtualizacao {
  nome?: string;
  email?: string;
  ativo?: boolean;
  // Só efetivos quando quem chama é Admin — Gestor não altera permissões
  // nem move um consultor para outra loja.
  perfil?: PerfilGerenciavel;
  marca?: string; // consultor
  marcas?: string[]; // gestor
}

export async function atualizar(
  id: number,
  dados: DadosAtualizacao,
  escopo: Escopo,
): Promise<UsuarioGerenciado> {
  const atual = await buscarNoEscopo(id, escopo);

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

  let perfilFinal: PerfilGerenciavel = atual.perfil;
  if (escopo.perfil === 'admin') {
    if (dados.perfil !== undefined) {
      perfilFinal = dados.perfil;
      campos.push('perfil = ?');
      valores.push(dados.perfil);
    }

    if (perfilFinal === 'consultor') {
      if (dados.marca !== undefined) {
        campos.push('marca = ?');
        valores.push(dados.marca);
      }
      // Deixou de ser gestor (ou já era consultor): sem lojas na tabela nova.
      if (dados.perfil === 'consultor') {
        await pool.query('DELETE FROM usuario_marcas WHERE usuario_id = ?', [id]);
      }
    } else {
      const virandoGestor = dados.perfil === 'gestor';
      if (virandoGestor) {
        campos.push('marca = NULL');
        if (!dados.marcas || dados.marcas.length === 0) {
          throw badRequest('Selecione ao menos uma loja para o gestor');
        }
      }
      if (dados.marcas !== undefined) {
        if (dados.marcas.length === 0) throw badRequest('Selecione ao menos uma loja para o gestor');
        await substituirMarcasDoGestor(id, dados.marcas);
      }
    }
  }

  if (campos.length > 0) {
    try {
      await pool.query(`UPDATE usuarios SET ${campos.join(', ')} WHERE id = ?`, [...valores, id]);
    } catch (err) {
      if (isDuplicateEmail(err)) throw badRequest('E-mail já cadastrado');
      throw err;
    }
  }

  const [rows] = await pool.query<UsuarioRow[]>(`SELECT ${CAMPOS} FROM usuarios WHERE id = ?`, [id]);
  const usuario = mapear(rows[0]);
  if (usuario.perfil === 'gestor') usuario.marcas = await marcasDoGestor(id);
  return usuario;
}

// Exclusão definitiva do usuário. Restrita ao Admin (a rota também exige o
// perfil) — Gestor continua limitado a desativar, que é reversível.
//
// O que some junto, por FK ON DELETE CASCADE: `sessoes`, `atendimentos` e
// `usuario_marcas` do usuário — ou seja, o histórico de uso dele sai das
// métricas do dashboard retroativamente. O que NÃO some: `reset_senha_log`,
// cujas FKs são SET NULL justamente para que excluir alguém não apague a
// evidência de resets de senha (ver schema.sql).
export async function excluir(id: number, escopo: Escopo): Promise<void> {
  if (escopo.perfil !== 'admin') {
    throw forbidden('Apenas o administrador (TI) pode excluir usuários');
  }
  if (id === escopo.usuarioId) {
    throw badRequest('Você não pode excluir a própria conta');
  }
  // Reusa o escopo: garante que o alvo existe e que NÃO é uma conta admin
  // (contas de TI não são geridas por esta API).
  await buscarNoEscopo(id, escopo);

  // As sessões do alvo somem por cascata, e como o middleware valida a sessão
  // a cada requisição, quem estiver logado nessa conta perde o acesso na hora.
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
  await buscarNoEscopo(id, escopo);

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

  const [rows] = await pool.query<UsuarioRow[]>(`SELECT ${CAMPOS} FROM usuarios WHERE id = ?`, [id]);
  const usuario = mapear(rows[0]);
  if (usuario.perfil === 'gestor') usuario.marcas = await marcasDoGestor(id);
  return { usuario, senhaTemporaria };
}
