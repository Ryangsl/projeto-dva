import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { authenticate, authorize, exigirSenhaDefinida } from '../../middlewares/auth.js';
import * as veiculosController from './veiculos.controller.js';
import { uploadVeiculo } from './upload.js';

export const veiculosRoutes = Router();

veiculosRoutes.use(authenticate, exigirSenhaDefinida);

// Opções do formulário e pré-checagem de chassi: qualquer perfil autenticado
// (é o operador cadastrando o veículo).
veiculosRoutes.get('/opcoes', asyncHandler(veiculosController.opcoes));
veiculosRoutes.get('/chassi/:chassi', asyncHandler(veiculosController.verificarChassi));
veiculosRoutes.post('/', uploadVeiculo, asyncHandler(veiculosController.criar));

// Listagem completa (monitoramento): qualquer perfil autenticado — todos
// veem os registros de todos os usuários; só Admin pode excluir.
veiculosRoutes.get('/', asyncHandler(veiculosController.listar));
veiculosRoutes.get('/:id', asyncHandler(veiculosController.buscarPorId));
veiculosRoutes.delete('/:id', authorize('admin'), asyncHandler(veiculosController.excluir));
