import { pool } from '../db/pool.js';
import { AppError } from '../errors.js';
import { paged } from './quotes.js';
import { areFriends } from './friends.js';

const iso = (value) => (value ? new Date(value).toISOString() : null);

const SELECT_COMMENT = `
  SELECT c.id, c.reflection_id, c.user_id, c.body, c.status, c.created_at,
         u.nickname, u.avatar_preset, r.user_id AS reflection_user_id, r.quote_id
    FROM reflection_comment c
    JOIN user u ON u.id = c.user_id
    JOIN reflection r ON r.id = c.reflection_id`;

const noReflection = () => new AppError(404, 'NOT_FOUND', '感悟不存在');

export function toComment(row, viewer) {
  const viewerId = viewer ? viewer.id : null;
  return {
    id: row.id,
    body: row.body,
    created_at: iso(row.created_at),
    author: { nickname: row.nickname, avatar_preset: row.avatar_preset },
    mine: viewerId !== null && row.user_id === viewerId,
    can_delete:
      viewerId !== null &&
      (row.user_id === viewerId || row.reflection_user_id === viewerId || viewer.role === 9),
  };
}

// 评论可见性完全继承感悟：感悟已隐藏或读者无权看到感悟时，一律 404，避免枚举
async function gateReflection(reflectionId, viewer, conn) {
  const [rows] = await conn.query(
    'SELECT id, quote_id, user_id, visibility FROM reflection WHERE id = ? AND status = 1',
    [reflectionId],
  );
  const target = rows[0];
  if (!target) throw noReflection();

  const viewerId = viewer ? viewer.id : null;
  if (target.visibility === 2) return target;
  if (viewerId !== null && viewerId === target.user_id) return target;
  if (target.visibility === 1 && viewerId !== null && (await areFriends(viewerId, target.user_id, conn))) {
    return target;
  }
  throw noReflection();
}

async function countComments(conn, reflectionId) {
  const [[{ total }]] = await conn.query(
    'SELECT COUNT(*) AS total FROM reflection_comment WHERE reflection_id = ? AND status = 1',
    [reflectionId],
  );
  return Number(total);
}

export async function commentCounts(reflectionIds, conn = pool) {
  const counts = new Map();
  if (!reflectionIds.length) return counts;
  const [rows] = await conn.query(
    `SELECT reflection_id, COUNT(*) AS total
       FROM reflection_comment
      WHERE reflection_id IN (?) AND status = 1
      GROUP BY reflection_id`,
    [reflectionIds],
  );
  for (const row of rows) counts.set(row.reflection_id, Number(row.total));
  return counts;
}

export async function listComments(reflectionId, viewer, { page, pageSize, offset }, conn = pool) {
  await gateReflection(reflectionId, viewer, conn);
  const total = await countComments(conn, reflectionId);
  const [rows] = await conn.query(
    `${SELECT_COMMENT}
      WHERE c.reflection_id = ? AND c.status = 1
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT ? OFFSET ?`,
    [reflectionId, pageSize, offset],
  );
  return paged(rows.map((row) => toComment(row, viewer)), { page, pageSize, total });
}

export async function createComment(reflectionId, viewer, body, conn = pool) {
  const target = await gateReflection(reflectionId, viewer, conn);
  const [res] = await conn.query(
    'INSERT INTO reflection_comment (reflection_id, user_id, body) VALUES (?, ?, ?)',
    [reflectionId, viewer.id, body],
  );
  const [rows] = await conn.query(`${SELECT_COMMENT} WHERE c.id = ?`, [res.insertId]);
  return {
    comment: toComment(rows[0], viewer),
    comment_count: await countComments(conn, reflectionId),
    quote_id: target.quote_id,
  };
}

export async function deleteComment(reflectionId, commentId, viewer, conn = pool) {
  const target = await gateReflection(reflectionId, viewer, conn);
  const [rows] = await conn.query(`${SELECT_COMMENT} WHERE c.id = ? AND c.reflection_id = ?`, [
    commentId,
    reflectionId,
  ]);
  const row = rows[0];
  if (!row) throw new AppError(404, 'NOT_FOUND', '评论不存在');
  if (!toComment(row, viewer).can_delete) {
    throw new AppError(403, 'FORBIDDEN', '没有权限删除这条评论');
  }
  await conn.query('DELETE FROM reflection_comment WHERE id = ?', [commentId]);
  return {
    comment_id: commentId,
    comment_count: await countComments(conn, reflectionId),
    quote_id: target.quote_id,
  };
}

async function findCommentParent(id, conn = pool) {
  const [rows] = await conn.query(
    `SELECT c.id, c.reflection_id, r.quote_id
       FROM reflection_comment c JOIN reflection r ON r.id = c.reflection_id
      WHERE c.id = ?`,
    [id],
  );
  if (!rows[0]) throw new AppError(404, 'NOT_FOUND', '评论不存在');
  return rows[0];
}

export async function adminListComments(reflectionId, { status, page, pageSize, offset }, conn = pool) {
  const [exists] = await conn.query('SELECT id FROM reflection WHERE id = ?', [reflectionId]);
  if (!exists[0]) throw noReflection();

  const where = ['c.reflection_id = ?'];
  const params = [reflectionId];
  if (status !== undefined) {
    where.push('c.status = ?');
    params.push(status);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const [[{ total }]] = await conn.query(
    `SELECT COUNT(*) AS total FROM reflection_comment c ${whereSql}`,
    params,
  );
  const [rows] = await conn.query(
    `${SELECT_COMMENT} ${whereSql}
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );
  return paged(
    rows.map((row) => ({
      ...toComment(row, null),
      status: row.status,
      user_id: row.user_id,
      nickname: row.nickname,
    })),
    { page, pageSize, total: Number(total) },
  );
}

export async function setCommentStatusByAdmin(id, status) {
  const parent = await findCommentParent(id);
  await pool.query('UPDATE reflection_comment SET status = ? WHERE id = ?', [status, id]);
  return { quote_id: parent.quote_id };
}

export async function deleteCommentByAdmin(id) {
  const parent = await findCommentParent(id);
  await pool.query('DELETE FROM reflection_comment WHERE id = ?', [id]);
  return { quote_id: parent.quote_id };
}
