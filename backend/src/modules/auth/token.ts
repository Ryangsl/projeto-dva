import { randomBytes } from 'node:crypto';
import type { Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import type { Perfil } from '../../middlewares/auth.js';

// Conteúdo do JWT de acesso. `sd` (senha_definida) viaja no token para o front
// saber, sem chamada extra, se o usuário ainda precisa concluir o primeiro
// acesso. `sid` é o id da sessão aberta no login: o heartbeat o lê do token
// (não do corpo), então o front não precisa guardá-lo e reloads são transparentes.
export interface TokenPayload {
  sub: number;
  nome: string;
  perfil: Perfil;
  marca: string | null;
  sd: boolean;
  sid: number;
}

// Opções base do cookie de autenticação: httpOnly (imune a XSS), SameSite=Strict
// (o navegador não envia em requisições de outros sites → base da proteção CSRF)
// e Secure em produção. SEM maxAge/expires → cookie de sessão: morre ao fechar o
// navegador, preservando o requisito do tablet compartilhado (não manter logado).
function opcoesCookieBase() {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: env.cookies.secure,
    path: '/',
  };
}

export function assinarToken(payload: TokenPayload): string {
  const opcoes: jwt.SignOptions = {
    expiresIn: env.jwt.expiresIn as jwt.SignOptions['expiresIn'],
  };
  return jwt.sign(payload, env.jwt.secret, opcoes);
}

export function verificarToken(token: string): TokenPayload | null {
  try {
    // `algorithms` explícito: nunca aceitar 'none' nem troca de família de
    // algoritmo, independentemente do default da biblioteca.
    const decoded = jwt.verify(token, env.jwt.secret, { algorithms: ['HS256'] });
    if (typeof decoded === 'string') return null;
    return decoded as unknown as TokenPayload;
  } catch {
    return null;
  }
}

// Emite (ou renova) o cookie httpOnly do token. Quando `csrf` é fornecido,
// também (re)emite o cookie de CSRF legível — no login geramos um novo; nas
// renovações do heartbeat mantemos o existente (não passamos `csrf`).
export function definirCookiesAuth(res: Response, payload: TokenPayload, csrf?: string): void {
  res.cookie(env.cookies.token, assinarToken(payload), opcoesCookieBase());
  if (csrf) {
    // Cookie de CSRF é legível pelo JS (httpOnly: false) para o front ecoá-lo
    // no header X-CSRF-Token (double-submit). SameSite=Strict impede leitura
    // por outros sites, então o valor não vaza para um atacante.
    res.cookie(env.cookies.csrf, csrf, { ...opcoesCookieBase(), httpOnly: false });
  }
}

export function limparCookiesAuth(res: Response): void {
  res.clearCookie(env.cookies.token, opcoesCookieBase());
  res.clearCookie(env.cookies.csrf, { ...opcoesCookieBase(), httpOnly: false });
}

// Token aleatório de CSRF (double-submit). Não precisa estar ligado ao JWT: basta
// que o valor do cookie e o do header coincidam a cada requisição mutante.
export function gerarTokenCsrf(): string {
  return randomBytes(24).toString('hex');
}
