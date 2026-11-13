import { Router } from 'express';
import { ah, validationError } from '../errors.js';
import { searchQuotes } from '../services/quotes.js';
import { logSearch } from '../services/search.js';
import { tooManyRequests } from '../middleware/rateLimit.js';
import { searchIp } from '../middleware/limiters.js';
import { optionalAuth } from '../middleware/auth.js';
import { parsePaging } from '../services/quotes.js';

const router = Router();

router.get(
  '/',
  optionalAuth,
  ah(async (req, res) => {
    if (searchIp.isLimited(req.ip)) throw tooManyRequests();
    searchIp.hit(req.ip);

    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length > 100) throw validationError({ q: '搜索词最多 100 字' });

    const { page, pageSize, offset } = parsePaging(req.query);
    if (!q) {
      return res.json({
        data: { items: [], page, page_size: pageSize, total: 0, has_more: false, query: '', normalized: '' },
      });
    }

    const data = await searchQuotes(q, { page, pageSize, offset });
    const result = { ...data, query: q };
    delete result.normalized;
    result.normalized = data.normalized;

    logSearch({ query: q, normalized: data.normalized, resultCount: data.total, userId: req.user?.id, ip: req.ip });

    res.json({ data: result });
  }),
);

export default router;
