import { api } from './api';
import type { GuiaDados } from '../modules/guia/guia.types';

// O conteúdo do guia varia por usuário (concessionária vê só a própria marca),
// então o cache é separado por id de usuário.
function cacheKey(usuarioId: number): string {
  return `procar.guia.dados.${usuarioId}`;
}

// Leitura instantânea do cache (usada para exibir algo na hora, mesmo offline).
export function lerGuiaCache(usuarioId: number): GuiaDados | null {
  const cache = localStorage.getItem(cacheKey(usuarioId));
  if (!cache) return null;
  try {
    return JSON.parse(cache) as GuiaDados;
  } catch {
    localStorage.removeItem(cacheKey(usuarioId));
    return null;
  }
}

// Descarta o cache do usuário. Chamado no logout: o conteúdo do guia é
// material comercial da loja (preços, argumentos, política de objeções) e não
// pode sobreviver à sessão num tablet compartilhado de balcão.
export function limparGuiaCache(usuarioId: number): void {
  localStorage.removeItem(cacheKey(usuarioId));
}

// Busca da rede e atualiza o cache. Fonte da verdade quando há internet.
export async function buscarGuia(usuarioId: number): Promise<GuiaDados> {
  const { data } = await api.get<GuiaDados>('/guia/dados');
  localStorage.setItem(cacheKey(usuarioId), JSON.stringify(data));
  return data;
}
