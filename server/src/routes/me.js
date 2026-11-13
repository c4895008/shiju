import { Router } from 'express';
import { AppError, ah, validationError } from '../errors.js';
import {
  parseAvatarPreset,
  parseNicknameInput,
  parsePasswordChange,
  parseQuoteRequestInput,
  readBody,
} from '../validate.js';
import { createQuoteRequest } from '../services/content.js';
import { listMine } from '../services/reflections.js';
import { exportNotebook } from '../services/export.js';
import { parsePaging } from '../services/quotes.js';
import { hashPassword, signToken, verifyPassword } from '../services/auth.js';
import {
  changePassword,
  findById,
  toPublicUser,
  updateAvatarPreset,
  updateNickname,
} from '../services/users.js';
import { requireAuth } from '../middleware/auth.js';
import { tooManyRequests } from '../middleware/rateLimit.js';
import { exportMinute, passwordChange, profileMinute, quoteRequestDay, userKey } from '../middleware/limiters.js';

const router = Router();

router.get(
  '/reflections',
  requireAuth,
  ah(async (req, res) => {
    const { page, pageSize, offset } = parsePaging(req.query);
    res.json({ data: await listMine(req.user.id, { page, pageSize, offset }) });
  }),
);

router.get(
  '/export',
  requireAuth,
  ah(async (req, res) => {
    const key = userKey(req);
    if (exportMinute.isLimited(key)) throw tooManyRequests();
    exportMinute.hit(key);

    const format = req.query.format === 'txt' ? 'txt' : 'md';
    await exportNotebook(req.user, format, res);
  }),
);

router.put(
  '/profile',
  requireAuth,
  ah(async (req, res) => {
    const key = userKey(req);
    if (profileMinute.isLimited(key)) throw tooManyRequests();
    profileMinute.hit(key);

    const body = readBody(req.body, ['nickname']);
    const nickname = parseNicknameInput(body);
    const user = await updateNickname(req.user.id, nickname);
    res.json({ data: { user: toPublicUser(user) } });
  }),
);

router.put(
  '/avatar',
  requireAuth,
  ah(async (req, res) => {
    const key = userKey(req);
    if (profileMinute.isLimited(key)) throw tooManyRequests();
    profileMinute.hit(key);

    const body = readBody(req.body, ['avatar_preset']);
    const preset = parseAvatarPreset(body);
    const user = await updateAvatarPreset(req.user.id, preset);
    res.json({ data: { user: toPublicUser(user) } });
  }),
);

router.put(
  '/password',
  requireAuth,
  ah(async (req, res) => {
    const key = userKey(req);
    if (passwordChange.isLimited(key)) throw tooManyRequests();
    passwordChange.hit(key);

    const body = readBody(req.body, ['current_password', 'new_password']);
    const input = parsePasswordChange(body);

    const user = await findById(req.user.id);
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '请先登录');
    if (!(await verifyPassword(input.current_password, user.password_hash))) {
      throw validationError({ current_password: '当前密码不正确' });
    }

    const fresh = await changePassword(user.id, await hashPassword(input.new_password));
    passwordChange.reset(key);
    res.json({ data: { token: signToken(fresh), user: toPublicUser(fresh) } });
  }),
);

const requests = Router();

requests.post(
  '/',
  requireAuth,
  ah(async (req, res) => {
    const key = userKey(req);
    if (quoteRequestDay.isLimited(key)) throw tooManyRequests();
    quoteRequestDay.hit(key);

    const body = readBody(req.body, ['text', 'work_title', 'note']);
    const input = parseQuoteRequestInput(body);
    const created = await createQuoteRequest(req.user.id, input);
    res.status(201).json({ data: created });
  }),
);

export { requests as quoteRequestsRouter };
export default router;
