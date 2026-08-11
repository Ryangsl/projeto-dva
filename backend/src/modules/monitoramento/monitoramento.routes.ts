import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { authenticate, exigirSenhaDefinida } from '../../middlewares/auth.js';
import * as monitoramentoController from './monitoramento.controller.js';

export const monitoramentoRoutes = Router();

// Monitoramento é visível a qualquer perfil autenticado (mostra os registros
// de todos os usuários); só a exclusão de veículo (rota em veiculos.routes.ts)
// continua restrita ao Admin.
monitoramentoRoutes.use(authenticate, exigirSenhaDefinida);
monitoramentoRoutes.get('/dashboard', asyncHandler(monitoramentoController.dashboard));
