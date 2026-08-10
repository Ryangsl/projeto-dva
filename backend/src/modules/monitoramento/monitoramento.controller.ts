import type { Request, Response } from 'express';
import { z } from 'zod';
import * as service from './monitoramento.service.js';

// Allowlist rígido dos campos aceitos. Chaves fora deste schema são DESCARTADAS
// (comportamento padrão do zod), garantindo que nenhum dado pessoal eventualmente
// enviado pelo front seja persistido — só metadados de uso entram no banco.
// O usuário e a sessão vêm do token (req.user), nunca do corpo.
const eventoSchema = z.object({
  uuid: z.string().uuid('uuid inválido'),
  marca: z.string().max(60).nullish(),
  setor: z.string().max(40).nullish(),
  canal: z.enum(['presencial', 'telefone']).nullish(),
  categoria: z.string().max(40).nullish(),
  banco: z.enum(['tecido', 'couro']).nullish(),
});

function parse(req: Request) {
  const { uuid, marca, setor, canal, categoria, banco } = eventoSchema.parse(req.body);
  return { uuid, meta: { marca, setor, canal, categoria, banco } };
}

export async function iniciar(req: Request, res: Response): Promise<void> {
  const { uuid, meta } = parse(req);
  await service.iniciarAtendimento(req.user!.sub, req.user!.sessaoId, uuid, meta);
  res.status(204).end();
}

export async function concluir(req: Request, res: Response): Promise<void> {
  const { uuid, meta } = parse(req);
  await service.concluirAtendimento(req.user!.sub, req.user!.sessaoId, uuid, meta);
  res.status(204).end();
}
