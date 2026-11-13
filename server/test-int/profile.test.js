import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db/pool.js';
import { hashPassword, signToken, verifyPassword, verifyToken } from '../src/services/auth.js';
import {
  changePassword,
  findById,
  toPublicUser,
  updateAvatarPreset,
  updateNickname,
} from '../src/services/users.js';

const ids = {};

async function assertTestDb() {
  const [[row]] = await pool.query('SELECT DATABASE() AS db');
  if (!String(row.db || '').endsWith('_test')) {
    throw new Error(`集成测试只能运行在 *_test 数据库，当前为 ${row.db}`);
  }
}

async function cleanFixtures() {
  await pool.query("DELETE FROM `user` WHERE username LIKE 'itest\\_profile\\_%'");
}

before(async () => {
  await assertTestDb();
  await cleanFixtures();

  const [res] = await pool.query(
    "INSERT INTO `user` (username, password_hash, nickname, avatar_preset) VALUES ('itest_profile_a', ?, '初始昵称', 0)",
    [await hashPassword('oldpass123')],
  );
  ids.user = res.insertId;
});

after(async () => {
  await cleanFixtures().catch(() => {});
  await pool.end();
});

test('昵称与头像更新后持久化', async () => {
  const renamed = await updateNickname(ids.user, '新的昵称');
  assert.equal(renamed.nickname, '新的昵称');

  const reavatared = await updateAvatarPreset(ids.user, 7);
  assert.equal(reavatared.avatar_preset, 7);

  const reloaded = await findById(ids.user);
  assert.equal(reloaded.nickname, '新的昵称');
  assert.equal(reloaded.avatar_preset, 7);
});

test('公开用户字段包含 ISO 格式的 created_at', async () => {
  const row = await findById(ids.user);
  const publicUser = toPublicUser(row);
  assert.equal(publicUser.nickname, '新的昵称');
  assert.equal(publicUser.avatar_preset, 7);
  assert.equal(publicUser.created_at, new Date(row.created_at).toISOString());
  assert.match(publicUser.created_at, /^\d{4}-\d{2}-\d{2}T/);
});

test('改密递增 token_version，旧 token 失效、新 token 有效', async () => {
  const before = await findById(ids.user);
  const oldToken = signToken(before);
  assert.equal(verifyToken(oldToken).tv, before.token_version);

  const fresh = await changePassword(ids.user, await hashPassword('newpass123'));
  assert.equal(fresh.token_version, before.token_version + 1);
  assert.equal(await verifyPassword('newpass123', fresh.password_hash), true);
  assert.equal(await verifyPassword('oldpass123', fresh.password_hash), false);
  assert.notEqual(fresh.password_hash, 'newpass123');

  assert.equal(verifyToken(oldToken).tv, before.token_version);
  assert.notEqual(verifyToken(oldToken).tv, fresh.token_version);

  const newToken = signToken(fresh);
  assert.equal(verifyToken(newToken).tv, fresh.token_version);
});

test('更新不存在的用户返回 404', async () => {
  await assert.rejects(() => updateNickname(999_999_999, '无人'), /用户不存在/);
  await assert.rejects(() => updateAvatarPreset(999_999_999, 3), /用户不存在/);
  await assert.rejects(() => changePassword(999_999_999, 'x'), /用户不存在/);
});
