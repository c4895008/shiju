import { Router } from 'express';
import { AppError, ah } from '../errors.js';
import { getWorkBySlug, listQuotes, listWorks, parsePaging } from '../services/quotes.js';

const router = Router();

router.get(
  '/',
  ah(async (req, res) => {
    const { page, pageSize, offset } = parsePaging(req.query);
    res.json({ data: await listWorks({ page, pageSize, offset }) });
  }),
);

router.get(
  '/:slug',
  ah(async (req, res) => {
    const result = await getWorkBySlug(req.params.slug);
    if (result.kind === 'redirect') return res.json({ data: { redirect: result.redirect } });
    if (result.kind !== 'ok') throw new AppError(404, 'NOT_FOUND', '页面不存在或已下架');

    const { page, pageSize, offset } = parsePaging(req.query);
    const quotes = await listQuotes({
      work: result.work.slug,
      page,
      pageSize,
      offset,
    });
    res.json({ data: { work: result.work, quotes } });
  }),
);

export default router;
