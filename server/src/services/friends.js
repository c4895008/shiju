import { pool, withTransaction } from '../db/pool.js';
import { AppError } from '../errors.js';
import { escapeLike, paged } from './quotes.js';

const iso = (value) => (value ? new Date(value).toISOString() : null);

const toFriendUser = (row) => ({
  id: row.id,
  username: row.username,
  nickname: row.nickname,
  avatar_preset: row.avatar_preset,
});

const pairSql = `((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))`;

export async function areFriends(a, b, conn = pool) {
  if (a === b) return false;
  const [rows] = await conn.query(
    `SELECT 1 FROM friend_request WHERE status = 1 AND ${pairSql} LIMIT 1`,
    [a, b, b, a],
  );
  return rows.length > 0;
}

export async function friendSummary(userId, conn = pool) {
  const [[{ friend_count }]] = await conn.query(
    'SELECT COUNT(*) AS friend_count FROM friend_request WHERE status = 1 AND (requester_id = ? OR addressee_id = ?)',
    [userId, userId],
  );
  const [[{ pending_count }]] = await conn.query(
    'SELECT COUNT(*) AS pending_count FROM friend_request WHERE status = 0 AND addressee_id = ?',
    [userId],
  );
  return { friend_count: Number(friend_count), pending_count: Number(pending_count) };
}

