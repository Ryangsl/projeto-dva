import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { authenticate, authorize, exigirSenhaDefinida } from '../../middlewares/auth.js';
import { rateLimitSensivel } from '../../middlewares/rate-limit.js';
import * as usuariosController from './usuarios.controller.js';

export const usuariosRoutes = Router();

// Gerenciamento de usuários: só o Admin administra operadores.
usuariosRoutes.use(authenticate, exigirSenhaDefinida, authorize('admin'));

usuariosRoutes.get('/', asyncHandler(usuariosController.listar));
usuariosRoutes.get('/centros-disponiveis', asyncHandler(usuariosController.centros));
// Criação e reset geram credenciais: rate limit por usuário para que uma conta
// administrativa comprometida não consiga criar contas ou resetar senhas em massa.
usuariosRoutes.post('/', rateLimitSensivel, asyncHandler(usuariosController.criar));
usuariosRoutes.put('/:id', asyncHandler(usuariosController.atualizar));
usuariosRoutes.post(
  '/:id/resetar-senha',
  rateLimitSensivel,
  asyncHandler(usuariosController.resetarSenha),
);
usuariosRoutes.delete('/:id', rateLimitSensivel, asyncHandler(usuariosController.excluir));
