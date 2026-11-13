import { Router } from 'express';
import { ah } from '../errors.js';
import { getHomeData } from '../services/quotes.js';

const router = Router();

router.get(
  '/',
  ah(async (_req, res) => {
    res.json({ data: await getHomeData() });
  }),
);

export default router;
