import { Router } from 'express';
import { ah } from '../errors.js';
import { config } from '../config.js';
import { sitemapData } from '../services/quotes.js';
import { lookup, store } from '../ssr/cache.js';

const router = Router();

const escapeXml = (value) =>
  String(value).replace(/[<>&'"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[ch]);

const shanghaiDate = (value) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));

function urlNode(path, lastmod) {
  return `<url><loc>${escapeXml(config.siteUrl + path)}</loc><lastmod>${shanghaiDate(lastmod)}</lastmod></url>`;
}

async function buildSitemap() {
  const { quotes, works, themes } = await sitemapData();
  const today = new Date();
  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urlNode('/', today),
    urlNode('/themes', today),
    ...quotes.map((row) => urlNode(`/q/${row.slug}`, row.updated_at)),
    ...works.map((row) => urlNode(`/movie/${row.slug}`, row.updated_at)),
    ...themes.map((row) => urlNode(`/theme/${row.slug}`, row.updated_at)),
    '</urlset>',
  ];
  return parts.join('\n');
}

router.get(
  '/sitemap.xml',
  ah(async (req, res) => {
    const cached = lookup('sitemap.xml');
    let entry = cached?.entry;
    if (!entry) {
      const xml = await buildSitemap();
      entry = store('sitemap.xml', { html: xml, tags: ['sitemap'], ttlMs: 3600_000, staleMs: 0 });
    }

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.setHeader('ETag', entry.etag);
    if (req.get('if-none-match') === entry.etag) return res.status(304).end();
    res.send(entry.html);
  }),
);

export default router;
