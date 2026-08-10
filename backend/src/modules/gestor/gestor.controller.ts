import type { Request, Response } from 'express';
import { z } from 'zod';
import * as gestorService from './gestor.service.js';

// Escopo de lojas do chamador, sempre derivado do token (nunca da query):
// Admin (null) enxerga todas as lojas; Gestor, apenas as que administra.
function escopoMarcas(req: Request): gestorService.EscopoMarcas {
  const u = req.user!;
  return u.perfil === 'gestor' ? u.marcas : null;
}

// Período aceito para os indicadores (7/30/60 dias — limitado à retenção).
const PERIODOS = [7, 30, 60] as const;

const dashboardSchema = z.object({
  dias: z.coerce
    .number()
    .refine((d): d is (typeof PERIODOS)[number] => (PERIODOS as readonly number[]).includes(d), {
      message: 'Período inválido (use 7, 30 ou 60)',
    })
    .default(30),
});

export async function dashboard(req: Request, res: Response): Promise<void> {
  const { dias } = dashboardSchema.parse(req.query);
  const dados = await gestorService.obterDashboard(dias, escopoMarcas(req));
  res.json(dados);
}

const consultoresSchema = z.object({
  dias: z.coerce.number().pipe(z.union([z.literal(7), z.literal(30), z.literal(60)])).default(30),
  ordenar: z.enum(['mais_usam', 'sem_uso', 'nome']).default('mais_usam'),
  pagina: z.coerce.number().int().positive().default(1),
  limite: z.coerce.number().int().positive().max(100).default(20),
});

export async function consultores(req: Request, res: Response): Promise<void> {
  const opts = consultoresSchema.parse(req.query);
  const lista = await gestorService.obterConsultores({ ...opts, marcas: escopoMarcas(req) });
  res.json(lista);
}

// Mantido por compatibilidade (lista completa, online primeiro).
export async function uso(req: Request, res: Response): Promise<void> {
  const usuarios = await gestorService.obterUso(escopoMarcas(req));
  res.json({ usuarios });
}
