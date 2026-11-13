import { Router } from 'express';
import { ah } from '../errors.js';
import { pingDb } from '../db/pool.js';
import { config } from '../config.js';
import { statsSnapshot } from '../ssr/cache.js';

const router = Router();

router.get(
  '/',
  ah(async (_req, res) => {
    const db = await pingDb();
    res.status(db.connected ? 200 : 503).json({
      data: {
        status: db.connected ? 'ok' : 'degraded',
        uptime_s: Math.round(process.uptime()),
        env: config.env,
        db,
        ssr: { enabled: config.ssr.enabled, cache: statsSnapshot() },
      },
    });
  }),
);

export default router;
