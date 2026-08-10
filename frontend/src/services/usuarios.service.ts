import { api } from './api';
import type { Perfil } from '../types';

// Gerenciamento de usuários (Admin/Gestor). Perfil aqui nunca é 'admin' —
// contas de TI não são geridas por esta tela (senha trocada via SQL).
export type PerfilGerenciavel = Exclude<Perfil, 'admin'>;

export interface UsuarioGerenciado {
  id: number;
  nome: string;
  email: string;
  perfil: PerfilGerenciavel;
  // Loja única do Consultor (null p/ gestor).
  marca: string | null;
  // Lojas administradas pelo Gestor (vazio p/ consultor).
  marcas: string[];
  ativo: boolean;
  senhaDefinida: boolean;
  ultimoLogin: string | null;
  criadoEm: string;
}

export interface DadosCriacao {
  nome: string;
  email: string;
  perfil: PerfilGerenciavel;
  marca?: string;
  marcas?: string[];
}

export interface DadosAtualizacao {
  nome?: string;
  email?: string;
  ativo?: boolean;
  perfil?: PerfilGerenciavel;
  marca?: string;
  marcas?: string[];
}

export async function listarUsuarios(): Promise<UsuarioGerenciado[]> {
  const { data } = await api.get<{ usuarios: UsuarioGerenciado[] }>('/usuarios');
  return data.usuarios;
}

export async function buscarMarcasDisponiveis(): Promise<string[]> {
  const { data } = await api.get<{ marcas: string[] }>('/usuarios/marcas-disponiveis');
  return data.marcas;
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

// Exclusão definitiva (só Admin). Irreversível: leva junto o histórico de uso
// do usuário (sessões e atendimentos). O registro de auditoria de resets é
// preservado no servidor. Para bloqueio reversível, usar `ativo: false`.
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
