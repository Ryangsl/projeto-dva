import { api } from './api';

// Gerenciamento de usuários (só Admin). Único perfil gerido por esta tela —
// contas de admin não são geridas por aqui.
export type PerfilGerenciavel = 'operador';

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

export interface DadosCriacao {
  nome: string;
  email: string;
}

export interface DadosAtualizacao {
  nome?: string;
  email?: string;
  ativo?: boolean;
}

export async function listarUsuarios(): Promise<UsuarioGerenciado[]> {
  const { data } = await api.get<{ usuarios: UsuarioGerenciado[] }>('/usuarios');
  return data.usuarios;
}

export async function criarUsuario(
  dados: DadosCriacao,
): Promise<{ usuario: UsuarioGerenciado; senhaTemporaria: string }> {
  const { data } = await api.post<{ usuario: UsuarioGerenciado; senhaTemporaria: string }>(
    '/usuarios',
    dados,
  );
  return data;
}

export async function atualizarUsuario(
  id: number,
  dados: DadosAtualizacao,
): Promise<UsuarioGerenciado> {
  const { data } = await api.put<{ usuario: UsuarioGerenciado }>(`/usuarios/${id}`, dados);
  return data.usuario;
}

// Exclusão definitiva (só Admin). Irreversível: leva junto o histórico de
// sessões do usuário. O registro de auditoria de resets é preservado no
// servidor. Para bloqueio reversível, usar `ativo: false`.
export async function excluirUsuario(id: number): Promise<void> {
  await api.delete(`/usuarios/${id}`);
}

export async function resetarSenha(
  id: number,
): Promise<{ usuario: UsuarioGerenciado; senhaTemporaria: string }> {
  const { data } = await api.post<{ usuario: UsuarioGerenciado; senhaTemporaria: string }>(
    `/usuarios/${id}/resetar-senha`,
  );
  return data;
}
