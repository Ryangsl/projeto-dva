import { api } from './api';
import type { Usuario } from '../types';

// O token (e o id da sessão) vivem apenas no cookie httpOnly, inacessível ao JS.
// O front guarda só os dados públicos do usuário e o flag de primeiro acesso.
export interface SessaoLogin {
  usuario: Usuario;
  mustChangePassword: boolean;
}

export async function login(email: string, senha: string): Promise<SessaoLogin> {
  const { data } = await api.post<SessaoLogin>('/auth/login', { email, senha });
  return data;
}

// Restaura a sessão perguntando ao backend quem sou eu (o cookie httpOnly é
// enviado automaticamente). Retorna null se não houver sessão válida.
export async function me(): Promise<{ usuario: Usuario; mustChangePassword: boolean } | null> {
  try {
    const { data } = await api.get<{ usuario: Usuario; mustChangePassword: boolean }>('/auth/me');
    return data;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } catch {
    // Mesmo se falhar, o front limpa o estado local.
  }
}

// Primeiro acesso / troca de senha. Reemite o cookie já liberado.
export async function definirSenha(
  senhaAtual: string,
  novaSenha: string,
): Promise<{ usuario: Usuario }> {
  const { data } = await api.post<{ usuario: Usuario }>('/auth/senha', { senhaAtual, novaSenha });
  return data;
}

// Heartbeat de atividade: avança o "tempo logado" e renova o cookie do token
// (sessão deslizante). A sessão vem do próprio token. Falha silenciosa: se
// estiver offline, o guia continua funcionando.
export async function registrarAtividade(): Promise<void> {
  try {
    await api.post('/auth/atividade');
  } catch {
    // Sem rede no momento — o heartbeat seguinte tenta de novo.
  }
}
