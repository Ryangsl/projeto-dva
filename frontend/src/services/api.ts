import axios from 'axios';

// Autenticação por cookie httpOnly: o token não é acessível ao JS. Enviamos os
// cookies em toda requisição com withCredentials, e ecoamos o token de CSRF
// (cookie legível) no header X-CSRF-Token nas requisições mutantes (double-submit).
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3333/api',
  withCredentials: true,
});

const CSRF_COOKIE = 'procar_csrf';
const METODOS_SEGUROS = new Set(['get', 'head', 'options']);

function lerCookie(nome: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${nome}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// Anexa o header CSRF nas requisições que alteram estado.
api.interceptors.request.use((config) => {
  const metodo = (config.method ?? 'get').toLowerCase();
  if (!METODOS_SEGUROS.has(metodo)) {
    const csrf = lerCookie(CSRF_COOKIE);
    if (csrf) config.headers['X-CSRF-Token'] = csrf;
  }
  return config;
});

// Handler global de sessão inválida: quando o backend responde 401, a sessão
// expirou/foi revogada. Notifica quem estiver ouvindo (AuthContext) para deslogar.
type Ouvinte = () => void;
const ouvintesNaoAutorizado = new Set<Ouvinte>();

export function onNaoAutorizado(fn: Ouvinte): () => void {
  ouvintesNaoAutorizado.add(fn);
  return () => ouvintesNaoAutorizado.delete(fn);
}

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401) {
      ouvintesNaoAutorizado.forEach((fn) => fn());
    }
    return Promise.reject(error);
  },
);
