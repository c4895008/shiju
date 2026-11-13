import crypto from 'node:crypto';
import { pinyin } from 'pinyin-pro';
import { pool } from '../db/pool.js';
import { AppError } from '../errors.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

export function parsePaging(query, { defaultSize = DEFAULT_PAGE_SIZE } = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const parsedSize = Number.parseInt(query.page_size, 10);
  const rawSize = Number.isNaN(parsedSize) ? defaultSize : parsedSize;
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, rawSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function paged(items, { page, pageSize, total }) {
  return { items, page, page_size: pageSize, total, has_more: page * pageSize < total };
}

const iso = (value) => (value ? new Date(value).toISOString() : null);

export const escapeLike = (input) => input.replace(/[!%_]/g, (ch) => `!${ch}`);

export function normalize(input) {
  return String(input)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

function pinyinTokens(text) {
  const clean = String(text).replace(/\s+/g, '');
  if (!clean) return '';
  const full = pinyin(clean, { toneType: 'none', type: 'array', nonZh: 'consecutive' });
  const initials = pinyin(clean, { pattern: 'first', toneType: 'none', type: 'array', nonZh: 'consecutive' });
  return [full.join(''), initials.join('')].filter(Boolean).join(' ');
}

export const quoteSourceKey = (workSlug, text) =>
  crypto.createHash('sha1').update(`${workSlug}\n${text}`).digest('hex');

export const quoteTags = (quote) => [
  `quote:${quote.id}`,
  `work:${quote.work_id}`,
  ...(quote.theme_ids || []).map((id) => `theme:${id}`),
];

export function toQuote(row, { work, themes } = {}) {
  return {
    id: row.id,
    slug: row.slug,
    text: row.quote_text,
    speaker: row.speaker,
    context: row.context,
    featured: Boolean(row.featured),
    published_at: iso(row.published_at),
    work: work || undefined,
    themes: themes || undefined,
  };
}

export function toWork(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    original_title: row.original_title,
    year: row.year,
    director: row.director,
    country: row.country,
    synopsis: row.synopsis,
    quote_count: row.quote_count,
  };
}

export function toTheme(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    quote_count: row.quote_count === undefined ? undefined : Number(row.quote_count),
    work_count: row.work_count === undefined ? undefined : Number(row.work_count),
  };
}

const WORK_COLUMNS =
  'id, slug, title, original_title, year, director, country, synopsis, quote_count';
const QUOTE_COLUMNS =
  'id, work_id, slug, quote_text, speaker, context, featured, status, published_at, updated_at';

async function themesForQuotes(quoteIds, conn = pool) {
  if (!quoteIds.length) return new Map();
  const [rows] = await conn.query(
    `SELECT qt.quote_id, t.id, t.slug, t.name
       FROM quote_theme qt
       JOIN theme t ON t.id = qt.theme_id
      WHERE qt.quote_id IN (?)
      ORDER BY t.sort_order, t.id`,
    [quoteIds],
  );
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.quote_id)) map.set(row.quote_id, []);
    map.get(row.quote_id).push({ id: row.id, slug: row.slug, name: row.name });
  }
  return map;
}

async function attachWork(rows, conn = pool) {
  const ids = [...new Set(rows.map((r) => r.work_id))];
  if (!ids.length) return new Map();
  const [works] = await conn.query(
    `SELECT ${WORK_COLUMNS} FROM work WHERE id IN (?)`,
    [ids],
  );
  return new Map(works.map((w) => [w.id, w]));
}

export async function withThemesAndWorks(rows, conn = pool) {
  const [themeMap, workMap] = await Promise.all([
    themesForQuotes([...new Set(rows.map((r) => r.id))], conn),
    attachWork(rows, conn),
  ]);
  return rows.map((row) => {
    const themes = themeMap.get(row.id) || [];
    const work = workMap.get(row.work_id);
    return {
      ...toQuote(row, { themes, work: work ? toWork(work) : undefined }),
      theme_ids: themes.map((t) => t.id),
    };
  });
}

export async function findRedirect(entity, slug, conn = pool) {
  const [rows] = await conn.query(
    'SELECT new_slug FROM slug_redirect WHERE entity = ? AND old_slug = ?',
    [entity, slug],
  );
  return rows[0]?.new_slug || null;
}

