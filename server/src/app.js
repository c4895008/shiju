import express from 'express';
import { config } from './config.js';
import { requestLog } from './middleware/requestLog.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { corsWhitelist } from './middleware/cors.js';
import { errorHandler } from './middleware/errorHandler.js';
import api from './routes/api.js';
import sitemap from './routes/sitemap.js';
import { createSsr, isPrivatePath, spaShell } from './ssr/render.js';

export function createApp({ vite = null } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(securityHeaders);
  app.use(requestLog);
  app.use(express.json({ limit: '1mb' }));

  app.use('/api', corsWhitelist, api);
  app.use(sitemap);

  if (vite) app.use(vite.middlewares);

  if (!vite) {
    app.use(
      express.static(config.ssr.clientDist, {
        index: false,
        maxAge: '1h',
        setHeaders(res, filePath) {
          if (filePath.includes('/assets/')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
  }

  const shell = spaShell({ vite });
  app.use((req, res, next) => {
    if (isPrivatePath(req.path)) return shell(req, res, next);
    next();
  });

  if (config.ssr.enabled) {
    app.use(createSsr({ vite }));
  } else {
    app.use(shell);
  }

  app.use(errorHandler);
  return app;
}
