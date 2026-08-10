import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { authenticate } from '../../middlewares/auth.js';
import { rateLimitSensivel } from '../../middlewares/rate-limit.js';
import * as authController from './auth.controller.js';

export const authRoutes = Router();

authRoutes.post('/login', asyncHandler(authController.login));
authRoutes.get('/me', authenticate, asyncHandler(authController.me));
authRoutes.post('/logout', authenticate, asyncHandler(authController.logout));
// Primeiro acesso / troca de senha (permitido mesmo com senha ainda não definida).
// Rate limit por usuário: `senhaAtual` é verificada aqui, então sem limite a
// rota vira um oráculo de força-bruta para quem pegar um tablet já logado.
authRoutes.post(
  '/senha',
  authenticate,
  rateLimitSensivel,
  asyncHandler(authController.definirSenha),
);
authRoutes.post('/atividade', authenticate, asyncHandler(authController.atividade));
