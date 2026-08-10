import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { authenticate, exigirSenhaDefinida } from '../../middlewares/auth.js';
import * as guiaController from './guia.controller.js';

export const guiaRoutes = Router();

guiaRoutes.use(authenticate, exigirSenhaDefinida);

// Único fetch do guia; o frontend cacheia o resultado.
guiaRoutes.get('/dados', asyncHandler(guiaController.dados));
