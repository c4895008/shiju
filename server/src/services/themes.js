import { pool } from '../db/pool.js';
import { findRedirect, listQuotes, toTheme } from './quotes.js';

const THEME_VISIBLE_COUNTS = `
  COUNT(DISTINCT CASE WHEN w.id IS NOT NULL THEN q.id END) AS quote_count,
  COUNT(DISTINCT w.id) AS work_count`;

const THEME_FROM = `
  FROM theme t
  LEFT JOIN quote_theme qt ON qt.theme_id = t.id
  LEFT JOIN quote q ON q.id = qt.quote_id AND q.status = 1
  LEFT JOIN work w ON w.id = q.work_id AND w.status = 1`;

export const themeCacheTags = (themeId) => ['themes', `theme:${themeId}`];

export async function listThemes(conn = pool) {
  const [rows] = await conn.query(
    `SELECT t.id, t.slug, t.name, t.description, ${THEME_VISIBLE_COUNTS}
       ${THEME_FROM}
      WHERE t.status = 1
      GROUP BY t.id
      ORDER BY t.sort_order, t.id`,
  );
  return rows.map((row) => toTheme(row));
}

export async function getThemeBySlug(slug, conn = pool) {
  const [rows] = await conn.query(
    `SELECT t.id, t.slug, t.name, t.description, ${THEME_VISIBLE_COUNTS}
       ${THEME_FROM}
      WHERE t.slug = ? AND t.status = 1
      GROUP BY t.id`,
    [slug],
  );
  if (!rows[0]) {
    const redirect = await findRedirect(3, slug, conn);
    if (redirect) return { kind: 'redirect', redirect: `/theme/${redirect}` };
    return { kind: 'notfound' };
  }
  return { kind: 'ok', theme: toTheme(rows[0]) };
}

async function countPublicReflections(themeId, conn = pool) {
  const [[row]] = await conn.query(
    `SELECT COUNT(*) AS total
       FROM reflection r
       JOIN quote_theme qt ON qt.quote_id = r.quote_id
       JOIN quote q ON q.id = r.quote_id AND q.status = 1
       JOIN work w ON w.id = q.work_id AND w.status = 1
      WHERE qt.theme_id = ? AND r.visibility = 2 AND r.status = 1`,
    [themeId],
  );
  return Number(row.total);
}

async function listTopWorks(themeId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT w.id, w.slug, w.title, w.year, COUNT(*) AS quote_count
       FROM quote_theme qt
       JOIN quote q ON q.id = qt.quote_id AND q.status = 1
       JOIN work w ON w.id = q.work_id AND w.status = 1
      WHERE qt.theme_id = ?
      GROUP BY w.id, w.slug, w.title, w.year
      ORDER BY quote_count DESC, w.year DESC, w.id DESC
      LIMIT 6`,
    [themeId],
  );
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    year: row.year,
    quote_count: Number(row.quote_count),
  }));
}

async function listRelatedThemes(themeId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT t2.id, t2.slug, t2.name, t2.description, t2.sort_order,
            COUNT(DISTINCT a.quote_id) AS shared_count,
            (SELECT COUNT(*)
               FROM quote_theme qt2
               JOIN quote q2 ON q2.id = qt2.quote_id AND q2.status = 1
               JOIN work w2 ON w2.id = q2.work_id AND w2.status = 1
              WHERE qt2.theme_id = t2.id) AS quote_count
       FROM quote_theme a
       JOIN quote_theme b ON b.quote_id = a.quote_id AND b.theme_id <> a.theme_id
       JOIN theme t2 ON t2.id = b.theme_id AND t2.status = 1
       JOIN quote q ON q.id = a.quote_id AND q.status = 1
       JOIN work w ON w.id = q.work_id AND w.status = 1
      WHERE a.theme_id = ?
      GROUP BY t2.id, t2.slug, t2.name, t2.description, t2.sort_order
      ORDER BY shared_count DESC, t2.sort_order, t2.id
      LIMIT 4`,
    [themeId],
  );
  return rows.map((row) => toTheme({ ...row, quote_count: Number(row.quote_count) }));
}

export async function getThemeDetail({ slug, page, pageSize, offset }, conn = pool) {
  const found = await getThemeBySlug(slug, conn);
  if (found.kind !== 'ok') return found;
  const { theme } = found;

  const [quotes, featured, reflections, topWorks, relatedThemes] = await Promise.all([
    listQuotes({ theme: theme.slug, page, pageSize, offset }, conn),
    listQuotes({ theme: theme.slug, featured: true, page: 1, pageSize: 3, offset: 0 }, conn),
    countPublicReflections(theme.id, conn),
    listTopWorks(theme.id, conn),
    listRelatedThemes(theme.id, conn),
  ]);

  return {
    kind: 'ok',
    theme,
    stats: {
      quotes: theme.quote_count,
      works: theme.work_count,
      reflections,
    },
    quotes,
    featured: featured.items,
    top_works: topWorks,
    related_themes: relatedThemes,
  };
}
