import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { badRequest } from '../../shared/http-error.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// backend/uploads (raiz do backend, fora de src/) — servido estaticamente em
// /api/uploads, atrás de autenticação (ver app.ts).
export const UPLOAD_DIR = join(__dirname, '..', '..', '..', 'uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });

// Limites — suposições razoáveis para o MVP, ajustáveis aqui.
const FOTO_TAMANHO_MAX = 15 * 1024 * 1024; // 15MB
const FOTO_QUANTIDADE_MAX = 8;
const VIDEO_TAMANHO_MAX = 200 * 1024 * 1024; // 200MB

const MIMES_FOTO = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MIMES_VIDEO = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

const EXTENSAO_POR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  // Nome gerado (nunca o original do upload): evita path traversal, colisão de
  // nomes e enumeração de arquivos por quem souber o chassi.
  filename: (_req, file, cb) => {
    const extensao = EXTENSAO_POR_MIME[file.mimetype] ?? 'bin';
    cb(null, `${randomUUID()}.${extensao}`);
  },
});

function fileFilter(
  _req: unknown,
  file: Express.Multer.File,
  cb: (err: Error | null, aceitar?: boolean) => void,
): void {
  const permitido =
    (file.fieldname === 'fotos' && MIMES_FOTO.has(file.mimetype)) ||
    (file.fieldname === 'video' && MIMES_VIDEO.has(file.mimetype));
  if (!permitido) {
    cb(badRequest(`Arquivo inválido em "${file.fieldname}": tipo ${file.mimetype} não é aceito`));
    return;
  }
  cb(null, true);
}

// O multer não distingue `limits.fileSize` por campo dentro de um único
// `.fields()` — o teto abaixo cobre o maior dos dois (vídeo). Uma foto de até
// 200MB tecnicamente passaria pelo multer; suficiente para o MVP (arquivo de
// fotos raramente chega perto disso), documentado aqui como simplificação.
export const uploadVeiculo = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: Math.max(FOTO_TAMANHO_MAX, VIDEO_TAMANHO_MAX),
  },
}).fields([
  { name: 'fotos', maxCount: FOTO_QUANTIDADE_MAX },
  { name: 'video', maxCount: 1 },
]);
