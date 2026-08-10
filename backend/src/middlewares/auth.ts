import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { forbidden, unauthorized } from '../shared/http-error.js';
import { buscarUsuarioPorId, sessaoValida } from '../modules/auth/auth.service.js';
import { verificarToken } from '../modules/auth/token.js';

export type Perfil = 'operador' | 'admin';

export interface AuthUser {
  sub: number;
  nome: string;
  perfil: Perfil;
  // Centro de distribuição do Operador (null = Admin, sem restrição).
  centroDistribuicaoId: number | null;
  centroDistribuicaoNome: string | null;
  // Primeiro acesso concluído? (false = ainda precisa trocar a senha temporária)
  senhaDefinida: boolean;
  // Id da sessão (do token) — usado pelo heartbeat e nos registros de uso.
  sessaoId: number;
}

// Estende o Request do Express para carregar o usuário autenticado.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// Autenticação por JWT em cookie httpOnly (`procar_token`). Validamos a
// assinatura/expiração do token e, em seguida, relemos o usuário no banco para
// (a) revogar imediatamente usuários inativos e (b) refletir perfil/marca/estado
// de senha atuais mesmo que tenham mudado após a emissão do token.
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.cookies?.[env.cookies.token];
  if (!token) {
    return next(unauthorized('Não autenticado'));
  }

  const payload = verificarToken(token);
  if (!payload) {
    return next(unauthorized('Sessão expirada ou inválida'));
  }

  const usuario = await buscarUsuarioPorId(payload.sub);
  if (!usuario) {
    return next(unauthorized('Sessão inválida'));
  }

  // A sessão (não só a assinatura do token) é autoritativa: logout, troca ou
  // reset de senha a encerram, e o teto absoluto impede que o heartbeat
  // prolongue o acesso para sempre. Sem esta checagem, um token capturado
  // continuaria válido mesmo depois da conta ser "recuperada".
  if (!(await sessaoValida(payload.sid, usuario.id))) {
    return next(unauthorized('Sessão encerrada'));
  }

  req.user = {
    sub: usuario.id,
    nome: usuario.nome,
    perfil: usuario.perfil,
    centroDistribuicaoId: usuario.centroDistribuicaoId,
    centroDistribuicaoNome: usuario.centroDistribuicaoNome,
    senhaDefinida: usuario.senhaDefinida,
    sessaoId: payload.sid,
  };
  next();
}

// Restringe a rota a determinados perfis. Usar depois de authenticate.
export function authorize(...perfis: Perfil[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !perfis.includes(req.user.perfil)) {
      return next(forbidden());
    }
    next();
  };
}

// Bloqueia o uso normal do sistema enquanto o usuário não concluir o primeiro
// acesso (troca da senha temporária). O front reconhece o `code` e redireciona
// para a tela de definição de senha. Usar depois de authenticate, nos routers
// que exigem senha já definida (veiculos, centros, monitoramento, usuarios).
export function exigirSenhaDefinida(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.user && !req.user.senhaDefinida) {
    res.status(403).json({ error: 'Defina sua senha para continuar', code: 'SENHA_NAO_DEFINIDA' });
    return;
  }
  next();
}
