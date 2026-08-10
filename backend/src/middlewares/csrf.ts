import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { forbidden } from '../shared/http-error.js';

// Métodos seguros não alteram estado → dispensam CSRF.
const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Proteção CSRF por double-submit token.
//
// CSRF só é explorável quando existe credencial ambiente (o cookie httpOnly de
// auth) que o navegador anexa automaticamente. Por isso:
//   - métodos seguros passam direto;
//   - requisições SEM o cookie de token passam direto (não há auth ambiente a
//     abusar — é o caso do próprio login, que autentica pelo corpo);
//   - as demais (mutantes e autenticadas) exigem que o header X-CSRF-Token seja
//     igual ao cookie de CSRF. Como o cookie é SameSite=Strict, um site atacante
//     não consegue lê-lo nem forjar o header → o pedido é barrado.
export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  if (METODOS_SEGUROS.has(req.method)) return next();

  const temTokenAuth = Boolean(req.cookies?.[env.cookies.token]);
  if (!temTokenAuth) return next();

  const cookieCsrf = req.cookies?.[env.cookies.csrf];
  const headerCsrf = req.headers['x-csrf-token'];
  const header = Array.isArray(headerCsrf) ? headerCsrf[0] : headerCsrf;

  if (!cookieCsrf || !header || cookieCsrf !== header) {
    return next(forbidden('Falha na verificação CSRF'));
  }
  next();
}
