import { Router } from 'express';
import { AppError, ah, validationError } from '../errors.js';
import { assertValid, checkNickname, checkPassword, checkUsername, readBody } from '../validate.js';
import { hashPassword, signToken, verifyPassword } from '../services/auth.js';
import { createUser, findByUsername, toPublicUser, usernameExists } from '../services/users.js';
import { requireAuth } from '../middleware/auth.js';
import { tooManyRequests } from '../middleware/rateLimit.js';
import { loginAccount, loginIp, registerIp, usernameIp } from '../middleware/limiters.js';

const router = Router();

router.post(
  '/register',
  ah(async (req, res) => {
    if (registerIp.isLimited(req.ip)) throw tooManyRequests();
    registerIp.hit(req.ip);

    const body = readBody(req.body, ['username', 'password', 'nickname', 'agree_terms']);
    assertValid({
      username: checkUsername(body.username),
      password: checkPassword(body.password),
      nickname: body.nickname === undefined || body.nickname === '' ? null : checkNickname(body.nickname),
    });
    if (body.agree_terms !== true) {
      throw validationError({ agree_terms: '请先阅读并同意用户协议与隐私条款' });
    }
    if (await usernameExists(body.username)) {
      throw new AppError(409, 'USERNAME_TAKEN', '这个用户名已经被使用了', {
        fields: { username: '这个用户名已经被使用了' },
      });
    }

    const passwordHash = await hashPassword(body.password);
    const nickname = body.nickname ? body.nickname.trim() : body.username;
    const user = await createUser({ username: body.username, passwordHash, nickname });

    res.status(201).json({ data: { token: signToken(user), user: toPublicUser(user) } });
  }),
);

router.post(
  '/login',
  ah(async (req, res) => {
    const body = readBody(req.body, ['username', 'password']);
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!username || !password) throw validationError({ username: '请填写用户名和密码' });

    const accountKey = username.toLowerCase();
    if (loginAccount.isLimited(accountKey) || loginIp.isLimited(req.ip)) throw tooManyRequests();

    const user = await findByUsername(username);
    const ok = await verifyPassword(password, user?.password_hash);
    if (!user || !ok || user.status !== 1) {
      loginAccount.hit(accountKey);
      loginIp.hit(req.ip);
      throw new AppError(401, 'INVALID_CREDENTIALS', '用户名或密码不正确');
    }

    loginAccount.reset(accountKey);
    loginIp.reset(req.ip);
    res.json({ data: { token: signToken(user), user: toPublicUser(user) } });
  }),
);

router.get('/me', requireAuth, (req, res) => {
  res.json({ data: { user: toPublicUser(req.user) } });
});

router.get(
  '/username-available',
  ah(async (req, res) => {
    if (usernameIp.isLimited(req.ip)) throw tooManyRequests();
    usernameIp.hit(req.ip);

    const username = typeof req.query.username === 'string' ? req.query.username.trim() : '';
    const error = checkUsername(username);
    if (error) throw validationError({ username: error });
    res.json({ data: { username, available: !(await usernameExists(username)) } });
  }),
);

export default router;
