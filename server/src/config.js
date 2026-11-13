import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(serverRoot, '..');
dotenv.config({ path: path.join(serverRoot, '.env') });

const env = process.env;
const dbName = env.DB_NAME || 'shiju';

if (!/^shiju(_[a-z0-9]+)?$/.test(dbName)) {
  throw new Error(`DB_NAME 必须为 shiju（或 shiju_xxx），当前为「${dbName}」`);
}

const jwtSecret = env.JWT_SECRET || '';
if (jwtSecret.length < 32) {
  throw new Error('JWT_SECRET 未设置或少于 32 字符，请在 server/.env 中配置');
}

export const config = {
  serverRoot,
  repoRoot,
  env: env.NODE_ENV || 'development',
  isProd: env.NODE_ENV === 'production',
  port: Number(env.PORT) || 3001,
  siteUrl: (env.SITE_URL || 'http://localhost:3001').replace(/\/$/, ''),
  corsOrigins: (env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  db: {
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT) || 3306,
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD || '',
    database: dbName,
  },
  jwt: {
    secret: jwtSecret,
    expiresIn: '14d',
  },
  bcryptCost: Number(env.BCRYPT_COST) || 12,
  ipHashSalt: env.IP_HASH_SALT || 'shiju-dev-ip-salt',
  ssr: {
    enabled: env.SSR_ENABLED !== '0',
    cacheMax: Number(env.SSR_CACHE_MAX) || 400,
    timeoutMs: Number(env.SSR_TIMEOUT_MS) || 1500,
    clientDist: path.join(repoRoot, 'client', 'dist'),
    ssrEntry: path.join(repoRoot, 'client', 'dist-ssr', 'entry-server.js'),
    clientRoot: path.join(repoRoot, 'client'),
  },
};
