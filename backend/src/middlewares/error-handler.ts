import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../shared/http-error.js';

// Middleware central de erros. Deve ser o último registrado no app.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Dados inválidos',
      detalhes: err.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message })),
    });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  console.error('Erro não tratado:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
}
