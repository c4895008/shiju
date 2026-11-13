import { pool, withTransaction } from '../db/pool.js';
import { AppError } from '../errors.js';
import { paged } from './quotes.js';
import { areFriends } from './friends.js';
import { commentCounts } from './comments.js';

const iso = (value) => (value ? new Date(value).toISOString() : null);

const SELECT_REFLECTION = `
  SELECT r.id, r.quote_id, r.user_id, r.body, r.visibility, r.status, r.like_count,
         r.published_at, r.created_at, r.updated_at,
         u.nickname, u.avatar_preset,
         q.slug AS quote_slug, q.quote_text, q.speaker, q.context,
         w.id AS work_id, w.slug AS work_slug, w.title AS work_title, w.year AS work_year
    FROM reflection r
    JOIN user u ON u.id = r.user_id
    JOIN quote q ON q.id = r.quote_id
    JOIN work w ON w.id = q.work_id`;

export const VISIBILITY_LABEL = { 0: '私密', 1: '好友', 2: '公开' };

export function toPublicReflection(row, commentCount = 0) {
  return {
    id: row.id,
    body: row.body,
    created_at: iso(row.created_at),
    like_count: row.like_count,
    comment_count: commentCount,
    author: { nickname: row.nickname, avatar_preset: row.avatar_preset },
    mine: false,
  };
}

export function toMyReflection(row) {
  return {
    id: row.id,
    body: row.body,
    visibility: row.visibility,
    status: row.status,
    like_count: row.like_count,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
    published_at: iso(row.published_at),
    quote: {
      id: row.quote_id,
      slug: row.quote_slug,
      text: row.quote_text,
      speaker: row.speaker,
      context: row.context,
    },
    work: {
      id: row.work_id,
      slug: row.work_slug,
      title: row.work_title,
      year: row.work_year,
    },
  };
}

export async function listPublicReflections(quoteId, { page, pageSize, offset }, conn = pool) {
  const where = 'r.quote_id = ? AND r.visibility = 2 AND r.status = 1';
  const [[{ total }]] = await conn.query(
    `SELECT COUNT(*) AS total FROM reflection r WHERE ${where}`,
    [quoteId],
  );
  const [rows] = await conn.query(
    `${SELECT_REFLECTION} WHERE ${where}
      ORDER BY r.like_count DESC, r.created_at DESC, r.id DESC
      LIMIT ? OFFSET ?`,
    [quoteId, pageSize, offset],
  );
  const counts = await commentCounts(rows.map((row) => row.id), conn);
  return paged(
    rows.map((row) => toPublicReflection(row, counts.get(row.id) || 0)),
    { page, pageSize, total: Number(total) },
  );
}

export async function findMine(userId, quoteId, conn = pool) {
  const [rows] = await conn.query(
    `${SELECT_REFLECTION} WHERE r.user_id = ? AND r.quote_id = ?`,
    [userId, quoteId],
  );
  return rows[0] ? toMyReflection(rows[0]) : null;
}

export async function findByIdForUser(id, userId, conn = pool) {
  const [rows] = await conn.query(
    `${SELECT_REFLECTION} WHERE r.id = ? AND r.user_id = ?`,
    [id, userId],
  );
  return rows[0] || null;
}

const HIDDEN_MESSAGE = '感悟已被管理员隐藏，无法修改';

export async function createReflection(userId, quoteId, { body, visibility }) {
  try {
    const [res] = await pool.query(
      `INSERT INTO reflection (quote_id, user_id, body, visibility, published_at)
       VALUES (?, ?, ?, ?, ?)`,
      [quoteId, userId, body, visibility, visibility === 2 ? new Date() : null],
    );
    const row = await findByIdForUser(res.insertId, userId);
    return { reflection: toMyReflection(row), quote_id: quoteId };
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new AppError(409, 'CONFLICT', '同句已有感悟，可前往修改', { quote_id: quoteId });
    }
    throw err;
  }
}

export async function updateReflectionBody(id, userId, body) {
  const row = await findByIdForUser(id, userId);
  if (!row) throw new AppError(404, 'NOT_FOUND', '感悟不存在');
  if (row.status === 2) throw new AppError(403, 'FORBIDDEN', HIDDEN_MESSAGE);
  await pool.query('UPDATE reflection SET body = ? WHERE id = ?', [body, id]);
  const updated = await findByIdForUser(id, userId);
  return { reflection: toMyReflection(updated), quote_id: row.quote_id };
}

export async function updateReflectionVisibility(id, userId, visibility) {
  const row = await findByIdForUser(id, userId);
  if (!row) throw new AppError(404, 'NOT_FOUND', '感悟不存在');
  if (row.status === 2) throw new AppError(403, 'FORBIDDEN', HIDDEN_MESSAGE);
  await pool.query(
    `UPDATE reflection
        SET visibility = ?,
            published_at = CASE
              WHEN ? = 2 AND published_at IS NULL THEN NOW(3)
              ELSE published_at
            END
      WHERE id = ?`,
    [visibility, visibility, id],
  );
  const updated = await findByIdForUser(id, userId);
  return { reflection: toMyReflection(updated), quote_id: row.quote_id };
}

