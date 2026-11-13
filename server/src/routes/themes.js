import { Router } from 'express';
import { AppError, ah } from '../errors.js';
import { parsePaging } from '../services/quotes.js';
import { getThemeDetail, listThemes } from '../services/themes.js';

const router = Router();

router.get(
  '/',
  ah(async (_req, res) => {
    res.json({ data: { items: await listThemes() } });
  }),
);

router.get(
  '/:slug',
  ah(async (req, res) => {
    const { page, pageSize, offset } = parsePaging(req.query);
    const result = await getThemeDetail({ slug: req.params.slug, page, pageSize, offset });
    if (result.kind === 'redirect') return res.json({ data: { redirect: result.redirect } });
    if (result.kind !== 'ok') throw new AppError(404, 'NOT_FOUND', '页面不存在或已下架');

    const { theme, stats, quotes, featured, top_works, related_themes } = result;
    res.json({ data: { theme, stats, quotes, featured, top_works, related_themes } });
  }),
);

export default router;
