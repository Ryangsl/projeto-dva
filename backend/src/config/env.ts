import dotenv from 'dotenv';

dotenv.config();

function required(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${key}`);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProd = nodeEnv === 'production';

// Segredo fraco de desenvolvimento — proibido em produção (ver guarda abaixo).
const JWT_SECRET_INSEGURO = 'dev-secret-inseguro';

// Placeholders que já circularam em .env.example/DEPLOY.md. A lista é uma rede
// de segurança; a verificação de tamanho mínimo (abaixo) é a defesa real, pois
// cobre qualquer placeholder futuro sem precisar ser atualizada.
const JWT_SECRETS_PROIBIDOS = new Set([
  JWT_SECRET_INSEGURO,
  'troque-este-segredo-em-producao',
  'changeme',
  'secret',
  'segredo',
]);

// Um segredo HMAC precisa de entropia suficiente para não ser adivinhável.
const JWT_SECRET_TAMANHO_MINIMO = 32;

export const env = {
  port: Number(process.env.PORT ?? 3333),
  nodeEnv,
  isProd,
  db: {
    host: required('DB_HOST', 'localhost'),
    port: Number(process.env.DB_PORT ?? 3306),
    user: required('DB_USER', 'root'),
    password: process.env.DB_PASSWORD ?? '',
    database: required('DB_NAME', 'painel_procar'),
  },
  jwt: {
    secret: required('JWT_SECRET', JWT_SECRET_INSEGURO),
    // Access token curto: casa com a expiração por inatividade (30 min) e é
    // renovado de forma deslizante pelo heartbeat enquanto há atividade.
    expiresIn: process.env.JWT_EXPIRES_IN ?? '30m',
  },
  // Nome dos cookies de autenticação (httpOnly) e de CSRF (legível pelo front).
  cookies: {
    token: 'procar_token',
    csrf: 'procar_csrf',
    // Secure exige HTTPS. Default = produção; mas o servidor local da PROCAR pode
    // rodar em HTTP puro — nesse caso definir COOKIE_SECURE=false, senão o
    // navegador descarta o cookie e o login "não funciona".
    secure: (process.env.COOKIE_SECURE ?? String(isProd)) === 'true',
  },
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  // Senha inicial do Admin (TI) usada só pelo `db:setup`. Em produção é
  // obrigatória (não há valor padrão); em desenvolvimento, o setup gera uma
  // aleatória quando ausente. Ver `database/setup.ts`.
  adminSenhaInicial: process.env.ADMIN_SENHA_INICIAL,
  // Chave da API pública da FIPE, usada só pelos scripts manuais de
  // `database/import-fipe/` (não pelo servidor). Ausente por padrão — cada
  // script valida a presença antes de rodar. Ver IMPORTACAO-FIPE.md.
  fipe: {
    apiKey: process.env.FIPE_API_KEY,
  },
};

// Em produção, recusar subir com um segredo fraco. Validamos a QUALIDADE do
// valor (tamanho + denylist), não a igualdade com um literal específico: o
// caminho real de deploy é `cp .env.example .env`, então qualquer placeholder
// esquecido no arquivo precisa ser barrado, não apenas o default do código.
if (isProd) {
  const segredo = env.jwt.secret;
  if (JWT_SECRETS_PROIBIDOS.has(segredo) || segredo.length < JWT_SECRET_TAMANHO_MINIMO) {
    throw new Error(
      `JWT_SECRET inválido em produção: use um valor aleatório com ao menos ${JWT_SECRET_TAMANHO_MINIMO} caracteres. ` +
        'Gere um com: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
    );
  }
}
