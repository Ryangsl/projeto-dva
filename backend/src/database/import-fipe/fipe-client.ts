// Cliente HTTP fino para a API pública da FIPE (v2), usado só pelos scripts
// de import-fipe (marcas-modelos.ts, anos.ts). `fetch` nativo (Node 18+) em
// vez de axios, para não somar dependência nova (CLAUDE.md §2 — leveza).
//
// v2 (fipe.parallelum.com.br/api/v2) substitui a v1 (parallelum.com.br/fipe)
// usada antes: não exige nenhuma autenticação para uso básico — o header
// `X-Subscription-Token` é OPCIONAL e só eleva o limite diário de 500 para
// 1000 requisições (cadastro gratuito em fipe.parallelum.com.br). Enviar
// qualquer coisa como `Authorization: Bearer` (como a v1 antiga exigia) faz a
// v2 responder 401 — por isso o token, quando presente, vai só no header
// dedicado, e a chamada funciona igual sem ele.
import { env } from '../../config/env.js';

const BASE_URL = 'https://fipe.parallelum.com.br/api/v2/cars';
const TIMEOUT_MS = 30_000;

export class FipeHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'FipeHttpError';
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Não lança: o token é opcional na v2. Retorna undefined se ausente, e os
// scripts apenas avisam no console (limite fica em 500 req/dia em vez de 1000).
export function obterFipeSubscriptionToken(): string | undefined {
  const token = env.fipe.subscriptionToken;
  return token && token.trim() !== '' ? token : undefined;
}

export async function fipeGet<T>(path: string): Promise<T> {
  const token = obterFipeSubscriptionToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resposta = await fetch(`${BASE_URL}${path}`, {
      headers: token ? { 'X-Subscription-Token': token } : undefined,
      signal: controller.signal,
    });

    if (!resposta.ok) {
      throw new FipeHttpError(resposta.status, `FIPE respondeu ${resposta.status} em ${path}`);
    }

    return (await resposta.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}
