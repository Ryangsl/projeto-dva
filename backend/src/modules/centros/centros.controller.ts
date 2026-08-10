import type { Request, Response } from 'express';
import { z } from 'zod';
import { badRequest } from '../../shared/http-error.js';
import * as centrosService from './centros.service.js';

function idDoParametro(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Id inválido');
  return id;
}

const criarSchema = z.object({
  nome: z.string().trim().min(2, 'Nome muito curto'),
});

const atualizarSchema = z.object({
  nome: z.string().trim().min(2, 'Nome muito curto').optional(),
  ativo: z.boolean().optional(),
});

export async function listar(_req: Request, res: Response): Promise<void> {
  res.json({ centros: await centrosService.listar() });
}

export async function criar(req: Request, res: Response): Promise<void> {
  const { nome } = criarSchema.parse(req.body);
  const centro = await centrosService.criar(nome);
  res.status(201).json({ centro });
}

export async function atualizar(req: Request, res: Response): Promise<void> {
  const id = idDoParametro(req);
  const dados = atualizarSchema.parse(req.body);
  const centro = await centrosService.atualizar(id, dados);
  res.json({ centro });
}
