import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { authenticate, authorize, exigirSenhaDefinida } from '../../middlewares/auth.js';
import * as monitoramentoController from './monitoramento.controller.js';

export const monitoramentoRoutes = Router();

monitoramentoRoutes.use(authenticate, exigirSenhaDefinida, authorize('admin'));
monitoramentoRoutes.get('/dashboard', asyncHandler(monitoramentoController.dashboard));
