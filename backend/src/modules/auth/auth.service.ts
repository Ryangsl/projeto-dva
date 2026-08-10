import bcrypt from 'bcryptjs';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../../config/database.js';
import { badRequest, unauthorized } from '../../shared/http-error.js';
import type { Perfil } from '../../middlewares/auth.js';

interface UsuarioRow extends RowDataPacket {
  id: number;
  nome: string;
  email: string;
  senha_hash: string;
  perfil: Perfil;
  centro_distribuicao_id: number | null;
  centro_distribuicao_nome: string | null;
  senha_definida: number;
  ativo: number;
}

const SELECT_USUARIO = `
  SELECT u.id, u.nome, u.email, u.senha_hash, u.perfil, u.centro_distribuicao_id,
         c.nome AS centro_distribuicao_nome, u.senha_definida, u.ativo
    FROM usuarios u
    LEFT JOIN centros_distribuicao c ON c.id = u.centro_distribuicao_id
`;

// `centroDistribuicaoId` restringe o Operador ao centro de onde ele cadastra
// veículos (NULL = Admin, sem restrição).
export interface UsuarioPublico {
  id: number;
  nome: string;
  email: string;
  perfil: Perfil;
  centroDistribuicaoId: number | null;
  centroDistribuicaoNome: string | null;
  senhaDefinida: boolean;
}

export interface ResultadoLogin {
  usuario: UsuarioPublico;
  sessaoId: number;
}

function mapear(r: UsuarioRow): UsuarioPublico {
  return {
    id: r.id,
    nome: r.nome,
    email: r.email,
    perfil: r.perfil,
    centroDistribuicaoId: r.centro_distribuicao_id,
    centroDistribuicaoNome: r.centro_distribuicao_nome,
    senhaDefinida: Boolean(r.senha_definida),
  };
}

// Autentica validando e-mail/senha no banco (bcrypt). A emissão do JWT e dos
// cookies (httpOnly + CSRF) acontece no controller, que tem acesso ao `res`.
// Cada login registra usuarios.ultimo_login e abre uma linha em `sessoes` — o
// tempo logado é medido pelo heartbeat (registrarAtividade).
export async function login(email: string, senha: string): Promise<ResultadoLogin> {
  const [rows] = await pool.query<UsuarioRow[]>(`${SELECT_USUARIO} WHERE u.email = ? LIMIT 1`, [email]);
  const usuario = rows[0];
  if (!usuario || !usuario.ativo) {
    throw unauthorized('Credenciais inválidas');
  }

  const ok = await bcrypt.compare(senha, usuario.senha_hash);
  if (!ok) {
    throw unauthorized('Credenciais inválidas');
  }

  await pool.query('UPDATE usuarios SET ultimo_login = NOW() WHERE id = ?', [usuario.id]);
  const [sessao] = await pool.query<ResultSetHeader>(
    'INSERT INTO sessoes (usuario_id) VALUES (?)',
    [usuario.id],
  );

  return { usuario: mapear(usuario), sessaoId: sessao.insertId };
}

// Primeiro acesso / troca de senha: valida a senha atual, aplica a nova e marca
// senha_definida = 1 (concluindo o primeiro acesso). A política da nova senha é
// validada no controller (zod). Retorna o usuário atualizado para reemitir o token.
export async function definirSenha(
  usuarioId: number,
  senhaAtual: string,
  novaSenha: string,
): Promise<UsuarioPublico> {
  const [rows] = await pool.query<UsuarioRow[]>(`${SELECT_USUARIO} WHERE u.id = ? LIMIT 1`, [usuarioId]);
  const usuario = rows[0];
  if (!usuario || !usuario.ativo) {
    throw unauthorized('Sessão inválida');
  }

  const ok = await bcrypt.compare(senhaAtual, usuario.senha_hash);
  if (!ok) {
    throw badRequest('Senha atual incorreta');
  }
  // Impede "trocar" a senha por ela mesma (a temporária continuaria válida).
  if (await bcrypt.compare(novaSenha, usuario.senha_hash)) {
    throw badRequest('A nova senha deve ser diferente da atual');
  }

  const novoHash = await bcrypt.hash(novaSenha, 10);
  await pool.query('UPDATE usuarios SET senha_hash = ?, senha_definida = 1 WHERE id = ?', [
    novoHash,
    usuarioId,
  ]);

  return { ...mapear(usuario), senhaDefinida: true };
}

// Heartbeat: o frontend chama periodicamente enquanto o operador está ativo;
// o intervalo entre `inicio` e `ultimo_visto` é o tempo logado da sessão.
export async function registrarAtividade(usuarioId: number, sessaoId: number): Promise<void> {
  await pool.query('UPDATE sessoes SET ultimo_visto = NOW() WHERE id = ? AND usuario_id = ?', [
    sessaoId,
    usuarioId,
  ]);
}

// Teto ABSOLUTO da sessão: a renovação deslizante do heartbeat não pode
// prolongar uma sessão indefinidamente. Após este prazo desde o login, é
// preciso autenticar de novo — mesmo com atividade contínua.
export const SESSAO_MAXIMA_HORAS = 12;

// A sessão do token ainda vale? Confere que ela existe, pertence ao usuário,
// não foi encerrada (logout/troca/reset de senha) e não estourou o teto
// absoluto. É o que permite revogar um token antes de ele expirar sozinho.
export async function sessaoValida(sessaoId: number, usuarioId: number): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 FROM sessoes
      WHERE id = ? AND usuario_id = ? AND encerrada_em IS NULL
        AND inicio >= (NOW() - INTERVAL ? HOUR)
      LIMIT 1`,
    [sessaoId, usuarioId, SESSAO_MAXIMA_HORAS],
  );
  return rows.length > 0;
}

// Encerra uma sessão específica (logout).
export async function encerrarSessao(sessaoId: number, usuarioId: number): Promise<void> {
  await pool.query(
    'UPDATE sessoes SET encerrada_em = NOW() WHERE id = ? AND usuario_id = ? AND encerrada_em IS NULL',
    [sessaoId, usuarioId],
  );
}

// Encerra todas as sessões abertas de um usuário. `exceto` preserva a sessão
// corrente — usado na troca de senha voluntária, para não deslogar quem acabou
// de trocar. No reset feito pelo Admin não há exceção: o objetivo é
// justamente derrubar quem estiver com a conta.
export async function encerrarSessoesDoUsuario(usuarioId: number, exceto?: number): Promise<void> {
  if (exceto) {
    await pool.query(
      'UPDATE sessoes SET encerrada_em = NOW() WHERE usuario_id = ? AND encerrada_em IS NULL AND id <> ?',
      [usuarioId, exceto],
    );
    return;
  }
  await pool.query(
    'UPDATE sessoes SET encerrada_em = NOW() WHERE usuario_id = ? AND encerrada_em IS NULL',
    [usuarioId],
  );
}

// Usado pelo middleware para resolver o usuário autenticado a cada requisição.
export async function buscarUsuarioPorId(id: number): Promise<UsuarioPublico | null> {
  const [rows] = await pool.query<UsuarioRow[]>(`${SELECT_USUARIO} WHERE u.id = ? LIMIT 1`, [id]);
  const usuario = rows[0];
  if (!usuario || !usuario.ativo) return null;
  return mapear(usuario);
}
