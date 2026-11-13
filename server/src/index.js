import http from 'node:http';
import { config } from './config.js';
import { createApp } from './app.js';
import { pingDb } from './db/pool.js';
import { createDevVite } from './ssr/dev.js';

const host = process.env.HOST || (config.isProd ? '127.0.0.1' : '0.0.0.0');
globalThis.__SHIJU_API_BASE__ = `http://127.0.0.1:${config.port}/api`;

const server = http.createServer();
const vite = config.isProd ? null : await createDevVite(server);
const app = createApp({ vite });
server.on('request', app);

server.listen(config.port, host, async () => {
  const db = await pingDb();
  console.log(
    `[shiju] ${config.env} 已启动 http://${host}:${config.port}  db=${db.connected ? 'ok' : db.error}  ssr=${config.ssr.enabled ? 'on' : 'off'}`,
  );
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`[shiju] 收到 ${signal}，正在关闭`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
