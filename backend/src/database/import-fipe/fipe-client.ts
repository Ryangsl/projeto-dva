// Cliente HTTP fino para a API pública da FIPE, usado só pelos scripts de
// import-fipe (marcas-modelos.ts, anos.ts). `fetch` nativo (Node 18+) em vez
// de axios, para não somar dependência nova (CLAUDE.md §2 — leveza).
import { env } from '../../config/env.js';

const BASE_URL = 'https://parallelum.com.br/fipe/api/v1/carros';
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

export function exigirFipeApiKey(): string {
  const apiKey = env.fipe.apiKey;
  if (!apiKey) {
    throw new Error(
      'FIPE_API_KEY ausente no .env — necessária para rodar os scripts de import-fipe.',
    );
  }
  return apiKey;
}

export async function fipeGet<T>(path: string): Promise<T> {
  const apiKey = exigirFipeApiKey();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resposta = await fetch(`${BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
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
