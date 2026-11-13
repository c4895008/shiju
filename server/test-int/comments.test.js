import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db/pool.js';
import {
  createReflection,
  deleteReflection,
  listPublicReflections,
  setStatusByAdmin,
} from '../src/services/reflections.js';
import { listFriendRequests, respondFriendRequest, sendFriendRequest } from '../src/services/friends.js';
import {
  adminListComments,
  commentCounts,
  createComment,
  deleteComment,
  deleteCommentByAdmin,
  listComments,
  setCommentStatusByAdmin,
} from '../src/services/comments.js';

const ids = {};

const viewer = (id, role = 1) => ({ id, role });

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
    await pool.query('DELETE FROM friend_request WHERE requester_id IN (?) OR addressee_id IN (?)', [userIds, userIds]);
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

async function countRows(reflectionId) {
  const [[{ c }]] = await pool.query(
    'SELECT COUNT(*) AS c FROM reflection_comment WHERE reflection_id = ?',
    [reflectionId],
  );
  return Number(c);
}

async function makeReflection(userId, quoteId, visibility) {
  await pool.query('DELETE FROM reflection WHERE user_id = ? AND quote_id = ?', [userId, quoteId]);
  const { reflection } = await createReflection(userId, quoteId, { body: '感悟正文', visibility });
  return reflection.id;
}

async function makeFriends(a, b) {
  await sendFriendRequest(a, b);
  const { incoming } = await listFriendRequests(b);
  const request = incoming.find((item) => item.user.id === a);
  assert.ok(request, '应收到好友申请');
  await respondFriendRequest(b, request.id, 'accept');
}

before(async () => {
  await assertTestDb();
  await cleanFixtures();

  const [a] = await pool.query(
    "INSERT INTO `user` (username, password_hash, nickname) VALUES ('itest_ca', 'x', '感悟作者')",
  );
  const [b] = await pool.query(
    "INSERT INTO `user` (username, password_hash, nickname) VALUES ('itest_cb', 'x', '评论者')",
  );
  const [c] = await pool.query(
    "INSERT INTO `user` (username, password_hash, nickname) VALUES ('itest_cc', 'x', '路人')",
  );
  const [w] = await pool.query(
    "INSERT INTO work (slug, title, status) VALUES ('itest-comments-film', '评论测试影片', 1)",
  );
  const quotes = [];
  for (let i = 1; i <= 2; i += 1) {
    const [q] = await pool.query(
      `INSERT INTO quote (work_id, slug, quote_text, context, search_text, pinyin, status, published_at)
       VALUES (?, ?, ?, '测试场景', ?, 'ceshi', 1, NOW(3))`,
      [w.insertId, `itest-comments-quote-${i}`, `评论测试台词${i}`, `评论测试台词${i}`],
    );
    quotes.push(q.insertId);
  }

  ids.users = { a: a.insertId, b: b.insertId, c: c.insertId };
  ids.work = w.insertId;
  ids.quotes = quotes;
});

after(async () => {
  await cleanFixtures().catch(() => {});
  await pool.end();
});

test('公开感悟的评论：匿名可读、登录态带 mine 与删除权', async () => {
  const { a, b, c } = ids.users;
  const reflectionId = await makeReflection(a, ids.quotes[0], 2);

  const created = await createComment(reflectionId, viewer(b), '第一条评论');
  assert.equal(created.comment.body, '第一条评论');
  assert.equal(created.comment.mine, true);
  assert.equal(created.comment.can_delete, true);
  assert.equal(created.comment_count, 1);
  assert.ok(created.quote_id);

  const anonymous = await listComments(reflectionId, null, { page: 1, pageSize: 10, offset: 0 });
  assert.equal(anonymous.total, 1);
  assert.equal(anonymous.items[0].mine, false);
  assert.equal(anonymous.items[0].can_delete, false);
  assert.equal(anonymous.items[0].author.nickname, '评论者');

  await createComment(reflectionId, viewer(c), '路人的评论');
  const asAuthor = await listComments(reflectionId, viewer(a), { page: 1, pageSize: 10, offset: 0 });
  assert.equal(asAuthor.total, 2);
  assert.ok(asAuthor.items.every((item) => item.can_delete), '感悟作者可删除自己感悟下的评论');

  const firstPage = await listComments(reflectionId, viewer(b), { page: 1, pageSize: 1, offset: 0 });
  assert.equal(firstPage.items.length, 1);
  assert.equal(firstPage.has_more, true);
  assert.equal(firstPage.items[0].body, '路人的评论', '应最新在前');

  const secondPage = await listComments(reflectionId, viewer(b), { page: 2, pageSize: 1, offset: 1 });
  assert.equal(secondPage.items[0].body, '第一条评论');
  assert.equal(secondPage.has_more, false);
});

