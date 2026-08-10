import { Router } from 'express';
import { authRoutes } from '../modules/auth/auth.routes.js';
import { guiaRoutes } from '../modules/guia/guia.routes.js';
import { gestorRoutes } from '../modules/gestor/gestor.routes.js';
import { monitoramentoRoutes } from '../modules/monitoramento/monitoramento.routes.js';
import { usuariosRoutes } from '../modules/usuarios/usuarios.routes.js';

// Agregador central de rotas. Novos módulos entram aqui.
export const routes = Router();

routes.get('/health', (_req, res) => res.json({ status: 'ok' }));
routes.use('/auth', authRoutes);
routes.use('/guia', guiaRoutes);
routes.use('/gestor', gestorRoutes);
routes.use('/monitoramento', monitoramentoRoutes);
routes.use('/usuarios', usuariosRoutes);
