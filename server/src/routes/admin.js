import { Router } from 'express';
import { ah, validationError } from '../errors.js';
import { readBody } from '../validate.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { tooManyRequests } from '../middleware/rateLimit.js';
import { adminMinute, userKey } from '../middleware/limiters.js';
import { bump } from '../ssr/cache.js';
import { parsePaging } from '../services/quotes.js';
import {
  adminListQuotes,
  adminListRequests,
  adminListThemes,
  adminListWorks,
  adminOverview,
  bulkCreateQuotes,
  createQuote,
  createTheme,
  createWork,
  getDailyPick,
  getQuoteRequest,
  setDailyPick,
  setQuoteStatus,
  setRequestStatus,
  updateQuote,
  updateTheme,
  updateWork,
} from '../services/content.js';
import { adminList as adminListReflections, setStatusByAdmin } from '../services/reflections.js';
import {
  adminListComments,
  deleteCommentByAdmin,
  setCommentStatusByAdmin,
} from '../services/comments.js';
import { searchStats } from '../services/search.js';

const router = Router();

router.use(requireAuth, requireAdmin);

const writeLimit = (req, _res, next) => {
  const key = userKey(req);
  if (adminMinute.isLimited(key)) return next(tooManyRequests());
  adminMinute.hit(key);
  next();
};

const intQuery = (value, allowed, field = 'status', message = '状态不正确') => {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!allowed.includes(n)) throw validationError({ [field]: message });
  return n;
};

const applyTags = (result) => {
  if (result?.tags) bump(...result.tags);
  return result;
};

// ---------- overview ----------

router.get(
  '/overview',
  ah(async (_req, res) => {
    res.json({ data: await adminOverview() });
  }),
);

// ---------- quotes ----------

router.get(
  '/quotes',
  ah(async (req, res) => {
    const { page, pageSize, offset } = parsePaging(req.query);
    res.json({
      data: await adminListQuotes({
        workId: req.query.work_id ? Number(req.query.work_id) : undefined,
        status: intQuery(req.query.status, [0, 1, 2, 3]),
        q: typeof req.query.q === 'string' ? req.query.q.trim() : '',
        page,
        pageSize,
        offset,
      }),
    });
  }),
);

router.post(
  '/quotes',
  writeLimit,
  ah(async (req, res) => {
    const body = readBody(req.body, ['work_id', 'slug', 'text', 'speaker', 'context', 'themes', 'featured', 'status']);
    const result = await createQuote({ ...body, work_id: Number(body.work_id) });
    applyTags(result);
    res.status(201).json({ data: { id: result.id } });
  }),
);

router.post(
  '/quotes/bulk',
  writeLimit,
  ah(async (req, res) => {
    const body = readBody(req.body, ['work_id', 'items']);
    const result = await bulkCreateQuotes({ work_id: Number(body.work_id), items: body.items });
    applyTags(result);
    res.status(201).json({ data: { ids: result.ids, count: result.count } });
  }),
);

router.put(
  '/quotes/:id',
  writeLimit,
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const body = readBody(req.body, ['work_id', 'slug', 'text', 'speaker', 'context', 'themes', 'featured', 'status']);
    const result = await updateQuote(id, body);
    applyTags(result);
    res.json({ data: { id } });
  }),
);

router.put(
  '/quotes/:id/status',
  writeLimit,
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const body = readBody(req.body, ['status']);
    const result = await setQuoteStatus(id, body.status);
    applyTags(result);
    res.json({ data: { id, status: body.status } });
  }),
);

// ---------- works ----------

router.get(
  '/works',
  ah(async (req, res) => {
    const { page, pageSize, offset } = parsePaging(req.query);
    res.json({
      data: await adminListWorks({
        q: typeof req.query.q === 'string' ? req.query.q.trim() : '',
        status: intQuery(req.query.status, [0, 1, 2]),
        page,
        pageSize,
        offset,
      }),
    });
  }),
);

router.post(
  '/works',
  writeLimit,
  ah(async (req, res) => {
    const body = readBody(req.body, ['type', 'slug', 'title', 'original_title', 'year', 'director', 'country', 'synopsis', 'status']);
    const result = await createWork(body);
    applyTags(result);
    res.status(201).json({ data: { id: result.id, slug: result.slug } });
  }),
);