export async function listQuotes({ work, theme, featured, page, pageSize, offset }, conn = pool) {
  const where = ['q.status = 1', 'w.status = 1'];
  const params = [];

  if (work) {
    where.push('w.slug = ?');
    params.push(work);
  }
  if (theme) {
    where.push(
      'EXISTS (SELECT 1 FROM quote_theme qt JOIN theme t ON t.id = qt.theme_id WHERE qt.quote_id = q.id AND t.slug = ? AND t.status = 1)',
    );
    params.push(theme);
  }
  if (featured) where.push('q.featured = 1');

  const from = 'FROM quote q JOIN work w ON w.id = q.work_id';
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const [[countRow]] = await conn.query(`SELECT COUNT(*) AS total ${from} ${whereSql}`, params);
  const total = Number(countRow.total);
  const [rows] = await conn.query(
    `SELECT ${QUOTE_COLUMNS.split(', ').map((c) => `q.${c}`).join(', ')}
       ${from} ${whereSql}
      ORDER BY q.published_at DESC, q.id DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );

  const items = await withThemesAndWorks(rows, conn);
  return paged(
    items.map((item) => {
      const { theme_ids, ...rest } = item;
      return rest;
    }),
    { page, pageSize, total },
  );
}

export async function getQuoteBySlug(slug, conn = pool) {
  const [rows] = await conn.query(
    `SELECT q.*, w.status AS work_status, w.slug AS work_slug
       FROM quote q JOIN work w ON w.id = q.work_id
      WHERE q.slug = ?`,
    [slug],
  );
  const row = rows[0];
  if (!row) {
    const redirect = await findRedirect(1, slug, conn);
    if (redirect) return { kind: 'redirect', redirect: `/q/${redirect}` };
    return { kind: 'notfound' };
  }
  if (row.status === 3) return { kind: 'gone' };
  if (row.status !== 1 || row.work_status !== 1) return { kind: 'notfound' };

  const [quote] = await withThemesAndWorks([row], conn);
  return { kind: 'ok', quote };
}

export async function getQuoteById(id, conn = pool) {
  const [rows] = await conn.query(`SELECT ${QUOTE_COLUMNS}, work_id FROM quote WHERE id = ?`, [id]);
  if (!rows[0]) return null;
  const [quote] = await withThemesAndWorks([rows[0]], conn);
  return quote;
}

export async function getHomeData(conn = pool) {
  const [featuredRows] = await conn.query(
    `SELECT ${QUOTE_COLUMNS.split(', ').map((c) => `q.${c}`).join(', ')}
       FROM quote q JOIN work w ON w.id = q.work_id
      WHERE q.status = 1 AND w.status = 1 AND q.featured = 1
      ORDER BY q.published_at DESC, q.id DESC
      LIMIT 6`,
  );
  const featured = await withThemesAndWorks(featuredRows, conn);

  const [latestRows] = await conn.query(
    `SELECT ${QUOTE_COLUMNS.split(', ').map((c) => `q.${c}`).join(', ')}
       FROM quote q JOIN work w ON w.id = q.work_id
      WHERE q.status = 1 AND w.status = 1
      ORDER BY q.published_at DESC, q.id DESC
      LIMIT 8`,
  );
  const latest = await withThemesAndWorks(latestRows, conn);

  const [themeRows] = await conn.query(
    `SELECT t.id, t.slug, t.name, t.description,
            COUNT(DISTINCT CASE WHEN w.id IS NOT NULL THEN q.id END) AS quote_count,
            COUNT(DISTINCT w.id) AS work_count
       FROM theme t
       LEFT JOIN quote_theme qt ON qt.theme_id = t.id
       LEFT JOIN quote q ON q.id = qt.quote_id AND q.status = 1
       LEFT JOIN work w ON w.id = q.work_id AND w.status = 1
      WHERE t.status = 1
      GROUP BY t.id
      ORDER BY t.sort_order, t.id`,
  );

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
  const [pickRows] = await conn.query(
    `SELECT q.id, q.slug, q.quote_text, q.speaker, q.context, q.published_at,
            w.id AS work_id, w.slug AS work_slug, w.title AS work_title, w.year AS work_year
       FROM daily_pick dp
       JOIN quote q ON q.id = dp.quote_id
       JOIN work w ON w.id = q.work_id
      WHERE dp.pick_date = ? AND q.status = 1 AND w.status = 1`,
    [today],
  );

  let daily = null;
  if (pickRows[0]) {
    daily = {
      slug: pickRows[0].slug,
      text: pickRows[0].quote_text,
      speaker: pickRows[0].speaker,
      context: pickRows[0].context,
      work: { slug: pickRows[0].work_slug, title: pickRows[0].work_title, year: pickRows[0].work_year },
    };
  } else {
    const [[{ total }]] = await conn.query(
      'SELECT COUNT(*) AS total FROM quote q JOIN work w ON w.id = q.work_id WHERE q.status = 1 AND w.status = 1',
    );
    if (Number(total) > 0) {
      const offset = Number.parseInt(
        crypto.createHash('sha1').update(today).digest('hex').slice(0, 8),
        16,
      ) % Number(total);
      const [rows] = await conn.query(
        `SELECT q.slug, q.quote_text, q.speaker, q.context, w.slug AS work_slug, w.title AS work_title, w.year AS work_year
           FROM quote q JOIN work w ON w.id = q.work_id
          WHERE q.status = 1 AND w.status = 1
          ORDER BY q.id
          LIMIT 1 OFFSET ?`,
        [offset],
      );
      if (rows[0]) {
        daily = {
          slug: rows[0].slug,
          text: rows[0].quote_text,
          speaker: rows[0].speaker,
          context: rows[0].context,
          work: { slug: rows[0].work_slug, title: rows[0].work_title, year: rows[0].work_year },
        };
      }
    }
  }

  return {
    daily,
    featured: featured.map(stripInternal),
    latest: latest.map(stripInternal),
    themes: themeRows.map((row) =>
      toTheme({ ...row, quote_count: Number(row.quote_count) }),
    ),
    date: today,
  };
}

function stripInternal(item) {
  const { theme_ids, ...rest } = item;
  return rest;
}

export async function listWorks({ page, pageSize, offset }, conn = pool) {
  const [[{ total }]] = await conn.query('SELECT COUNT(*) AS total FROM work WHERE status = 1');
  const [rows] = await conn.query(
    `SELECT ${WORK_COLUMNS} FROM work
      WHERE status = 1
      ORDER BY (quote_count > 0) DESC, quote_count DESC, year DESC, id DESC
      LIMIT ? OFFSET ?`,
    [pageSize, offset],
  );
  return paged(rows.map(toWork), { page, pageSize, total: Number(total) });
}

export async function getWorkBySlug(slug, conn = pool) {
  const [rows] = await conn.query(
    `SELECT ${WORK_COLUMNS} FROM work WHERE slug = ? AND status = 1`,
    [slug],
  );
  if (!rows[0]) {
    const redirect = await findRedirect(2, slug, conn);
    if (redirect) return { kind: 'redirect', redirect: `/movie/${redirect}` };
    return { kind: 'notfound' };
  }
  return { kind: 'ok', work: toWork(rows[0]) };
}

export async function searchQuotes(q, { page, pageSize, offset }, conn = pool) {
  const normalized = normalize(q);
  if (!normalized) return { page, pageSize, total: 0, items: [] };

  const like = `%${escapeLike(normalized)}%`;
  const prefix = `${escapeLike(normalized)}%`;

  const where = `q.status = 1 AND w.status = 1
      AND (q.search_text LIKE ? ESCAPE '!' OR q.pinyin LIKE ? ESCAPE '!')`;
  const [[{ total }]] = await conn.query(
    `SELECT COUNT(*) AS total FROM quote q JOIN work w ON w.id = q.work_id WHERE ${where}`,
    [like, like],
  );
  const [rows] = await conn.query(
    `SELECT ${QUOTE_COLUMNS.split(', ').map((c) => `q.${c}`).join(', ')}
       FROM quote q JOIN work w ON w.id = q.work_id
      WHERE ${where}
      ORDER BY (q.search_text LIKE ? ESCAPE '!') DESC, q.featured DESC, q.published_at DESC, q.id DESC
      LIMIT ? OFFSET ?`,
    [like, like, prefix, pageSize, offset],
  );

  const items = await withThemesAndWorks(rows, conn);
  return {
    ...paged(items.map(stripInternal), { page, pageSize, total: Number(total) }),
    normalized,
  };
}

// 重建台词搜索列：写入与导入时调用，运行时不做拼音转换
export async function refreshQuoteSearch(quoteId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT q.id, q.quote_text, q.speaker, w.title, w.director, w.original_title
       FROM quote q JOIN work w ON w.id = q.work_id WHERE q.id = ?`,
    [quoteId],
  );
  const row = rows[0];
  if (!row) return;
  const [themeRows] = await conn.query(
    `SELECT t.name FROM quote_theme qt JOIN theme t ON t.id = qt.theme_id WHERE qt.quote_id = ?`,
    [quoteId],
  );
  const themeNames = themeRows.map((t) => t.name).join('');
  const source = [row.quote_text, row.speaker, row.title, row.original_title, row.director, themeNames]
    .filter(Boolean)
    .join('');
  await conn.query('UPDATE quote SET search_text = ?, pinyin = ? WHERE id = ?', [
    normalize(source),
    pinyinTokens([row.quote_text, row.speaker, row.title, row.director, themeNames].filter(Boolean).join('')),
    quoteId,
  ]);
}

