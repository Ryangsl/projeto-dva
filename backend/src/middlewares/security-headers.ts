import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';

// Headers de segurança aplicados a todas as respostas da API.
//
// Escritos à mão (em vez de `helmet`) pelo mesmo racional do csrf.ts e do
// login-throttle.ts: são poucas linhas, sem dependência nova, e mantêm o
// requisito de leveza (§2 do CLAUDE.md).
//
// IMPORTANTE: esta é a camada da API. O frontend é servido pelo Nginx, que
// precisa emitir os seus próprios headers (inclusive o CSP, que só faz sentido
// para quem entrega HTML) — ver DEPLOY.md §10.1.
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  // Impede o navegador de "adivinhar" o tipo do conteúdo (MIME sniffing).
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // A API nunca deve ser renderizada dentro de um frame.
  res.setHeader('X-Frame-Options', 'DENY');
  // Não vazar a URL completa (com ids) para destinos externos.
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Respostas de API não são para ser embutidas por outras origens.
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  // Remove a impressão digital do Express (não é segurança, mas não ajuda o atacante).
  res.removeHeader('X-Powered-By');

  // HSTS só faz sentido sobre HTTPS: em HTTP puro o navegador ignora, e num
  // servidor local sem TLS anunciá-lo poderia inviabilizar o acesso.
  if (env.cookies.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
}
