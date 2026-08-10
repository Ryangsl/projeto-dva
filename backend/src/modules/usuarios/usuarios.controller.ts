import type { Request, Response } from 'express';
import { z } from 'zod';
import { badRequest } from '../../shared/http-error.js';
import * as usuariosService from './usuarios.service.js';

// Monta o escopo de permissão a partir do usuário autenticado (nunca do corpo
// da requisição) — quem pode gerenciar quem é decidido no service a partir daqui.
function escopoDe(req: Request): usuariosService.Escopo {
  const u = req.user!;
  return { usuarioId: u.sub, perfil: u.perfil as 'admin' | 'gestor', marcas: u.marcas };
}

function idDoParametro(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Id inválido');
  return id;
}

const marcaValida = z
  .string()
  .trim()
  .refine((m) => usuariosService.marcasDisponiveis().includes(m), 'Loja inválida');

const criarSchema = z.object({
  nome: z.string().trim().min(2, 'Nome muito curto'),
  email: z.string().trim().email('E-mail inválido'),
  perfil: z.enum(['consultor', 'gestor']).default('consultor'),
  // Consultor (única loja) ou Gestor criado por Gestor (escolhe uma das suas).
  marca: marcaValida.optional(),
  // Gestor criado por Admin: uma ou mais lojas.
  marcas: z.array(marcaValida).optional(),
});

const atualizarSchema = z.object({
  nome: z.string().trim().min(2, 'Nome muito curto').optional(),
  email: z.string().trim().email('E-mail inválido').optional(),
  ativo: z.boolean().optional(),
  perfil: z.enum(['consultor', 'gestor']).optional(),
  marca: marcaValida.optional(),
  marcas: z.array(marcaValida).optional(),
});

export async function listar(req: Request, res: Response): Promise<void> {
  const usuarios = await usuariosService.listar(escopoDe(req));
  res.json({ usuarios });
}

export async function marcas(_req: Request, res: Response): Promise<void> {
  res.json({ marcas: usuariosService.marcasDisponiveis() });
}

export async function criar(req: Request, res: Response): Promise<void> {
  const dados = criarSchema.parse(req.body);
  const resultado = await usuariosService.criar(dados, escopoDe(req));
  res.status(201).json(resultado);
}

export async function atualizar(req: Request, res: Response): Promise<void> {
  const id = idDoParametro(req);
  const dados = atualizarSchema.parse(req.body);
  const usuario = await usuariosService.atualizar(id, dados, escopoDe(req));
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
