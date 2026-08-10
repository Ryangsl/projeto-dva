import type { Request, Response } from 'express';
import { z } from 'zod';
import { badRequest } from '../../shared/http-error.js';
import * as usuariosService from './usuarios.service.js';

// Monta o escopo de permissão a partir do usuário autenticado (nunca do corpo
// da requisição).
function escopoDe(req: Request): usuariosService.Escopo {
  return { usuarioId: req.user!.sub };
}

function idDoParametro(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Id inválido');
  return id;
}

const criarSchema = z.object({
  nome: z.string().trim().min(2, 'Nome muito curto'),
  email: z.string().trim().email('E-mail inválido'),
});

const atualizarSchema = z.object({
  nome: z.string().trim().min(2, 'Nome muito curto').optional(),
  email: z.string().trim().email('E-mail inválido').optional(),
  ativo: z.boolean().optional(),
});

export async function listar(_req: Request, res: Response): Promise<void> {
  const usuarios = await usuariosService.listar();
  res.json({ usuarios });
}

export async function criar(req: Request, res: Response): Promise<void> {
  const dados = criarSchema.parse(req.body);
  const resultado = await usuariosService.criar(dados);
  res.status(201).json(resultado);
}

export async function atualizar(req: Request, res: Response): Promise<void> {
  const id = idDoParametro(req);
  const dados = atualizarSchema.parse(req.body);
  const usuario = await usuariosService.atualizar(id, dados);
  res.json({ usuario });
}

export async function excluir(req: Request, res: Response): Promise<void> {
  const id = idDoParametro(req);
  await usuariosService.excluir(id, escopoDe(req));
  res.status(204).end();
}

export async function resetarSenha(req: Request, res: Response): Promise<void> {
  const id = idDoParametro(req);
  const resultado = await usuariosService.resetarSenha(id, escopoDe(req));
  res.json(resultado);
}
