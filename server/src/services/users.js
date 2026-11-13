import { pool } from '../db/pool.js';
import { AppError } from '../errors.js';

export const PRESET_COUNT = 12;
export const presetForId = (id) => (Number(id) - 1) % PRESET_COUNT;

const COLUMNS =
  'id, username, password_hash, nickname, avatar_preset, role, token_version, status, agreed_at, created_at';

const iso = (value) => (value ? new Date(value).toISOString() : null);

export async function findByUsername(username) {
  const [rows] = await pool.query(`SELECT ${COLUMNS} FROM \`user\` WHERE username = ?`, [username]);
  return rows[0] || null;
}

export async function findById(id) {
  const [rows] = await pool.query(`SELECT ${COLUMNS} FROM \`user\` WHERE id = ?`, [id]);
  return rows[0] || null;
}

export async function usernameExists(username) {
  const [rows] = await pool.query('SELECT 1 FROM `user` WHERE username = ?', [username]);
  return rows.length > 0;
}

export async function createUser({ username, passwordHash, nickname }) {
  try {
    const [res] = await pool.query(
      'INSERT INTO `user` (username, password_hash, nickname, avatar_preset, agreed_at) VALUES (?, ?, ?, ?, NOW(3))',
      [username, passwordHash, nickname, 0],
    );
    await pool.query('UPDATE `user` SET avatar_preset = ? WHERE id = ?', [presetForId(res.insertId), res.insertId]);
    return findById(res.insertId);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new AppError(409, 'USERNAME_TAKEN', '这个用户名已经被使用了', {
        fields: { username: '这个用户名已经被使用了' },
      });
    }
    throw err;
  }
}

export async function updateNickname(id, nickname) {
  const [res] = await pool.query('UPDATE `user` SET nickname = ? WHERE id = ?', [nickname, id]);
  if (!res.affectedRows) throw new AppError(404, 'NOT_FOUND', '用户不存在');
  return findById(id);
}

export async function updateAvatarPreset(id, preset) {
  const [res] = await pool.query('UPDATE `user` SET avatar_preset = ? WHERE id = ?', [preset, id]);
  if (!res.affectedRows) throw new AppError(404, 'NOT_FOUND', '用户不存在');
  return findById(id);
}

export async function changePassword(id, passwordHash) {
  const [res] = await pool.query(
    'UPDATE `user` SET password_hash = ?, token_version = token_version + 1 WHERE id = ?',
    [passwordHash, id],
  );
  if (!res.affectedRows) throw new AppError(404, 'NOT_FOUND', '用户不存在');
  return findById(id);
}

export async function createAdmin({ username, passwordHash, nickname }) {
  const [res] = await pool.query(
    'INSERT INTO `user` (username, password_hash, nickname, avatar_preset, role, agreed_at) VALUES (?, ?, ?, 0, 9, NOW(3))',
    [username, passwordHash, nickname],
  );
  await pool.query('UPDATE `user` SET avatar_preset = ? WHERE id = ?', [presetForId(res.insertId), res.insertId]);
  return findById(res.insertId);
}

export function toPublicUser(row) {
  return {
    id: row.id,
    username: row.username,
    nickname: row.nickname,
    avatar_preset: row.avatar_preset ?? presetForId(row.id),
    role: row.role,
    created_at: iso(row.created_at),
  };
}
