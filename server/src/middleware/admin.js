import { AppError } from '../errors.js';

export function requireAdmin(req, _res, next) {
  if (!req.user || req.user.role !== 9) {
    return next(new AppError(403, 'FORBIDDEN', '没有后台权限'));
  }
  next();
}