export async function deleteReflection(id, userId) {
  const row = await findByIdForUser(id, userId);
  if (!row) throw new AppError(404, 'NOT_FOUND', '感悟不存在');
  await pool.query('DELETE FROM reflection WHERE id = ?', [id]);
  return { quote_id: row.quote_id };
}

async function lockLikeTarget(conn, reflectionId, userId) {
  const [rows] = await conn.query(
    'SELECT id, quote_id, user_id, visibility FROM reflection WHERE id = ? AND status = 1 FOR UPDATE',
    [reflectionId],
  );
  const target = rows[0];
  if (!target || target.visibility === 0) throw new AppError(404, 'NOT_FOUND', '感悟不存在');
  if (target.visibility === 1 && !(await areFriends(userId, target.user_id, conn))) {
    throw new AppError(404, 'NOT_FOUND', '感悟不存在');
  }
  return target;
}

export async function likeReflection(reflectionId, userId) {
  return withTransaction(async (conn) => {
    const target = await lockLikeTarget(conn, reflectionId, userId);

    const [result] = await conn.query(
      'INSERT IGNORE INTO reflection_like (reflection_id, user_id) VALUES (?, ?)',
      [reflectionId, userId],
    );
    if (result.affectedRows === 1) {
      await conn.query('UPDATE reflection SET like_count = like_count + 1 WHERE id = ?', [reflectionId]);
    }
    const [[{ like_count }]] = await conn.query(
      'SELECT like_count FROM reflection WHERE id = ?',
      [reflectionId],
    );
    return { liked: true, like_count, quote_id: target.quote_id };
  });
}

export async function unlikeReflection(reflectionId, userId) {
  return withTransaction(async (conn) => {
    const target = await lockLikeTarget(conn, reflectionId, userId);

    const [result] = await conn.query(
      'DELETE FROM reflection_like WHERE reflection_id = ? AND user_id = ?',
      [reflectionId, userId],
    );
    if (result.affectedRows === 1) {
      await conn.query(
        'UPDATE reflection SET like_count = GREATEST(like_count, 1) - 1 WHERE id = ?',
        [reflectionId],
      );
    }
    const [[{ like_count }]] = await conn.query(
      'SELECT like_count FROM reflection WHERE id = ?',
      [reflectionId],
    );
    return { liked: false, like_count, quote_id: target.quote_id };
  });
}

export async function likedReflectionIds(userId, quoteId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT l.reflection_id
       FROM reflection_like l JOIN reflection r ON r.id = l.reflection_id
      WHERE l.user_id = ? AND r.quote_id = ? AND r.visibility = 2 AND r.status = 1`,
    [userId, quoteId],
  );
  return rows.map((r) => r.reflection_id);
}

export async function listMine(userId, { page, pageSize, offset }, conn = pool) {
  const [[{ total }]] = await conn.query(
    'SELECT COUNT(*) AS total FROM reflection r WHERE r.user_id = ?',
    [userId],
  );
  const [rows] = await conn.query(
    `${SELECT_REFLECTION}
      WHERE r.user_id = ?
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT ? OFFSET ?`,
    [userId, pageSize, offset],
  );

  const groups = [];
  const index = new Map();
  for (const row of rows) {
    const item = toMyReflection(row);
    if (!index.has(row.work_id)) {
      index.set(row.work_id, { work: item.work, reflections: [] });
      groups.push(index.get(row.work_id));
    }
    index.get(row.work_id).reflections.push({
      id: item.id,
      body: item.body,
      visibility: item.visibility,
      status: item.status,
      like_count: item.like_count,
      created_at: item.created_at,
      quote: item.quote,
    });
  }

  return {
    ...paged(groups, { page, pageSize, total: Number(total) }),
    reflection_total: Number(total),
  };
}

export async function eachMyReflection(userId, batchSize, fn, conn = pool) {
  let offset = 0;
  for (;;) {
    const [rows] = await conn.query(
      `${SELECT_REFLECTION}
        WHERE r.user_id = ? AND r.status = 1
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT ? OFFSET ?`,
      [userId, batchSize, offset],
    );
    if (!rows.length) return;
    await fn(rows);
    if (rows.length < batchSize) return;
    offset += batchSize;
  }
}

export async function setStatusByAdmin(id, status) {
  const [rows] = await pool.query('SELECT id, quote_id FROM reflection WHERE id = ?', [id]);
  if (!rows[0]) throw new AppError(404, 'NOT_FOUND', '感悟不存在');
  await pool.query('UPDATE reflection SET status = ? WHERE id = ?', [status, id]);
  return { quote_id: rows[0].quote_id };
}

export async function adminList({ status, visibility, page, pageSize, offset }, conn = pool) {
  const where = [];
  const params = [];
  if (status !== undefined) {
    where.push('r.status = ?');
    params.push(status);
  }
  if (visibility !== undefined) {
    where.push('r.visibility = ?');
    params.push(visibility);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await conn.query(`SELECT COUNT(*) AS total FROM reflection r ${whereSql}`, params);
  const [rows] = await conn.query(
    `${SELECT_REFLECTION} ${whereSql}
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );
  const counts = await commentCounts(rows.map((row) => row.id), conn);
  return paged(
    rows.map((row) => ({
      ...toMyReflection(row),
      status: row.status,
      user_id: row.user_id,
      nickname: row.nickname,
      comment_count: counts.get(row.id) || 0,
    })),
    { page, pageSize, total: Number(total) },
  );
}
