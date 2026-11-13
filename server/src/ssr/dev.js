import { createServer as createViteServer } from 'vite';
import { config } from '../config.js';

export async function createDevVite(httpServer) {
  return createViteServer({
    root: config.ssr.clientRoot,
    appType: 'custom',
    logLevel: 'warn',
    server: {
      middlewareMode: true,
      hmr: { server: httpServer },
    },
  });
}
