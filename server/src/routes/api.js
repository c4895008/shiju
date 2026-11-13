import { Router } from 'express';
import auth from './auth.js';
import quotes from './quotes.js';
import works from './works.js';
import themes from './themes.js';
import search from './search.js';
import reflections from './reflections.js';
import friends from './friends.js';
import me, { quoteRequestsRouter } from './me.js';
import admin from './admin.js';
import health from './health.js';
import home from './home.js';
import { apiNotFound } from '../middleware/errorHandler.js';

const router = Router();

router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});

router.use('/health', health);
router.use('/auth', auth);
router.use('/home', home);
router.use('/quotes', quotes);
router.use('/works', works);
router.use('/themes', themes);
router.use('/search', search);
router.use('/reflections', reflections);
router.use('/friends', friends);
router.use('/me', me);
router.use('/quote-requests', quoteRequestsRouter);
router.use('/admin', admin);

router.use(apiNotFound);

export default router;
