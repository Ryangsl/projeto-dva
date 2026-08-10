import type { Request, Response } from 'express';
import { z } from 'zod';
import { HttpError } from '../../shared/http-error.js';
import * as authService from './auth.service.js';
import {
  definirCookiesAuth,
  gerarTokenCsrf,
  limparCookiesAuth,
  type TokenPayload,
} from './token.js';
import { registrarFalha, registrarSucesso, segundosBloqueado } from './login-throttle.js';

const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  senha: z.string().min(1, 'Senha obrigatória'),
});

// Monta o payload do JWT a partir do usuário público + id da sessão do login.
function payloadDoUsuario(u: authService.UsuarioPublico, sessaoId: number): TokenPayload {
  return { sub: u.id, nome: u.nome, perfil: u.perfil, marca: u.marca, sd: u.senhaDefinida, sid: sessaoId };
}

// Resposta enxuta do usuário para o front (o token vive só no cookie httpOnly).
function usuarioPublico(u: authService.UsuarioPublico) {
  return { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, marca: u.marca, marcas: u.marcas };
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, senha } = loginSchema.parse(req.body);

  // Chave do throttle: e-mail + IP (mitiga força-bruta sem punir toda a rede).
  const chave = `${email.toLowerCase()}|${req.ip}`;
  const bloqueio = segundosBloqueado(chave);
  if (bloqueio > 0) {
    throw new HttpError(429, `Muitas tentativas. Tente novamente em ${Math.ceil(bloqueio / 60)} min.`);
  }

  let resultado: authService.ResultadoLogin;
  try {
    resultado = await authService.login(email, senha);
  } catch (err) {
    registrarFalha(chave);
    throw err;
  }
  registrarSucesso(chave);

  const { usuario, sessaoId } = resultado;
  definirCookiesAuth(res, payloadDoUsuario(usuario, sessaoId), gerarTokenCsrf());
  res.json({
    usuario: usuarioPublico(usuario),
    mustChangePassword: !usuario.senhaDefinida,
  });
}

export async function me(req: Request, res: Response): Promise<void> {
  // req.user é preenchido pelo middleware authenticate.
  const u = req.user!;
  res.json({
    usuario: { id: u.sub, nome: u.nome, perfil: u.perfil, marca: u.marca, marcas: u.marcas },
    mustChangePassword: !u.senhaDefinida,
  });
}

export async function logout(req: Request, res: Response): Promise<void> {
  // Encerra a sessão no servidor, não só no cliente: limpar o cookie não
  // invalida uma cópia do token que já tenha sido capturada.
  const u = req.user;
  if (u) await authService.encerrarSessao(u.sessaoId, u.sub);
  limparCookiesAuth(res);
  res.status(204).end();
}

// Política de senha do primeiro acesso: mínimo 8 caracteres, com pelo menos uma
// letra e um número. A verificação de "diferente da atual" fica no service.
const definirSenhaSchema = z.object({
  senhaAtual: z.string().min(1, 'Senha atual obrigatória'),
  novaSenha: z
    .string()
    .min(8, 'A nova senha deve ter ao menos 8 caracteres')
    .regex(/[A-Za-zÀ-ÿ]/, 'A nova senha deve conter ao menos uma letra')
    .regex(/[0-9]/, 'A nova senha deve conter ao menos um número'),
});

export async function definirSenha(req: Request, res: Response): Promise<void> {
  const { senhaAtual, novaSenha } = definirSenhaSchema.parse(req.body);
  const u = req.user!;
  const usuario = await authService.definirSenha(u.sub, senhaAtual, novaSenha);
  // Trocar a senha derruba as OUTRAS sessões da conta (a corrente é preservada
  // para não deslogar quem acabou de trocar). É o que faz a troca de senha
  // valer como resposta a um acesso indevido.
  await authService.encerrarSessoesDoUsuario(u.sub, u.sessaoId);
  // Reemite o token já com sd=true (mesma sessão), liberando o acesso sem novo login.
  definirCookiesAuth(res, payloadDoUsuario(usuario, u.sessaoId));
  res.json({ usuario: usuarioPublico(usuario), mustChangePassword: false });
}

// Heartbeat de atividade: avança o ultimo_visto da sessão (tempo logado) e
// renova o cookie do token (sessão deslizante) enquanto há atividade. O id da
// sessão vem do token (req.user.sessaoId), não do corpo.
export async function atividade(req: Request, res: Response): Promise<void> {
  const u = req.user!;
  await authService.registrarAtividade(u.sub, u.sessaoId);
  definirCookiesAuth(res, {
    sub: u.sub,
    nome: u.nome,
    perfil: u.perfil,
    marca: u.marca,
    sd: u.senhaDefinida,
    sid: u.sessaoId,
  });
  res.status(204).end();
}