export async function sitemapData(conn = pool) {
  const [quoteRows] = await conn.query(
    `SELECT q.slug, q.updated_at FROM quote q JOIN work w ON w.id = q.work_id
      WHERE q.status = 1 AND w.status = 1 ORDER BY q.id`,
  );
  const [workRows] = await conn.query(
    `SELECT w.slug, w.updated_at FROM work w
      WHERE w.status = 1 AND EXISTS (
        SELECT 1 FROM quote q WHERE q.work_id = w.id AND q.status = 1
      ) ORDER BY w.id`,
  );
  const [themeRows] = await conn.query(
    `SELECT t.slug, t.updated_at FROM theme t
      WHERE t.status = 1 AND EXISTS (
        SELECT 1 FROM quote_theme qt JOIN quote q ON q.id = qt.quote_id AND q.status = 1
         WHERE qt.theme_id = t.id
      ) ORDER BY t.id`,
  );
  return { quotes: quoteRows, works: workRows, themes: themeRows };
}

export async function findQuoteBySlugForAdmin(slug, conn = pool) {
  const [rows] = await conn.query('SELECT id, work_id FROM quote WHERE slug = ?', [slug]);
  return rows[0] || null;
}

export function notFound() {
  return new AppError(404, 'NOT_FOUND', '页面不存在或已下架');
}
