import { createLimiter, userKey } from './rateLimit.js';

export const registerIp = createLimiter({ windowMs: 60 * 60_000, max: 10 });
export const usernameIp = createLimiter({ windowMs: 60_000, max: 60 });
export const loginAccount = createLimiter({ windowMs: 15 * 60_000, max: 5 });
export const loginIp = createLimiter({ windowMs: 15 * 60_000, max: 20 });
export const reflectionMinute = createLimiter({ windowMs: 60_000, max: 6 });
export const reflectionDay = createLimiter({ windowMs: 24 * 60 * 60_000, max: 60 });
export const quoteRequestDay = createLimiter({ windowMs: 24 * 60 * 60_000, max: 3 });
export const likeMinute = createLimiter({ windowMs: 60_000, max: 60 });
export const commentMinute = createLimiter({ windowMs: 60_000, max: 10 });
export const commentDay = createLimiter({ windowMs: 24 * 60 * 60_000, max: 100 });
export const commentActionMinute = createLimiter({ windowMs: 60_000, max: 30 });
export const searchIp = createLimiter({ windowMs: 60_000, max: 30 });
export const exportMinute = createLimiter({ windowMs: 60_000, max: 5 });
export const profileMinute = createLimiter({ windowMs: 60_000, max: 30 });
export const passwordChange = createLimiter({ windowMs: 15 * 60_000, max: 5 });
export const adminMinute = createLimiter({ windowMs: 60_000, max: 60 });
export const friendSearch = createLimiter({ windowMs: 60_000, max: 30 });
export const friendRequest = createLimiter({ windowMs: 60 * 60_000, max: 10 });
export const friendAction = createLimiter({ windowMs: 60_000, max: 30 });

export { userKey };
