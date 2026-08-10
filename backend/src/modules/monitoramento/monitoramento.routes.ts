import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { authenticate, exigirSenhaDefinida } from '../../middlewares/auth.js';
import * as controller from './monitoramento.controller.js';

export const monitoramentoRoutes = Router();

// Registro de eventos de uso da ferramenta (consultor autenticado, senha já
// definida). Fire-and-forget no front: não bloqueia o atendimento offline-first.
monitoramentoRoutes.use(authenticate, exigirSenhaDefinida);

monitoramentoRoutes.post('/atendimento/iniciar', asyncHandler(controller.iniciar));
monitoramentoRoutes.post('/atendimento/concluir', asyncHandler(controller.concluir));
