import { api } from './api';
import type { Atendimento } from '../modules/guia/guia.types';

// Metadados NÃO-identificáveis enviados para métricas de uso. Nunca inclui o
// nome do cliente nem qualquer dado pessoal — só o contexto do atendimento.
interface MetadadosAtendimento {
  marca: string | null;
  setor: string | null;
  canal: string | null;
  categoria: string | null;
  banco: string | null;
}

// UUID v4 para identificar o atendimento e ligar início↔conclusão. Usa a API
// nativa quando disponível; senão, um fallback (tablets em HTTP puro, fora de
// contexto seguro, podem não ter crypto.randomUUID).
export function gerarUuid(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // versão 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
    .slice(6, 8)
    .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

// Extrai do atendimento apenas os metadados de uso (sem PII).
export function metadadosDoAtendimento(a: Atendimento): MetadadosAtendimento {
  return {
    marca: a.fabricante?.nome ?? null,
    setor: a.setor,
    canal: a.canal,
    categoria: a.modelo?.categoria ?? null,
    banco: a.banco,
  };
}

// Registra o início do atendimento. Fire-and-forget: falha silenciosa para não
// afetar o fluxo offline-first do guia.
export function registrarInicio(uuid: string, meta: MetadadosAtendimento): void {
  void api.post('/monitoramento/atendimento/iniciar', { uuid, ...meta }).catch(() => {});
}

// Registra a conclusão (geração do guia). Fire-and-forget.
export function registrarConclusao(uuid: string, meta: MetadadosAtendimento): void {
  void api.post('/monitoramento/atendimento/concluir', { uuid, ...meta }).catch(() => {});
}
