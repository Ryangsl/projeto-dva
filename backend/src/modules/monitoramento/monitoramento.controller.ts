import type { Request, Response } from 'express';
import { z } from 'zod';
import * as monitoramentoService from './monitoramento.service.js';

const dashboardSchema = z.object({
  dias: z.coerce.number().int().refine((v) => [7, 30, 60].includes(v), 'Período inválido').default(30),
});

export async function dashboard(req: Request, res: Response): Promise<void> {
  const { dias } = dashboardSchema.parse(req.query);
  res.json(await monitoramentoService.obterDashboard(dias));
}
