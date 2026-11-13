import { Router } from 'express';
import { AppError, ah } from '../errors.js';
import { getQuoteBySlug, listQuotes, parsePaging } from '../services/quotes.js';
import { findMine, likedReflectionIds, listPublicReflections } from '../services/reflections.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';

const router = Router();

function resolveQuote(result) {
  if (result.kind === 'redirect') return { redirect: result.redirect };
  if (result.kind === 'gone') throw new AppError(410, 'GONE', '这句台词已永久下架');
  if (result.kind === 'notfound') throw new AppError(404, 'NOT_FOUND', '页面不存在或已下架');
  return result.quote;
}

router.get(
  '/',
  ah(async (req, res) => {
    const { page, pageSize, offset } = parsePaging(req.query);
    const featured = req.query.featured === '1' || req.query.featured === 'true';
    const data = await listQuotes({
      work: typeof req.query.work === 'string' ? req.query.work : null,
      theme: typeof req.query.theme === 'string' ? req.query.theme : null,
      featured,
      page,
      pageSize,
      offset,
    });
    res.json({ data });
  }),
);

router.get(
  '/:slug',
  optionalAuth,
  ah(async (req, res) => {
    const result = await getQuoteBySlug(req.params.slug);
    const quote = resolveQuote(result);
    if (quote.redirect) return res.json({ data: quote });

    const my_reflection = req.user ? await findMine(req.user.id, quote.id) : null;
    res.json({ data: { quote, work: quote.work, themes: quote.themes, my_reflection } });
  }),
);

router.get(
  '/:slug/reflections',
  ah(async (req, res) => {
    const result = await getQuoteBySlug(req.params.slug);
    const quote = resolveQuote(result);
    if (quote.redirect) return res.json({ data: quote });

    const { page, pageSize, offset } = parsePaging(req.query, { defaultSize: 10 });
    res.json({ data: await listPublicReflections(quote.id, { page, pageSize, offset }) });
  }),
);

router.get(
  '/:slug/my-state',
  requireAuth,
  ah(async (req, res) => {
    const result = await getQuoteBySlug(req.params.slug);
    const quote = resolveQuote(result);
    if (quote.redirect) return res.json({ data: quote });

    const [reflection, liked] = await Promise.all([
      findMine(req.user.id, quote.id),
      likedReflectionIds(req.user.id, quote.id),
    ]);
    res.json({ data: { reflection, liked_reflection_ids: liked } });
  }),
);

export default router;
