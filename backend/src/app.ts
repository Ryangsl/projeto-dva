import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { authenticate } from './middlewares/auth.js';
import { csrfProtection } from './middlewares/csrf.js';
import { errorHandler } from './middlewares/error-handler.js';
import { rateLimitGlobal } from './middlewares/rate-limit.js';
import { securityHeaders } from './middlewares/security-headers.js';
import { UPLOAD_DIR } from './modules/veiculos/upload.js';
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

// Fotos/vídeo dos veículos: atrás de autenticação (GET é método seguro, o
// CSRF não se aplica) — mídia de veículo não pode ficar acessível por URL
// adivinhável sem sessão válida.
//
// `securityHeaders` (acima) marca toda a API com Cross-Origin-Resource-Policy:
// same-origin — correto para respostas JSON, que não devem ser embutidas por
// nenhuma outra origem. Mas fotos/vídeo SÃO destinadas a ser embutidas via
// <img>/<video src> a partir do próprio frontend, que em desenvolvimento roda
// numa porta diferente (Vite :5173 vs API :3333) — mesmo "site" (mesmo host,
// só a porta muda), mas origem diferente. Com `same-origin` o navegador
// bloqueia esse carregamento (ERR_BLOCKED_BY_RESPONSE.NotSameOrigin), mesmo a
// requisição chegando com o cookie de sessão certo e passando pela
// autenticação. `same-site` resolve exatamente esse caso — autoriza o próprio
// frontend (em qualquer porta do mesmo domínio, dev ou produção, já que em
// produção front+API ficam atrás do mesmo domínio via Nginx) sem abrir para
// qualquer origem do mundo, que é o que `cross-origin` faria.
app.use(
  '/api/uploads',
  authenticate,
  (_req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    next();
  },
  express.static(UPLOAD_DIR),
);

app.use('/api', routes);

// Error handler deve ser o último middleware registrado.
app.use(errorHandler);
