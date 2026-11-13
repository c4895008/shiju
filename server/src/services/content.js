import { pinyin } from 'pinyin-pro';
import { pool, withTransaction } from '../db/pool.js';
import { AppError, validationError } from '../errors.js';
import { charLength, checkSlug } from '../validate.js';
import {
  normalize,
  quoteTags,
  refreshQuoteSearch,
  toQuote,
  toTheme,
  toWork,
  parsePaging,
  paged,
} from './quotes.js';

const isoDate = (value) => (value ? new Date(value).toISOString() : null);

function conflict(field, message) {
  return new AppError(409, 'CONFLICT', message, { fields: { [field]: message } });
}

function requireSlug(slug, label = 'slug') {
  const error = checkSlug(slug);
  if (error) throw validationError({ slug: `${label}：${error}` });
  return slug;
}

function slugFromTitle(title) {
  const parts = pinyin(title, { toneType: 'none', type: 'array', nonZh: 'consecutive' });
  const slug = parts
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 88)
    .replace(/-+$/g, '');
  return checkSlug(slug) ? '' : slug;
}

function requireText(value, { field, label, max, required = true }) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text && required) throw validationError({ [field]: `请填写${label}` });
  if (text && charLength(text) > max) throw validationError({ [field]: `${label}最多 ${max} 字` });
  return text || null;
}

async function idsForThemeNames(conn, names) {
  const unique = [...new Set((names || []).map((n) => String(n).trim()).filter(Boolean))];
  if (unique.length > 3) throw validationError({ themes: '每句最多 3 个主题' });
  if (!unique.length) return [];
  const [rows] = await conn.query('SELECT id FROM theme WHERE name IN (?)', [unique]);
  if (rows.length !== unique.length) {
    const found = new Set(rows.map((r) => r.id));
    throw validationError({ themes: '存在未创建的主题，请先在主题管理中创建' });
  }
  return rows.map((r) => r.id);
}

async function setQuoteThemes(conn, quoteId, themeIds) {
  await conn.query('DELETE FROM quote_theme WHERE quote_id = ?', [quoteId]);
  if (!themeIds.length) return;
  await conn.query(
    'INSERT INTO quote_theme (quote_id, theme_id) VALUES ?',
    [themeIds.map((themeId) => [quoteId, themeId])],
  );
}

async function recomputeWorkCount(conn, workId) {
  await conn.query(
    `UPDATE work
        SET quote_count = (SELECT COUNT(*) FROM quote WHERE work_id = ? AND status = 1)
      WHERE id = ?`,
    [workId, workId],
  );
}

async function themeIdsOfQuote(conn, quoteId) {
  const [rows] = await conn.query('SELECT theme_id FROM quote_theme WHERE quote_id = ?', [quoteId]);
  return rows.map((r) => r.theme_id);
}

function quoteCacheTags(row) {
  return [...quoteTags(row), 'home', 'sitemap', 'themes'];
}

// ---------------- works ----------------

export async function adminListWorks({ q, status, page, pageSize, offset }) {
  const where = [];
  const params = [];
  if (q) {
    where.push('(title LIKE ? OR original_title LIKE ? OR slug LIKE ?)');
    const like = `%${q.replace(/[!%_]/g, (ch) => `!${ch}`)}%`;
    params.push(like, like, like);
  }
  if (status !== undefined) {
    where.push('status = ?');
    params.push(status);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM work ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT id, type, slug, title, original_title, year, director, country, synopsis, status,
            quote_count, updated_at
       FROM work ${whereSql}
      ORDER BY updated_at DESC, id DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );
  return paged(
    rows.map((r) => ({ ...toWork(r), type: r.type, status: r.status, updated_at: isoDate(r.updated_at) })),
    { page, pageSize, total: Number(total) },
  );
}

