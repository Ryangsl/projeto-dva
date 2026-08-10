import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { authenticate, authorize, exigirSenhaDefinida } from '../../middlewares/auth.js';
import * as gestorController from './gestor.controller.js';

export const gestorRoutes = Router();

// Área do gestor: dashboard e monitoramento de uso por concessionária.
// Admin também acessa (acesso total ao sistema); o dashboard continua global
// (sem filtro de marca) para os dois perfis.
gestorRoutes.use(authenticate, exigirSenhaDefinida, authorize('gestor', 'admin'));

// Painel consolidado (KPIs + série temporal + rankings) numa só resposta.
gestorRoutes.get('/dashboard', asyncHandler(gestorController.dashboard));
// Lista paginada de consultores para a tabela do painel.
gestorRoutes.get('/consultores', asyncHandler(gestorController.consultores));
// Compat.: lista completa (online primeiro).
gestorRoutes.get('/uso', asyncHandler(gestorController.uso));
