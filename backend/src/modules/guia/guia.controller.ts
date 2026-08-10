import type { Request, Response } from 'express';
import * as guiaService from './guia.service.js';

export async function dados(req: Request, res: Response): Promise<void> {
  // Consultor recebe só a própria marca; Gestor, as lojas que administra;
  // Admin (sem restrição) recebe todas as marcas principais.
  const u = req.user;
  const marcas = u?.perfil === 'gestor' ? u.marcas : u?.marca ? [u.marca] : null;
  const dados = await guiaService.obterDados(marcas);
  res.json(dados);
}
