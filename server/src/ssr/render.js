import crypto from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from '../config.js';
import { buildCsp } from '../middleware/securityHeaders.js';
import { injectHtml, loadTemplate } from './assets.js';
import { lookup, store } from './cache.js';

const inflight = new Set();

const timeout = (ms) =>
  new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error('SSR_TIMEOUT')), ms);
    timer.unref();
  });

const cacheKey = (pathWithQuery) => {
  const url = new URL(pathWithQuery, 'http://local');
  url.searchParams.sort();
  return `${url.pathname}${url.search}`;
};

export function createSsr({ vite = null } = {}) {
  let prodEntry = null;

  async function getRender() {
    if (vite) {
      const mod = await vite.ssrLoadModule('/src/entry-server.tsx');
      return mod.render;
    }
    if (!prodEntry) {
      prodEntry = import(pathToFileURL(path.join(config.ssr.ssrEntry)).href);
    }
    return (await prodEntry).render;
  }

  async function renderOnce(pathWithQuery) {
    const render = await getRender();
    const request = new Request(`${config.siteUrl}${pathWithQuery}`, { headers: { accept: 'text/html' } });
    return Promise.race([render(request), timeout(config.ssr.timeoutMs)]);
  }

  async function buildEntry(pathWithQuery) {
    const result = await renderOnce(pathWithQuery);
    const template = await loadTemplate(vite, pathWithQuery);
    const html = injectHtml(template, {
      head: result.head || '',
      html: result.html || '',
      hydration: result.hydration || null,
    });
    return { html, status: result.status || 200, tags: result.tags || ['all'], ttl: result.ttl || 300_000 };
  }

  function sendEntry(res, entry, cacheState) {
    if (config.isProd) {
      res.setHeader('Content-Security-Policy', buildCsp(entry.html));
    }
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.setHeader('ETag', entry.etag);
    if (cacheState) res.setHeader('X-SSR-Cache', cacheState);
    if (res.req.get('if-none-match') === entry.etag) return res.status(304).end();
    return res.status(entry.status === 404 || entry.status === 410 ? entry.status : 200).type('html').send(entry.html);
  }

  async function revalidate(key, pathWithQuery) {
    if (inflight.has(key)) return;
    inflight.add(key);
    try {
      const built = await buildEntry(pathWithQuery);
      if (built.status === 200 || built.status === 404 || built.status === 410) {
        store(key, { html: built.html, tags: built.tags, ttlMs: built.ttl, staleMs: 60_000 });
      }
    } catch (err) {
      console.error('[ssr] 重新渲染失败', err.message);
    } finally {
      inflight.delete(key);
    }
  }

  async function fallbackShell(res, pathWithQuery) {
    try {
      const template = await loadTemplate(vite, pathWithQuery);
      const html = injectHtml(template, { head: '', html: '', hydration: null });
      if (config.isProd) res.setHeader('Content-Security-Policy', buildCsp(html));
      res.setHeader('X-SSR-Fallback', '1');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.status(200).type('html').send(html);
    } catch (err) {
      console.error('[ssr] 兜底失败', err.stack || err);
      res.status(500).type('text').send('服务暂时不可用');
    }
  }

  return async function ssrMiddleware(req, res) {
    if (!config.isProd && !req.accepts('html')) return fallbackShell(res, req.originalUrl);

    const pathWithQuery = req.originalUrl;
    const key = cacheKey(pathWithQuery);

    const hit = lookup(key);
    if (hit) {
      if (hit.status === 'stale') revalidate(key, pathWithQuery);
      return sendEntry(res, hit.entry, hit.status === 'fresh' ? 'hit' : 'stale');
    }

    try {
      const result = await renderOnce(pathWithQuery);
      if (result.redirect) {
        res.setHeader('Cache-Control', 'no-store');
        return res.redirect(301, result.redirect);
      }

      const template = await loadTemplate(vite, pathWithQuery);
      const html = injectHtml(template, {
        head: result.head || '',
        html: result.html || '',
        hydration: result.hydration || null,
      });
      const entry = store(key, {
        html,
        tags: result.tags || ['all'],
        ttlMs: result.ttl || 300_000,
        staleMs: 60_000,
      });
      entry.status = result.status || 200;
      return sendEntry(res, entry, 'miss');
    } catch (err) {
      console.error(`[ssr] ${pathWithQuery} 渲染失败：${err.message}`);
      return fallbackShell(res, pathWithQuery);
    }
  };
}

export function spaShell({ vite = null } = {}) {
  return async (req, res) => {
    try {
      const template = await loadTemplate(vite, req.originalUrl);
      const html = injectHtml(template, { head: '', html: '', hydration: null });
      if (config.isProd) res.setHeader('Content-Security-Policy', buildCsp(html));
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.status(200).type('html').send(html);
    } catch (err) {
      console.error('[spa] 模板加载失败', err.stack || err);
      res.status(500).type('text').send('服务暂时不可用');
    }
  };
}

export const privatePaths = [
  /^\/notebook(\/|$)/,
  /^\/settings(\/|$)/,
  /^\/friends(\/|$)/,
  /^\/q\/[^/]+\/write\/?$/,
  /^\/auth\//,
  /^\/admin(\/|$)/,
];

export const isPrivatePath = (pathname) => privatePaths.some((re) => re.test(pathname));

export const etagOf = (html) => `"${crypto.createHash('sha1').update(html).digest('hex').slice(0, 32)}"`;
