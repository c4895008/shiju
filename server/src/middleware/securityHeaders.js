import crypto from 'node:crypto';
import { config } from '../config.js';

export const inlineScriptHashes = (html) => {
  const hashes = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) {
    const hash = crypto.createHash('sha256').update(match[1], 'utf8').digest('base64');
    hashes.push(`'sha256-${hash}'`);
  }
  return [...new Set(hashes)];
};

export function buildCsp(html) {
  const scripts = ["'self'", ...inlineScriptHashes(html)];
  return [
    "default-src 'self'",
    `script-src ${scripts.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "font-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
}

export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (config.isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'",
    );
  }
  next();
}
