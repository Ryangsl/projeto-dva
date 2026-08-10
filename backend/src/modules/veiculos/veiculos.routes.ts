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

// "Meus Registros": qualquer perfil autenticado, sempre escopado ao próprio
// usuário (ver controller). Precisa vir ANTES de "/:id" — senão o Express
// casaria "meus-registros" como se fosse o parâmetro :id.
veiculosRoutes.get('/meus-registros', asyncHandler(veiculosController.meusRegistros));

// Listagem completa (monitoramento): só Admin.
veiculosRoutes.get('/', authorize('admin'), asyncHandler(veiculosController.listar));
// Detalhe: qualquer perfil autenticado — o service restringe Operador ao
// próprio veículo (404 para o resto, sem confirmar que o id existe).
veiculosRoutes.get('/:id', asyncHandler(veiculosController.buscarPorId));
veiculosRoutes.delete('/:id', authorize('admin'), asyncHandler(veiculosController.excluir));