export async function listFriends(userId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END AS id,
            u.username, u.nickname, u.avatar_preset, f.responded_at,
            (SELECT COUNT(*) FROM reflection r
              WHERE r.user_id = u.id AND r.status = 1 AND r.visibility IN (1, 2)) AS reflection_count
       FROM friend_request f
       JOIN user u
         ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
      WHERE f.status = 1 AND (f.requester_id = ? OR f.addressee_id = ?) AND u.status = 1
      ORDER BY f.responded_at DESC, f.id DESC`,
    [userId, userId, userId, userId],
  );
  return rows.map((row) => ({
    ...toFriendUser(row),
    since: iso(row.responded_at),
    reflection_count: Number(row.reflection_count),
  }));
}

export async function listFriendRequests(userId, conn = pool) {
  const [incoming] = await conn.query(
    `SELECT f.id, f.created_at, u.id AS user_id, u.username, u.nickname, u.avatar_preset
       FROM friend_request f
       JOIN user u ON u.id = f.requester_id
      WHERE f.addressee_id = ? AND f.status = 0 AND u.status = 1
      ORDER BY f.created_at DESC, f.id DESC`,
    [userId],
  );
  const [outgoing] = await conn.query(
    `SELECT f.id, f.created_at, u.id AS user_id, u.username, u.nickname, u.avatar_preset
       FROM friend_request f
       JOIN user u ON u.id = f.addressee_id
      WHERE f.requester_id = ? AND f.status = 0 AND u.status = 1
      ORDER BY f.created_at DESC, f.id DESC`,
    [userId],
  );
  const map = (row) => ({
    id: row.id,
    created_at: iso(row.created_at),
    user: {
      id: row.user_id,
      username: row.username,
      nickname: row.nickname,
      avatar_preset: row.avatar_preset,
    },
  });
  return { incoming: incoming.map(map), outgoing: outgoing.map(map), pending_count: incoming.length };
}

export async function searchUsers(userId, q, conn = pool) {
  const like = `%${escapeLike(q)}%`;
  const prefix = `${escapeLike(q)}%`;
  const [rows] = await conn.query(
    `SELECT u.id, u.username, u.nickname, u.avatar_preset,
            out_f.id AS out_id, out_f.status AS out_status,
            in_f.id AS in_id, in_f.status AS in_status
       FROM user u
       LEFT JOIN friend_request out_f ON out_f.requester_id = ? AND out_f.addressee_id = u.id
       LEFT JOIN friend_request in_f ON in_f.requester_id = u.id AND in_f.addressee_id = ?
      WHERE u.id <> ? AND u.status = 1
        AND (u.username LIKE ? ESCAPE '!' OR u.nickname LIKE ? ESCAPE '!')
      ORDER BY (u.username = ?) DESC,
               (u.nickname = ?) DESC,
               (u.username LIKE ? ESCAPE '!') DESC,
               u.id ASC
      LIMIT 10`,
    [userId, userId, userId, like, like, q, q, prefix],
  );

  return rows.map((row) => {
    let relation = 'none';
    let requestId = null;
    if (row.out_status === 1 || row.in_status === 1) {
      relation = 'friend';
    } else if (row.out_status === 0) {
      relation = 'pending_out';
      requestId = row.out_id;
    } else if (row.in_status === 0) {
      relation = 'pending_in';
      requestId = row.in_id;
    }
    return { ...toFriendUser(row), relation, request_id: requestId };
  });
}

export async function sendFriendRequest(userId, targetId) {
  if (userId === targetId) {
    throw new AppError(400, 'VALIDATION_ERROR', '不能添加自己为读友', {
      fields: { user_id: '不能添加自己为读友' },
    });
  }

  return withTransaction(async (conn) => {
    const [targets] = await conn.query('SELECT id FROM user WHERE id = ? AND status = 1', [targetId]);
    if (!targets[0]) throw new AppError(404, 'NOT_FOUND', '用户不存在');

    const [rows] = await conn.query(
      `SELECT id, requester_id, addressee_id, status
         FROM friend_request
        WHERE ${pairSql}
        FOR UPDATE`,
      [userId, targetId, targetId, userId],
    );
    const forward = rows.find((row) => row.requester_id === userId);
    const reverse = rows.find((row) => row.requester_id === targetId);

    if (forward?.status === 1 || reverse?.status === 1) {
      throw new AppError(409, 'CONFLICT', '你们已经是读友');
    }
    if (reverse?.status === 0) {
      await conn.query(
        'UPDATE friend_request SET status = 1, responded_at = NOW(3) WHERE id = ?',
        [reverse.id],
      );
      return { request: { id: reverse.id, status: 1 }, auto_accepted: true };
    }
    if (forward?.status === 0) {
      throw new AppError(409, 'CONFLICT', '已发送过申请');
    }

    if (reverse) await conn.query('DELETE FROM friend_request WHERE id = ?', [reverse.id]);
    if (forward) {
      await conn.query(
        'UPDATE friend_request SET status = 0, created_at = NOW(3), responded_at = NULL WHERE id = ?',
        [forward.id],
      );
      return { request: { id: forward.id, status: 0 }, auto_accepted: false };
    }

    const [result] = await conn.query(
      'INSERT INTO friend_request (requester_id, addressee_id, status) VALUES (?, ?, 0)',
      [userId, targetId],
    );
    return { request: { id: result.insertId, status: 0 }, auto_accepted: false };
  });
}

export async function respondFriendRequest(userId, requestId, action) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query(
      'SELECT id, addressee_id, status FROM friend_request WHERE id = ? FOR UPDATE',
      [requestId],
    );
    const row = rows[0];
    if (!row || row.addressee_id !== userId) throw new AppError(404, 'NOT_FOUND', '申请不存在');
    if (row.status !== 0) throw new AppError(409, 'CONFLICT', '这条申请已经处理过了');

    const status = action === 'accept' ? 1 : 2;
    await conn.query(
      'UPDATE friend_request SET status = ?, responded_at = NOW(3) WHERE id = ?',
      [status, requestId],
    );
    return { id: requestId, status };
  });
}

export async function cancelFriendRequest(userId, requestId) {
  const [rows] = await pool.query(
    'SELECT id, requester_id, status FROM friend_request WHERE id = ?',
    [requestId],
  );
  const row = rows[0];
  if (!row || row.requester_id !== userId) throw new AppError(404, 'NOT_FOUND', '申请不存在');
  if (row.status !== 0) throw new AppError(409, 'CONFLICT', '只能撤回待处理的申请');

  await pool.query('DELETE FROM friend_request WHERE id = ? AND status = 0', [requestId]);
  return { id: requestId, canceled: true };
}

export async function removeFriend(userId, friendId) {
  if (userId === friendId) throw new AppError(404, 'NOT_FOUND', '读友不存在');
  const [result] = await pool.query(
    `DELETE FROM friend_request WHERE status = 1 AND ${pairSql}`,
    [userId, friendId, friendId, userId],
  );
  if (!result.affectedRows) throw new AppError(404, 'NOT_FOUND', '读友不存在');
  return { removed: true };
}

export async function listFriendFeed(userId, { page, pageSize, offset }, conn = pool) {
  const friends = `SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END
                     FROM friend_request
                    WHERE status = 1 AND (requester_id = ? OR addressee_id = ?)`;
  const where = `r.status = 1 AND r.visibility IN (1, 2)
      AND r.user_id IN (${friends}) AND u.status = 1`;

  const [[{ total }]] = await conn.query(
    `SELECT COUNT(*) AS total
       FROM reflection r
       JOIN user u ON u.id = r.user_id
      WHERE ${where}`,
    [userId, userId, userId],
  );
  const [rows] = await conn.query(
    `SELECT r.id, r.body, r.visibility, r.like_count, r.created_at,
            u.id AS author_id, u.username, u.nickname, u.avatar_preset,
            q.slug AS quote_slug, q.quote_text, q.speaker,
            w.slug AS work_slug, w.title AS work_title, w.year AS work_year,
            EXISTS (
              SELECT 1 FROM reflection_like l
               WHERE l.reflection_id = r.id AND l.user_id = ?
            ) AS liked
       FROM reflection r
       JOIN user u ON u.id = r.user_id
       JOIN quote q ON q.id = r.quote_id
       JOIN work w ON w.id = q.work_id
      WHERE ${where}
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT ? OFFSET ?`,
    [userId, userId, userId, userId, pageSize, offset],
  );

  return paged(
    rows.map((row) => ({
      id: row.id,
      body: row.body,
      visibility: row.visibility,
      like_count: row.like_count,
      liked: Boolean(row.liked),
      created_at: iso(row.created_at),
      author: {
        id: row.author_id,
        username: row.username,
        nickname: row.nickname,
        avatar_preset: row.avatar_preset,
      },
      quote: { slug: row.quote_slug, text: row.quote_text, speaker: row.speaker },
      work: { slug: row.work_slug, title: row.work_title, year: row.work_year },
    })),
    { page, pageSize, total: Number(total) },
  );
}
