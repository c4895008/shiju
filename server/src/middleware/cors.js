import cors from 'cors';
import { config } from '../config.js';
import { AppError } from '../errors.js';

const allowed = new Set([
  ...config.corsOrigins,
  config.siteUrl,
  `http://localhost:${config.port}`,
  `http://127.0.0.1:${config.port}`,
]);

export const corsWhitelist = cors({
  origin(origin, cb) {
    if (!origin || allowed.has(origin)) return cb(null, true);
    cb(new AppError(403, 'CORS_FORBIDDEN', '来源不被允许'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  maxAge: 600,
});
