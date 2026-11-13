import { Router } from 'express';
import { ah, validationError } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { tooManyRequests } from '../middleware/rateLimit.js';
import { friendAction, friendRequest, friendSearch, userKey } from '../middleware/limiters.js';
import { parsePaging } from '../services/quotes.js';
import {
  cancelFriendRequest,
  friendSummary,
  listFriendFeed,
  listFriendRequests,
  listFriends,
  removeFriend,
  respondFriendRequest,
  searchUsers,
  sendFriendRequest,
} from '../services/friends.js';
import {
  parseFriendAction,
  parseFriendQuery,
  parseFriendTarget,
  readBody,
} from '../validate.js';

const router = Router();

router.use(requireAuth);

const parseId = (value) => {
  const id = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(id) || id <= 0) throw validationError({ id: '记录不存在' });
  return id;
};

const guard = (limiter, req) => {
  const key = userKey(req);
  if (limiter.isLimited(key)) throw tooManyRequests();
  limiter.hit(key);
};

router.get(
  '/',
  ah(async (req, res) => {
    res.json({ data: { items: await listFriends(req.user.id) } });
  }),
);

router.get(
  '/summary',
  ah(async (req, res) => {
    res.json({ data: await friendSummary(req.user.id) });
  }),
);

router.get(
  '/requests',
  ah(async (req, res) => {
    res.json({ data: await listFriendRequests(req.user.id) });
  }),
);

router.get(
  '/search',
  ah(async (req, res) => {
    guard(friendSearch, req);
    const q = parseFriendQuery(req.query.q);
    res.json({ data: { items: await searchUsers(req.user.id, q), query: q } });
  }),
);

router.get(
  '/feed',
  ah(async (req, res) => {
    const { page, pageSize, offset } = parsePaging(req.query);
    res.json({ data: await listFriendFeed(req.user.id, { page, pageSize, offset }) });
  }),
);

router.post(
  '/requests',
  ah(async (req, res) => {
    guard(friendRequest, req);
    const body = readBody(req.body, ['user_id']);
    const targetId = parseFriendTarget(body);
    const result = await sendFriendRequest(req.user.id, targetId);
    res.status(201).json({ data: result });
  }),
);

router.put(
  '/requests/:id',
  ah(async (req, res) => {
    guard(friendAction, req);
    const id = parseId(req.params.id);
    const body = readBody(req.body, ['action']);
    const action = parseFriendAction(body);
    res.json({ data: await respondFriendRequest(req.user.id, id, action) });
  }),
);

router.delete(
  '/requests/:id',
  ah(async (req, res) => {
    guard(friendAction, req);
    const id = parseId(req.params.id);
    res.json({ data: await cancelFriendRequest(req.user.id, id) });
  }),
);

router.delete(
  '/:userId',
  ah(async (req, res) => {
    guard(friendAction, req);
    const friendId = parseId(req.params.userId);
    res.json({ data: await removeFriend(req.user.id, friendId) });
  }),
);

export default router;