export async function createWork(input) {
  const title = requireText(input.title, { field: 'title', label: '影片名', max: 120 });
  const explicit = typeof input.slug === 'string' ? input.slug.trim() : '';
  const base = explicit ? requireSlug(explicit) : slugFromTitle(title);
  if (!base) throw validationError({ slug: '无法根据片名生成 slug，请手动填写' });

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    try {
      const [res] = await pool.query(
        `INSERT INTO work (type, slug, title, original_title, year, director, country, synopsis, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.type === 2 ? 2 : 1,
          slug,
          title,
          requireText(input.original_title, { field: 'original_title', label: '原名', max: 160, required: false }),
          input.year ? Number(input.year) : null,
          requireText(input.director, { field: 'director', label: '导演', max: 120, required: false }),
          requireText(input.country, { field: 'country', label: '国家', max: 40, required: false }),
          requireText(input.synopsis, { field: 'synopsis', label: '简介', max: 1000, required: false }),
          input.status === 0 || input.status === 2 ? input.status : 1,
        ],
      );
      return { id: res.insertId, slug, tags: ['work:' + res.insertId, 'home', 'sitemap', 'themes'] };
    } catch (err) {
      if (err.code !== 'ER_DUP_ENTRY') throw err;
      if (explicit) throw conflict('slug', '这个 slug 已被使用');
    }
  }
  throw conflict('slug', '自动生成的 slug 冲突过多，请手动填写');
}

export async function updateWork(id, input) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT * FROM work WHERE id = ? FOR UPDATE', [id]);
    const current = rows[0];
    if (!current) throw new AppError(404, 'NOT_FOUND', '作品不存在');

    const slug = input.slug === undefined ? current.slug : requireSlug(input.slug);
    const title = input.title === undefined ? current.title : requireText(input.title, { field: 'title', label: '影片名', max: 120 });
    const status = input.status === undefined ? current.status : input.status;

    if (slug !== current.slug) {
      await conn.query(
        'INSERT IGNORE INTO slug_redirect (entity, old_slug, new_slug) VALUES (2, ?, ?)',
        [current.slug, slug],
      );
    }

    try {
      await conn.query(
        `UPDATE work SET slug = ?, title = ?, original_title = ?, year = ?, director = ?,
                country = ?, synopsis = ?, status = ?
          WHERE id = ?`,
        [
          slug,
          title,
          input.original_title === undefined ? current.original_title : requireText(input.original_title, { field: 'original_title', label: '原名', max: 160, required: false }),
          input.year === undefined ? current.year : input.year ? Number(input.year) : null,
          input.director === undefined ? current.director : requireText(input.director, { field: 'director', label: '导演', max: 120, required: false }),
          input.country === undefined ? current.country : requireText(input.country, { field: 'country', label: '国家', max: 40, required: false }),
          input.synopsis === undefined ? current.synopsis : requireText(input.synopsis, { field: 'synopsis', label: '简介', max: 1000, required: false }),
          status,
          id,
        ],
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw conflict('slug', '这个 slug 已被使用');
      throw err;
    }

    return { id, tags: [`work:${id}`, 'home', 'sitemap', 'themes'] };
  });
}

// ---------------- quotes ----------------

export async function adminListQuotes({ workId, status, q, page, pageSize, offset }) {
  const where = [];
  const params = [];
  if (workId) {
    where.push('q.work_id = ?');
    params.push(workId);
  }
  if (status !== undefined) {
    where.push('q.status = ?');
    params.push(status);
  }
  if (q) {
    where.push('(q.quote_text LIKE ? OR q.slug LIKE ?)');
    const like = `%${q.replace(/[!%_]/g, (ch) => `!${ch}`)}%`;
    params.push(like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM quote q ${whereSql}`,
    params,
  );
  const [rows] = await pool.query(
    `SELECT q.*, w.title AS work_title, w.slug AS work_slug
       FROM quote q JOIN work w ON w.id = q.work_id
       ${whereSql}
      ORDER BY q.updated_at DESC, q.id DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );
  const ids = rows.map((r) => r.id);
  let themeRows = [];
  if (ids.length) {
    [themeRows] = await pool.query(
      `SELECT qt.quote_id, t.id, t.name FROM quote_theme qt JOIN theme t ON t.id = qt.theme_id WHERE qt.quote_id IN (?)`,
      [ids],
    );
  }
  const themeMap = new Map();
  for (const t of themeRows) {
    if (!themeMap.has(t.quote_id)) themeMap.set(t.quote_id, []);
    themeMap.get(t.quote_id).push({ id: t.id, name: t.name });
  }
  return paged(
    rows.map((r) => ({
      id: r.id,
      work_id: r.work_id,
      work: { slug: r.work_slug, title: r.work_title },
      slug: r.slug,
      text: r.quote_text,
      speaker: r.speaker,
      context: r.context,
      themes: themeMap.get(r.id) || [],
      featured: Boolean(r.featured),
      status: r.status,
      published_at: isoDate(r.published_at),
      updated_at: isoDate(r.updated_at),
    })),
    { page, pageSize, total: Number(total) },
  );
}

function quoteInput(input, current) {
  const text =
    input.text === undefined && current
      ? current.quote_text
      : requireText(input.text, { field: 'text', label: '台词', max: 140 });
  const context =
    input.context === undefined && current
      ? current.context
      : requireText(input.context, { field: 'context', label: '场景说明', max: 800 });
  const speaker =
    input.speaker === undefined
      ? current?.speaker ?? null
      : requireText(input.speaker, { field: 'speaker', label: '角色', max: 60, required: false });
  return { text, context, speaker };
}

export async function createQuote(input) {
  return withTransaction(async (conn) => {
    const [works] = await conn.query('SELECT id FROM work WHERE id = ?', [input.work_id]);
    if (!works[0]) throw validationError({ work_id: '作品不存在' });
    const workId = works[0].id;
    const slug = requireSlug(input.slug);
    const { text, context, speaker } = quoteInput(input);
    const status = [0, 1, 2, 3].includes(input.status) ? input.status : 1;
    const themeIds = await idsForThemeNames(conn, input.themes);

    let id;
    try {
      const [res] = await conn.query(
        `INSERT INTO quote (work_id, slug, quote_text, speaker, context, search_text, pinyin,
                            featured, status, published_at)
         VALUES (?, ?, ?, ?, ?, '', '', ?, ?, ?)`,
        [workId, slug, text, speaker, context, input.featured ? 1 : 0, status, status === 1 ? new Date() : null],
      );
      id = res.insertId;
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw conflict('slug', '这个 slug 已被使用');
      throw err;
    }

    await setQuoteThemes(conn, id, themeIds);
    await refreshQuoteSearch(id, conn);
    await recomputeWorkCount(conn, workId);
    return { id, tags: quoteCacheTags({ id, work_id: workId, theme_ids: themeIds }) };
  });
}

export async function updateQuote(id, input) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT * FROM quote WHERE id = ? FOR UPDATE', [id]);
    const current = rows[0];
    if (!current) throw new AppError(404, 'NOT_FOUND', '台词不存在');

    const slug = input.slug === undefined ? current.slug : requireSlug(input.slug);
    const { text, context, speaker } = quoteInput(input, current);
    const status = input.status === undefined ? current.status : input.status;
    const featured = input.featured === undefined ? current.featured : input.featured ? 1 : 0;
    const workId = input.work_id === undefined ? current.work_id : Number(input.work_id);

    if (slug !== current.slug) {
      await conn.query(
        'INSERT IGNORE INTO slug_redirect (entity, old_slug, new_slug) VALUES (1, ?, ?)',
        [current.slug, slug],
      );
    }

    const publishedAt =
      status === 1 && current.status !== 1
        ? new Date()
        : status === 1
          ? current.published_at ?? new Date()
          : current.published_at;

    try {
      await conn.query(
        `UPDATE quote SET work_id = ?, slug = ?, quote_text = ?, speaker = ?, context = ?,
                featured = ?, status = ?, published_at = ?
          WHERE id = ?`,
        [workId, slug, text, speaker, context, featured, status, publishedAt, id],
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw conflict('slug', '这个 slug 已被使用');
      throw err;
    }

    if (input.themes !== undefined) {
      const themeIds = await idsForThemeNames(conn, input.themes);
      await setQuoteThemes(conn, id, themeIds);
    }
    await refreshQuoteSearch(id, conn);
    await recomputeWorkCount(conn, current.work_id);
    if (workId !== current.work_id) await recomputeWorkCount(conn, workId);

    const themeIds = await themeIdsOfQuote(conn, id);
    return {
      id,
      tags: [
        ...quoteCacheTags({ id, work_id: current.work_id, theme_ids: themeIds }),
        `work:${workId}`,
        'home',
        'sitemap',
      ],
    };
  });
}

export async function setQuoteStatus(id, status) {
  if (![0, 1, 2, 3].includes(status)) throw validationError({ status: '状态不正确' });
  return withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT id, work_id FROM quote WHERE id = ? FOR UPDATE', [id]);
    if (!rows[0]) throw new AppError(404, 'NOT_FOUND', '台词不存在');
    const publishedAt = status === 1 ? new Date() : null;
    await conn.query(
      'UPDATE quote SET status = ?, published_at = COALESCE(?, published_at) WHERE id = ?',
      [status, publishedAt, id],
    );
    await recomputeWorkCount(conn, rows[0].work_id);
    const themeIds = await themeIdsOfQuote(conn, id);
    return {
      id,
      tags: [
        ...quoteCacheTags({ id, work_id: rows[0].work_id, theme_ids: themeIds }),
        'home',
        'sitemap',
      ],
    };
  });
}

export async function bulkCreateQuotes({ work_id, items }) {
  if (!Array.isArray(items) || !items.length) throw validationError({ items: '请提供至少一句台词' });
  if (items.length > 200) throw validationError({ items: '单次最多导入 200 句' });
  return withTransaction(async (conn) => {
    const [works] = await conn.query('SELECT id FROM work WHERE id = ?', [work_id]);
    if (!works[0]) throw validationError({ work_id: '作品不存在' });
    const created = [];
    for (const item of items) {
      const slug = requireSlug(item.slug);
      const { text, context, speaker } = quoteInput(item);
      const themeIds = await idsForThemeNames(conn, item.themes);
      const [res] = await conn.query(
        `INSERT INTO quote (work_id, slug, quote_text, speaker, context, search_text, pinyin,
                            featured, status, published_at)
         VALUES (?, ?, ?, ?, ?, '', '', ?, 1, NOW(3))`,
        [work_id, slug, text, speaker, context, item.featured ? 1 : 0],
      );
      await setQuoteThemes(conn, res.insertId, themeIds);
      await refreshQuoteSearch(res.insertId, conn);
      created.push(res.insertId);
    }
    await recomputeWorkCount(conn, work_id);
    return { ids: created, count: created.length, tags: ['work:' + work_id, 'home', 'sitemap', 'themes'] };
  });
}

// ---------------- themes ----------------

export async function adminListThemes() {
  const [rows] = await pool.query(
    `SELECT t.id, t.slug, t.name, t.description, t.sort_order, t.status, t.updated_at,
            COUNT(q.id) AS quote_count
       FROM theme t
       LEFT JOIN quote_theme qt ON qt.theme_id = t.id
       LEFT JOIN quote q ON q.id = qt.quote_id AND q.status = 1
      GROUP BY t.id
      ORDER BY t.sort_order, t.id`,
  );
  return rows.map((r) => ({
    ...toTheme({ ...r, quote_count: Number(r.quote_count) }),
    sort_order: r.sort_order,
    status: r.status,
    updated_at: isoDate(r.updated_at),
  }));
}

export async function createTheme(input) {
  const slug = requireSlug(input.slug);
  const name = requireText(input.name, { field: 'name', label: '主题名', max: 30 });
  try {
    const [res] = await pool.query(
      'INSERT INTO theme (slug, name, description, sort_order, status) VALUES (?, ?, ?, ?, ?)',
      [
        slug,
        name,
        requireText(input.description, { field: 'description', label: '描述', max: 300, required: false }),
        Number(input.sort_order) || 0,
        input.status === 0 ? 0 : 1,
      ],
    );
    return { id: res.insertId, tags: [`theme:${res.insertId}`, 'home', 'sitemap', 'themes'] };
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw conflict('slug', '主题 slug 或名称已存在');
    throw err;
  }
}

export async function updateTheme(id, input) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT * FROM theme WHERE id = ? FOR UPDATE', [id]);
    const current = rows[0];
    if (!current) throw new AppError(404, 'NOT_FOUND', '主题不存在');

    const slug = input.slug === undefined ? current.slug : requireSlug(input.slug);
    if (slug !== current.slug) {
      await conn.query(
        'INSERT IGNORE INTO slug_redirect (entity, old_slug, new_slug) VALUES (3, ?, ?)',
        [current.slug, slug],
      );
    }
    try {
      await conn.query(
        'UPDATE theme SET slug = ?, name = ?, description = ?, sort_order = ?, status = ? WHERE id = ?',
        [
          slug,
          input.name === undefined ? current.name : requireText(input.name, { field: 'name', label: '主题名', max: 30 }),
          input.description === undefined
            ? current.description
            : requireText(input.description, { field: 'description', label: '描述', max: 300, required: false }),
          input.sort_order === undefined ? current.sort_order : Number(input.sort_order) || 0,
          input.status === undefined ? current.status : input.status === 0 ? 0 : 1,
          id,
        ],
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw conflict('slug', '主题 slug 或名称已存在');
      throw err;
    }
    return { id, tags: [`theme:${id}`, 'home', 'sitemap', 'themes'] };
  });
}

// ---------------- daily pick ----------------

const PICK_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertPickDate(date) {
  if (!PICK_DATE.test(date)) throw validationError({ date: '日期格式应为 YYYY-MM-DD' });
}

export async function getDailyPick(date) {
  assertPickDate(date);
  const [rows] = await pool.query(
    `SELECT dp.note, q.id, q.slug, q.quote_text AS text, q.speaker,
            w.title AS work_title
       FROM daily_pick dp
       JOIN quote q ON q.id = dp.quote_id
       JOIN work w ON w.id = q.work_id
      WHERE dp.pick_date = ?`,
    [date],
  );
  const row = rows[0];
  return {
    date,
    note: row?.note ?? null,
    quote: row
      ? {
          id: row.id,
          slug: row.slug,
          text: row.text,
          speaker: row.speaker,
          work_title: row.work_title,
        }
      : null,
  };
}

export async function setDailyPick(date, { quote_id, note }) {
  assertPickDate(date);
  const [quotes] = await pool.query('SELECT id FROM quote WHERE id = ? AND status = 1', [quote_id]);
  if (!quotes[0]) throw validationError({ quote_id: '台词不存在或未发布' });
  await pool.query(
    `INSERT INTO daily_pick (pick_date, quote_id, note) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE quote_id = VALUES(quote_id), note = VALUES(note)`,
    [date, quote_id, requireText(note, { field: 'note', label: '备注', max: 200, required: false })],
  );
  return { tags: ['daily', 'home'] };
}

// ---------------- overview ----------------

export async function adminOverview() {
  const [quoteRows] = await pool.query('SELECT status, COUNT(*) AS n FROM quote GROUP BY status');
  const [workRows] = await pool.query('SELECT status, COUNT(*) AS n FROM work GROUP BY status');
  const [themeRows] = await pool.query('SELECT status, COUNT(*) AS n FROM theme GROUP BY status');
  const [[requestRow]] = await pool.query('SELECT COUNT(*) AS n FROM quote_request WHERE status = 1');
  const [[reflectionRow]] = await pool.query('SELECT COUNT(*) AS n FROM reflection WHERE status = 2');

  const byStatus = (rows) => {
    const map = new Map(rows.map((row) => [Number(row.status), Number(row.n)]));
    return {
      total: [...map.values()].reduce((sum, n) => sum + n, 0),
      at: (status) => map.get(status) || 0,
    };
  };
  const quotes = byStatus(quoteRows);
  const works = byStatus(workRows);
  const themes = byStatus(themeRows);

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
  const [pickRows] = await pool.query(
    `SELECT dp.note, q.id, q.slug, q.quote_text AS text, w.title AS work_title
       FROM daily_pick dp
       JOIN quote q ON q.id = dp.quote_id
       JOIN work w ON w.id = q.work_id
      WHERE dp.pick_date = ? AND q.status = 1 AND w.status = 1`,
    [today],
  );

  return {
    quotes: {
      total: quotes.total,
      published: quotes.at(1),
      draft: quotes.at(0),
      offline: quotes.at(2),
      removed: quotes.at(3),
    },
    works: { total: works.total, published: works.at(1) },
    themes: { total: themes.total, published: themes.at(1) },
    requests: { pending: Number(requestRow.n) },
    reflections: { hidden: Number(reflectionRow.n) },
    daily: {
      date: today,
      note: pickRows[0]?.note ?? null,
      quote: pickRows[0]
        ? {
            id: pickRows[0].id,
            slug: pickRows[0].slug,
            text: pickRows[0].text,
            work_title: pickRows[0].work_title,
          }
        : null,
    },
  };
}

// ---------------- quote requests ----------------

export async function createQuoteRequest(userId, input) {
  const [res] = await pool.query(
    'INSERT INTO quote_request (user_id, text, work_title, note) VALUES (?, ?, ?, ?)',
    [userId, input.text, input.work_title, input.note],
  );
  return { id: res.insertId };
}

function toAdminRequest(row) {
  return {
    id: row.id,
    text: row.text,
    work_title: row.work_title,
    note: row.note,
    status: row.status,
    nickname: row.nickname,
    created_at: isoDate(row.created_at),
  };
}

export async function adminListRequests({ status, page, pageSize, offset }) {
  const where = [];
  const params = [];
  if (status !== undefined) {
    where.push('r.status = ?');
    params.push(status);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM quote_request r ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT r.*, u.nickname FROM quote_request r JOIN user u ON u.id = r.user_id
      ${whereSql} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );
  return paged(rows.map(toAdminRequest), { page, pageSize, total: Number(total) });
}

export async function getQuoteRequest(id) {
  const [rows] = await pool.query(
    `SELECT r.*, u.nickname FROM quote_request r JOIN user u ON u.id = r.user_id
      WHERE r.id = ?`,
    [id],
  );
  if (!rows[0]) throw new AppError(404, 'NOT_FOUND', '请求不存在');
  return toAdminRequest(rows[0]);
}

export async function setRequestStatus(id, status) {
  if (![1, 2, 3].includes(status)) throw validationError({ status: '状态不正确' });
  const [res] = await pool.query('UPDATE quote_request SET status = ? WHERE id = ?', [status, id]);
  if (!res.affectedRows) throw new AppError(404, 'NOT_FOUND', '请求不存在');
  return { id, status };
}

export { parsePaging, normalize };
