import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { authenticate, authorize, exigirSenhaDefinida } from '../../middlewares/auth.js';
import { rateLimitSensivel } from '../../middlewares/rate-limit.js';
import * as usuariosController from './usuarios.controller.js';

export const usuariosRoutes = Router();

// Gerenciamento de usuários: Admin gerencia todos (consultores e gestores);
// Gestor só os consultores da própria loja. Escopo aplicado no service.
usuariosRoutes.use(authenticate, exigirSenhaDefinida, authorize('admin', 'gestor'));

usuariosRoutes.get('/', asyncHandler(usuariosController.listar));
usuariosRoutes.get('/marcas-disponiveis', asyncHandler(usuariosController.marcas));
// Criação e reset geram credenciais: rate limit por usuário para que uma conta
// administrativa comprometida não consiga criar contas ou resetar senhas em massa.
usuariosRoutes.post('/', rateLimitSensivel, asyncHandler(usuariosController.criar));
usuariosRoutes.put('/:id', asyncHandler(usuariosController.atualizar));
usuariosRoutes.post(
  '/:id/resetar-senha',
  rateLimitSensivel,
  asyncHandler(usuariosController.resetarSenha),
);
// Exclusão definitiva: só Admin (TI). Dupla barreira — `authorize` na rota e a
// checagem de perfil no service, para que a regra não dependa só do roteador.
usuariosRoutes.delete(
  '/:id',
  authorize('admin'),
  rateLimitSensivel,
  asyncHandler(usuariosController.excluir),
);
