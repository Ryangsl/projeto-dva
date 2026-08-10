import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { authenticate, authorize, exigirSenhaDefinida } from '../../middlewares/auth.js';
import * as centrosController from './centros.controller.js';

export const centrosRoutes = Router();

// Gestão de centros de distribuição: só o Admin. Operadores enxergam a lista
// (ativos) através de `GET /veiculos/opcoes`, não por aqui.
centrosRoutes.use(authenticate, exigirSenhaDefinida, authorize('admin'));

centrosRoutes.get('/', asyncHandler(centrosController.listar));
centrosRoutes.post('/', asyncHandler(centrosController.criar));
centrosRoutes.put('/:id', asyncHandler(centrosController.atualizar));
