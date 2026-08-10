import { Router } from 'express';
import { authRoutes } from '../modules/auth/auth.routes.js';
import { centrosRoutes } from '../modules/centros/centros.routes.js';
import { monitoramentoRoutes } from '../modules/monitoramento/monitoramento.routes.js';
import { usuariosRoutes } from '../modules/usuarios/usuarios.routes.js';
import { veiculosRoutes } from '../modules/veiculos/veiculos.routes.js';

// Agregador central de rotas. Novos módulos entram aqui.
export const routes = Router();

routes.get('/health', (_req, res) => res.json({ status: 'ok' }));
routes.use('/auth', authRoutes);
routes.use('/veiculos', veiculosRoutes);
routes.use('/centros', centrosRoutes);
routes.use('/monitoramento', monitoramentoRoutes);
routes.use('/usuarios', usuariosRoutes);
