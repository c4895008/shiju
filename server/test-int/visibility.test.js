import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db/pool.js';
import { createReflection, deleteReflection, eachMyReflection, findMine, likeReflection, listMine, listPublicReflections, unlikeReflection, updateReflectionBody, updateReflectionVisibility } from '../src/services/reflections.js';

const ids = {};

async function assertTestDb() {
  const [[row]] = await pool.query('SELECT DATABASE() AS db');
  if (!String(row.db || '').endsWith('_test')) {
    throw new Error(`集成测试只能运行在 *_test 数据库，当前为 ${row.db}`);
  }
}

async function cleanFixtures() {
  const [users] = await pool.query("SELECT id FROM `user` WHERE username LIKE 'itest\\_%'");
  const userIds = users.map((row) => row.id);
  if (userIds.length) {
    await pool.query('DELETE FROM reflection_like WHERE user_id IN (?)', [userIds]);
    await pool.query('DELETE FROM reflection WHERE user_id IN (?)', [userIds]);
    await pool.query('DELETE FROM quote_request WHERE user_id IN (?)', [userIds]);
  }
  const [works] = await pool.query("SELECT id FROM work WHERE slug LIKE 'itest-%'");
  const workIds = works.map((row) => row.id);
  if (workIds.length) {
    await pool.query('DELETE FROM quote WHERE work_id IN (?)', [workIds]);
    await pool.query('DELETE FROM work WHERE id IN (?)', [workIds]);
  }
  await pool.query("DELETE FROM `user` WHERE username LIKE 'itest\\_%'");
}

before(async () => {
  await assertTestDb();
  await cleanFixtures();

  const [a] = await pool.query(
    "INSERT INTO `user` (username, password_hash, nickname) VALUES ('itest_a', 'x', '读者A')",
  );
  const [b] = await pool.query(
    "INSERT INTO `user` (username, password_hash, nickname) VALUES ('itest_b', 'x', '读者B')",
  );
  const [w] = await pool.query(
    "INSERT INTO work (slug, title, status) VALUES ('itest-film', '测试影片', 1)",
  );
  const [q] = await pool.query(
    `INSERT INTO quote (work_id, slug, quote_text, context, search_text, pinyin, status, published_at)
     VALUES (?, 'itest-quote', '测试台词', '测试场景', '测试台词测试影片', 'ceshi', 1, NOW(3))`,
    [w.insertId],
  );
  ids.userA = a.insertId;
  ids.userB = b.insertId;
  ids.work = w.insertId;
  ids.quote = q.insertId;
});

after(async () => {
  await cleanFixtures().catch(() => {});
  await pool.end();
});

test('公开列表只返回 visibility=2 且 status=1', async () => {
  const pub = await createReflection(ids.userA, ids.quote, { body: '公开感悟', visibility: 2 });
  const priv = await createReflection(ids.userB, ids.quote, { body: '私密感悟', visibility: 0 });

  const list = await listPublicReflections(ids.quote, { page: 1, pageSize: 10, offset: 0 });
  assert.equal(list.total, 1);
  assert.equal(list.items[0].id, pub.reflection.id);
  assert.equal(list.items[0].body, '公开感悟');

  await pool.query('UPDATE reflection SET status = 2 WHERE id = ?', [pub.reflection.id]);
  const hidden = await listPublicReflections(ids.quote, { page: 1, pageSize: 10, offset: 0 });
  assert.equal(hidden.total, 0);

  await pool.query('DELETE FROM reflection WHERE id = ?', [priv.reflection.id]);
});

test('同一用户同一台词只能有一条感悟', async () => {
  await pool.query('DELETE FROM reflection WHERE user_id = ?', [ids.userA]);
  await createReflection(ids.userA, ids.quote, { body: '第一条', visibility: 0 });
  await assert.rejects(
    createReflection(ids.userA, ids.quote, { body: '第二条', visibility: 0 }),
    (err) => err.status === 409 && err.code === 'CONFLICT',
  );
});

test('私密感悟不可被他人读取或修改', async () => {
  const mine = await findMine(ids.userA, ids.quote);
  assert.equal(mine.body, '第一条');
  assert.equal(await findMine(ids.userB, ids.quote), null);

  await assert.rejects(
    updateReflectionBody(mine.id, ids.userB, '越权修改'),
    (err) => err.status === 404,
  );
  await assert.rejects(
    deleteReflection(mine.id, ids.userB),
    (err) => err.status === 404,
  );
  assert.ok(await findMine(ids.userA, ids.quote));
});

test('被隐藏的感悟作者可见但只读，可删除后重写', async () => {
  await pool.query('DELETE FROM reflection WHERE user_id IN (?)', [[ids.userA, ids.userB]]);
  const created = await createReflection(ids.userA, ids.quote, { body: '将被隐藏', visibility: 2 });
  await pool.query('UPDATE reflection SET status = 2 WHERE id = ?', [created.reflection.id]);

  const mine = await findMine(ids.userA, ids.quote);
  assert.equal(mine.status, 2);
  await assert.rejects(
    updateReflectionBody(mine.id, ids.userA, '尝试修改'),
    (err) => err.status === 403,
  );
  await assert.rejects(
    updateReflectionVisibility(mine.id, ids.userA, 0),
    (err) => err.status === 403,
  );

  const list = await listMine(ids.userA, { page: 1, pageSize: 20, offset: 0 });
  assert.equal(list.reflection_total, 1);
  assert.equal(list.items[0].reflections[0].status, 2);

  const exported = [];
  await eachMyReflection(ids.userA, 10, (rows) => exported.push(...rows));
  assert.equal(exported.length, 0);

  await deleteReflection(mine.id, ids.userA);
  assert.equal(await findMine(ids.userA, ids.quote), null);

  const again = await createReflection(ids.userA, ids.quote, { body: '重写', visibility: 1 });
  assert.equal(again.reflection.status, 1);
  assert.equal(again.reflection.like_count, 0);
});

test('删除感悟级联清理点赞', async () => {
  await pool.query('DELETE FROM reflection WHERE user_id IN (?)', [[ids.userA, ids.userB]]);
  const pub = await createReflection(ids.userB, ids.quote, { body: '有赞的感悟', visibility: 2 });
  await likeReflection(pub.reflection.id, ids.userA);
  await deleteReflection(pub.reflection.id, ids.userB);
  const [[{ likes }]] = await pool.query(
    'SELECT COUNT(*) AS likes FROM reflection_like WHERE reflection_id = ?',
    [pub.reflection.id],
  );
  assert.equal(likes, 0);
});

test('点赞只对公开感悟生效，且重复点赞不重复计数', async () => {
  await pool.query('DELETE FROM reflection WHERE user_id = ?', [ids.userA]);
  const pub = await createReflection(ids.userA, ids.quote, { body: '可点赞', visibility: 2 });

  const first = await likeReflection(pub.reflection.id, ids.userB);
  assert.deepEqual(first, { liked: true, like_count: 1, quote_id: ids.quote });

  const second = await likeReflection(pub.reflection.id, ids.userB);
  assert.equal(second.like_count, 1);

  const off = await unlikeReflection(pub.reflection.id, ids.userB);
  assert.deepEqual(off, { liked: false, like_count: 0, quote_id: ids.quote });
});

test('私密感悟不能被点赞', async () => {
  await pool.query('DELETE FROM reflection WHERE user_id = ?', [ids.userA]);
  const priv = await createReflection(ids.userA, ids.quote, { body: '私密', visibility: 0 });
  await assert.rejects(
    likeReflection(priv.reflection.id, ids.userB),
    (err) => err.status === 404,
  );
});
