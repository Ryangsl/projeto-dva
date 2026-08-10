import type { Request, Response } from 'express';
import { z } from 'zod';
import { badRequest } from '../../shared/http-error.js';
import * as veiculosService from './veiculos.service.js';

// Em multipart/form-data todo campo de texto chega como string — z.coerce
// converte os numéricos antes de validar.
const criarSchema = z.object({
  chassi: z.string().trim().min(5, 'Chassi inválido').max(32, 'Chassi inválido'),
  marcaId: z.coerce.number().int().positive('Selecione a marca'),
  modeloId: z.coerce.number().int().positive().optional(),
  corId: z.coerce.number().int().positive().optional(),
  centroDistribuicaoId: z.coerce.number().int().positive().optional(),
  destino: z.string().trim().max(160).optional(),
  observacoes: z.string().trim().max(4000).optional(),
});

function arquivosDoCorpo(req: Request): veiculosService.ArquivosVeiculo {
  const files = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
  return {
    fotos: files.fotos ?? [],
    video: files.video?.[0],
  };
}

export async function opcoes(_req: Request, res: Response): Promise<void> {
  res.json(await veiculosService.obterOpcoes());
}

export async function verificarChassi(req: Request, res: Response): Promise<void> {
  const chassi = String(req.params.chassi ?? '').trim();
  if (!chassi) throw badRequest('Chassi inválido');
  res.json({ existe: await veiculosService.chassiExiste(chassi) });
}

export async function criar(req: Request, res: Response): Promise<void> {
  const dados = criarSchema.parse(req.body);
  const u = req.user!;
  const veiculo = await veiculosService.criar(dados, arquivosDoCorpo(req), {
    sub: u.sub,
    perfil: u.perfil,
    centroDistribuicaoId: u.centroDistribuicaoId,
  });
  res.status(201).json({ veiculo });
}

const listarSchema = z.object({
  chassi: z.string().trim().optional(),
  marcaId: z.coerce.number().int().positive().optional(),
  centroDistribuicaoId: z.coerce.number().int().positive().optional(),
  pagina: z.coerce.number().int().positive().optional(),
  limite: z.coerce.number().int().positive().optional(),
});

export async function listar(req: Request, res: Response): Promise<void> {
  const filtros = listarSchema.parse(req.query);
  res.json(await veiculosService.listar(filtros));
}

export async function buscarPorId(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Id inválido');
  res.json({ veiculo: await veiculosService.buscarPorId(id) });
}
