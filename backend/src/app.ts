import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { csrfProtection } from './middlewares/csrf.js';
import { errorHandler } from './middlewares/error-handler.js';
import { rateLimitGlobal } from './middlewares/rate-limit.js';
import { securityHeaders } from './middlewares/security-headers.js';
import { routes } from './routes/index.js';

export const app = express();

// Confia no proxy reverso (VPS/servidor local) para obter o IP real do cliente
// (usado no throttle de login e no rate limit) e marcar cookies Secure
// corretamente. O Nginx do DEPLOY.md anexa o IP real à direita do
// X-Forwarded-For, e com 1 salto o Express lê justamente esse valor — um
// cabeçalho forjado pelo cliente não contamina o req.ip.
app.set('trust proxy', 1);

app.use(securityHeaders);

// credentials: true é necessário para o navegador enviar/receber o cookie
// httpOnly de autenticação em requisições cross-origin (front em outra porta).
app.use(cors({ origin: env.corsOrigin, credentials: true }));
// Limite de corpo: nenhum endpoint recebe payload grande (o guia só é lido).
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// Teto global de requisições por IP, antes de qualquer trabalho de rota.
app.use(rateLimitGlobal);

// Proteção CSRF (double-submit) para requisições mutantes autenticadas.
app.use(csrfProtection);

app.use('/api', routes);

// Error handler deve ser o último middleware registrado.
app.use(errorHandler);