router.put(
  '/works/:id',
  writeLimit,
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const body = readBody(req.body, ['type', 'slug', 'title', 'original_title', 'year', 'director', 'country', 'synopsis', 'status']);
    const result = await updateWork(id, body);
    applyTags(result);
    res.json({ data: { id } });
  }),
);

// ---------- themes ----------

router.get(
  '/themes',
  ah(async (_req, res) => {
    res.json({ data: { items: await adminListThemes() } });
  }),
);

router.post(
  '/themes',
  writeLimit,
  ah(async (req, res) => {
    const body = readBody(req.body, ['slug', 'name', 'description', 'sort_order', 'status']);
    const result = await createTheme(body);
    applyTags(result);
    res.status(201).json({ data: { id: result.id } });
  }),
);

router.put(
  '/themes/:id',
  writeLimit,
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const body = readBody(req.body, ['slug', 'name', 'description', 'sort_order', 'status']);
    const result = await updateTheme(id, body);
    applyTags(result);
    res.json({ data: { id } });
  }),
);

// ---------- daily picks ----------

router.get(
  '/daily-picks/:date',
  ah(async (req, res) => {
    res.json({ data: await getDailyPick(req.params.date) });
  }),
);

router.put(
  '/daily-picks/:date',
  writeLimit,
  ah(async (req, res) => {
    const body = readBody(req.body, ['quote_id', 'note']);
    const result = await setDailyPick(req.params.date, body);
    applyTags(result);
    res.json({ data: { date: req.params.date } });
  }),
);

// ---------- reflections ----------

router.get(
  '/reflections',
  ah(async (req, res) => {
    const { page, pageSize, offset } = parsePaging(req.query);
    res.json({
      data: await adminListReflections({
        status: intQuery(req.query.status, [1, 2]),
        visibility: intQuery(req.query.visibility, [0, 1, 2], 'visibility', '可见范围不正确'),
        page,
        pageSize,
        offset,
      }),
    });
  }),
);

router.put(
  '/reflections/:id/status',
  writeLimit,
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const body = readBody(req.body, ['status']);
    if (![1, 2].includes(body.status)) throw validationError({ status: '状态不正确' });
    const result = await setStatusByAdmin(id, body.status);
    bump(`quote:${result.quote_id}`, 'themes');
    res.json({ data: { id, status: body.status } });
  }),
);

// ---------- reflection comments ----------

router.get(
  '/reflections/:id/comments',
  ah(async (req, res) => {
    const { page, pageSize, offset } = parsePaging(req.query);
    res.json({
      data: await adminListComments(Number(req.params.id), {
        status: intQuery(req.query.status, [1, 2]),
        page,
        pageSize,
        offset,
      }),
    });
  }),
);

router.put(
  '/comments/:id/status',
  writeLimit,
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const body = readBody(req.body, ['status']);
    if (![1, 2].includes(body.status)) throw validationError({ status: '状态不正确' });
    const result = await setCommentStatusByAdmin(id, body.status);
    bump(`quote:${result.quote_id}`);
    res.json({ data: { id, status: body.status } });
  }),
);

router.delete(
  '/comments/:id',
  writeLimit,
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const result = await deleteCommentByAdmin(id);
    bump(`quote:${result.quote_id}`);
    res.json({ data: { deleted: true } });
  }),
);

// ---------- quote requests ----------

router.get(
  '/quote-requests',
  ah(async (req, res) => {
    const { page, pageSize, offset } = parsePaging(req.query);
    res.json({
      data: await adminListRequests({
        status: intQuery(req.query.status, [1, 2, 3]),
        page,
        pageSize,
        offset,
      }),
    });
  }),
);

router.get(
  '/quote-requests/:id',
  ah(async (req, res) => {
    res.json({ data: await getQuoteRequest(Number(req.params.id)) });
  }),
);

router.put(
  '/quote-requests/:id/status',
  writeLimit,
  ah(async (req, res) => {
    const body = readBody(req.body, ['status']);
    res.json({ data: await setRequestStatus(Number(req.params.id), body.status) });
  }),
);

// ---------- stats ----------

router.get(
  '/search-stats',
  ah(async (req, res) => {
    res.json({ data: await searchStats(req.query.days) });
  }),
);

export default router;
