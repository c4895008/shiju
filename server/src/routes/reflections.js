import { Router } from 'express';
import { AppError, ah, validationError } from '../errors.js';
import { parseCommentInput, parseReflectionInput, readBody } from '../validate.js';
import { getQuoteBySlug, parsePaging } from '../services/quotes.js';
import {
  createReflection,
  deleteReflection,
  likeReflection,
  unlikeReflection,
  updateReflectionBody,
  updateReflectionVisibility,
} from '../services/reflections.js';
import { createComment, deleteComment, listComments } from '../services/comments.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { tooManyRequests } from '../middleware/rateLimit.js';
import {
  commentActionMinute,
  commentDay,
  commentMinute,
  likeMinute,
  reflectionDay,
  reflectionMinute,
  userKey,
} from '../middleware/limiters.js';
import { bump } from '../ssr/cache.js';
import { isValidIdempotencyKey, once } from '../services/idempotency.js';

const router = Router();

const parseId = (value) => {
  const id = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(id) || id <= 0) throw validationError({ id: '感悟不存在' });
  return id;
};

const parseCommentId = (value) => {
  const id = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(id) || id <= 0) throw validationError({ comment_id: '评论不存在' });
  return id;
};

async function quoteIdBySlug(slug) {
  const result = await getQuoteBySlug(slug);
  if (result.kind !== 'ok') throw new AppError(404, 'NOT_FOUND', '页面不存在或已下架');
  return result.quote.id;
}

router.post(
  '/',
  requireAuth,
  ah(async (req, res) => {
    const key = userKey(req);
    if (reflectionMinute.isLimited(key) || reflectionDay.isLimited(key)) throw tooManyRequests();
    reflectionMinute.hit(key);
    reflectionDay.hit(key);

    const body = readBody(req.body, ['quote_slug', 'body', 'visibility']);
    if (typeof body.quote_slug !== 'string' || !body.quote_slug) {
      throw validationError({ quote_slug: '请指定台词' });
    }
    const quoteId = await quoteIdBySlug(body.quote_slug);
    const input = parseReflectionInput(body);

    const idem = req.get('idempotency-key');
    const run = () => createReflection(req.user.id, quoteId, input);
    const result = idem && isValidIdempotencyKey(idem) ? await once(`reflection:${req.user.id}`, idem, run) : await run();
    bump(`quote:${result.quote_id}`, 'themes');
    res.status(201).json({ data: result.reflection });
  }),
);

router.put(
  '/:id',
  requireAuth,
  ah(async (req, res) => {
    const id = parseId(req.params.id);
    const body = readBody(req.body, ['body']);
    const { body: text } = parseReflectionInput({ body: body.body });
    const result = await updateReflectionBody(id, req.user.id, text);
    bump(`quote:${result.quote_id}`);
    res.json({ data: result.reflection });
  }),
);

router.put(
  '/:id/visibility',
  requireAuth,
  ah(async (req, res) => {
    const id = parseId(req.params.id);
    const body = readBody(req.body, ['visibility']);
    if (![0, 1, 2].includes(body.visibility)) throw validationError({ visibility: '可见范围不正确' });
    const result = await updateReflectionVisibility(id, req.user.id, body.visibility);
    bump(`quote:${result.quote_id}`, 'themes');
    res.json({ data: result.reflection });
  }),
);

router.delete(
  '/:id',
  requireAuth,
  ah(async (req, res) => {
    const id = parseId(req.params.id);
    const result = await deleteReflection(id, req.user.id);
    bump(`quote:${result.quote_id}`, 'themes');
    res.json({ data: { deleted: true } });
  }),
);

router.put(
  '/:id/like',
  requireAuth,
  ah(async (req, res) => {
    const key = userKey(req);
    if (likeMinute.isLimited(key)) throw tooManyRequests();
    likeMinute.hit(key);

    const id = parseId(req.params.id);
    const result = await likeReflection(id, req.user.id);
    bump(`quote:${result.quote_id}`);
    res.json({ data: { liked: result.liked, like_count: result.like_count } });
  }),
);

router.delete(
  '/:id/like',
  requireAuth,
  ah(async (req, res) => {
    const key = userKey(req);
    if (likeMinute.isLimited(key)) throw tooManyRequests();
    likeMinute.hit(key);

    const id = parseId(req.params.id);
    const result = await unlikeReflection(id, req.user.id);
    bump(`quote:${result.quote_id}`);
    res.json({ data: { liked: result.liked, like_count: result.like_count } });
  }),
);

router.get(
  '/:id/comments',
  optionalAuth,
  ah(async (req, res) => {
    const id = parseId(req.params.id);
    const { page, pageSize, offset } = parsePaging(req.query, { defaultSize: 10 });
    res.json({ data: await listComments(id, req.user, { page, pageSize, offset }) });
  }),
);

router.post(
  '/:id/comments',
  requireAuth,
  ah(async (req, res) => {
    const key = userKey(req);
    if (commentMinute.isLimited(key) || commentDay.isLimited(key)) throw tooManyRequests();
    commentMinute.hit(key);
    commentDay.hit(key);

    const id = parseId(req.params.id);
    const body = readBody(req.body, ['body']);
    const { body: text } = parseCommentInput(body);

    const idem = req.get('idempotency-key');
    const run = () => createComment(id, req.user, text);
    const result = idem && isValidIdempotencyKey(idem) ? await once(`comment:${req.user.id}`, idem, run) : await run();
    bump(`quote:${result.quote_id}`);
    res.status(201).json({ data: { comment: result.comment, comment_count: result.comment_count } });
  }),
);

router.delete(
  '/:id/comments/:commentId',
  requireAuth,
  ah(async (req, res) => {
    const key = userKey(req);
    if (commentActionMinute.isLimited(key)) throw tooManyRequests();
    commentActionMinute.hit(key);

    const id = parseId(req.params.id);
    const commentId = parseCommentId(req.params.commentId);
    const result = await deleteComment(id, commentId, req.user);
    bump(`quote:${result.quote_id}`);
    res.json({ data: { deleted: true, comment_count: result.comment_count } });
  }),
);

export default router;