test('删除评论：评论者与感悟作者可删，路人 403，管理员可删', async () => {
  const { a, b, c } = ids.users;
  const reflectionId = await makeReflection(a, ids.quotes[0], 2);
  const first = await createComment(reflectionId, viewer(b), '待删除');

  await assert.rejects(deleteComment(reflectionId, first.comment.id, viewer(c)), (err) => err.status === 403);
  assert.equal(await countRows(reflectionId), 1);

  const byReflectionAuthor = await deleteComment(reflectionId, first.comment.id, viewer(a));
  assert.equal(byReflectionAuthor.comment_count, 0);
  assert.equal(await countRows(reflectionId), 0);

  const second = await createComment(reflectionId, viewer(b), '管理员来处理');
  const byAdmin = await deleteComment(reflectionId, second.comment.id, viewer(c, 9));
  assert.equal(byAdmin.comment_count, 0);

  await assert.rejects(deleteComment(reflectionId, 999999, viewer(b)), (err) => err.status === 404);
});

test('评论可见性继承感悟：好友需读友、私密仅作者、隐藏感悟一律 404', async () => {
  const { a, b, c } = ids.users;
  const friendReflection = await makeReflection(a, ids.quotes[0], 1);
  const privateReflection = await makeReflection(a, ids.quotes[1], 0);

  await createComment(friendReflection, viewer(a), '作者的读友可见评论');
  await assert.rejects(listComments(friendReflection, null, { page: 1, pageSize: 10, offset: 0 }), (err) => err.status === 404);
  await assert.rejects(listComments(friendReflection, viewer(c), { page: 1, pageSize: 10, offset: 0 }), (err) => err.status === 404);
  await assert.rejects(createComment(friendReflection, viewer(c), '越权'), (err) => err.status === 404);

  await makeFriends(a, b);
  const asFriend = await listComments(friendReflection, viewer(b), { page: 1, pageSize: 10, offset: 0 });
  assert.equal(asFriend.total, 1);
  assert.equal((await createComment(friendReflection, viewer(b), '读友参与评论')).comment_count, 2);

  await assert.rejects(listComments(privateReflection, viewer(b), { page: 1, pageSize: 10, offset: 0 }), (err) => err.status === 404);
  assert.equal((await listComments(privateReflection, viewer(a), { page: 1, pageSize: 10, offset: 0 })).total, 0);

  const publicReflection = await makeReflection(a, ids.quotes[1], 2);
  await createComment(publicReflection, viewer(b), '将被冻结');
  await setStatusByAdmin(publicReflection, 2);
  await assert.rejects(listComments(publicReflection, viewer(b), { page: 1, pageSize: 10, offset: 0 }), (err) => err.status === 404);
  await assert.rejects(createComment(publicReflection, viewer(b), '隐藏后不能评论'), (err) => err.status === 404);
  await setStatusByAdmin(publicReflection, 1);
  assert.equal((await listComments(publicReflection, viewer(b), { page: 1, pageSize: 10, offset: 0 })).total, 1);
});

test('评论数进入公开列表与后台列表，隐藏与恢复即时生效', async () => {
  const { a, b, c } = ids.users;
  const reflectionId = await makeReflection(a, ids.quotes[0], 2);
  const one = await createComment(reflectionId, viewer(b), '正常评论');
  const two = await createComment(reflectionId, viewer(c), '将被隐藏');
  assert.equal(two.comment_count, 2);

  const publicList = await listPublicReflections(ids.quotes[0], { page: 1, pageSize: 10, offset: 0 });
  assert.equal(publicList.items[0].comment_count, 2);
  assert.deepEqual([...(await commentCounts([reflectionId, 999999])).entries()], [[reflectionId, 2]]);

  await setCommentStatusByAdmin(two.comment.id, 2);
  assert.equal((await listPublicReflections(ids.quotes[0], { page: 1, pageSize: 10, offset: 0 })).items[0].comment_count, 1);
  assert.equal((await listComments(reflectionId, viewer(a), { page: 1, pageSize: 10, offset: 0 })).total, 1);

  const adminView = await adminListComments(reflectionId, { page: 1, pageSize: 20, offset: 0 });
  assert.equal(adminView.total, 2);
  assert.equal(adminView.items.find((item) => item.id === two.comment.id).status, 2);
  const onlyHidden = await adminListComments(reflectionId, { status: 2, page: 1, pageSize: 20, offset: 0 });
  assert.deepEqual(onlyHidden.items.map((item) => item.id), [two.comment.id]);

  await setCommentStatusByAdmin(two.comment.id, 1);
  assert.equal((await listComments(reflectionId, viewer(a), { page: 1, pageSize: 10, offset: 0 })).total, 2);

  const removed = await deleteCommentByAdmin(one.comment.id);
  assert.equal(removed.quote_id, ids.quotes[0]);
  assert.equal((await listComments(reflectionId, viewer(a), { page: 1, pageSize: 10, offset: 0 })).total, 1);
  await assert.rejects(setCommentStatusByAdmin(one.comment.id, 1), (err) => err.status === 404);
});

test('删除感悟级联清理评论', async () => {
  const { a, b } = ids.users;
  const reflectionId = await makeReflection(a, ids.quotes[0], 2);
  await createComment(reflectionId, viewer(b), '随感悟一起消失');
  assert.equal(await countRows(reflectionId), 1);

  await deleteReflection(reflectionId, a);
  assert.equal(await countRows(reflectionId), 0);
});
