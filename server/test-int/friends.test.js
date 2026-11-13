import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db/pool.js';
import { createReflection, likeReflection, unlikeReflection } from '../src/services/reflections.js';
import {
  cancelFriendRequest,
  friendSummary,
  listFriendFeed,
  listFriendRequests,
  listFriends,
  removeFriend,
  respondFriendRequest,
  searchUsers,
  sendFriendRequest,
} from '../src/services/friends.js';

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

async function resetFriends() {
  const all = Object.values(ids.users);
  await pool.query('DELETE FROM friend_request WHERE requester_id IN (?) OR addressee_id IN (?)', [all, all]);
  await pool.query('DELETE FROM reflection_like WHERE user_id IN (?)', [all]);
  await pool.query('DELETE FROM reflection WHERE user_id IN (?)', [all]);
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
    "INSERT INTO `user` (username, password_hash, nickname) VALUES ('itest_fa', 'x', '读友A')",
  );
  const [b] = await pool.query(
    "INSERT INTO `user` (username, password_hash, nickname) VALUES ('itest_fb', 'x', '读友B')",
  );
  const [c] = await pool.query(
    "INSERT INTO `user` (username, password_hash, nickname) VALUES ('itest_fc', 'x', '读友C')",
  );
  const [d] = await pool.query(
    "INSERT INTO `user` (username, password_hash, nickname, status) VALUES ('itest_fd', 'x', '停用D', 0)",
  );
  const [w] = await pool.query(
    "INSERT INTO work (slug, title, status) VALUES ('itest-friends-film', '读友测试影片', 1)",
  );

  const quotes = [];
  for (let i = 1; i <= 4; i += 1) {
    const [q] = await pool.query(
      `INSERT INTO quote (work_id, slug, quote_text, context, search_text, pinyin, status, published_at)
       VALUES (?, ?, ?, '测试场景', ?, 'ceshi', 1, NOW(3))`,
      [w.insertId, `itest-friends-quote-${i}`, `读友测试台词${i}`, `读友测试台词${i}`],
    );
    quotes.push(q.insertId);
  }

  ids.users = { a: a.insertId, b: b.insertId, c: c.insertId, d: d.insertId };
  ids.work = w.insertId;
  ids.quotes = quotes;
});

after(async () => {
  await cleanFixtures().catch(() => {});
  await pool.end();
});

test('发送申请：不能加自己、不能加停用账号、重复申请 409、反向申请自动接受', async () => {
  await resetFriends();
  const { a, b, d } = ids.users;

  await assert.rejects(sendFriendRequest(a, a), (err) => err.status === 400);
  await assert.rejects(sendFriendRequest(a, d), (err) => err.status === 404);

  const first = await sendFriendRequest(a, b);
  assert.equal(first.auto_accepted, false);
  assert.equal(first.request.status, 0);

  await assert.rejects(sendFriendRequest(a, b), (err) => err.status === 409);

  const reverse = await sendFriendRequest(b, a);
  assert.equal(reverse.auto_accepted, true);
  assert.equal(reverse.request.status, 1);

  const friendsA = await listFriends(a);
  const friendsB = await listFriends(b);
  assert.deepEqual(friendsA.map((item) => item.id), [b]);
  assert.deepEqual(friendsB.map((item) => item.id), [a]);
});

test('接受、拒绝、撤回与移除的权限和状态流转', async () => {
  await resetFriends();
  const { a, b, c } = ids.users;

  const request = await sendFriendRequest(a, b);
  await assert.rejects(respondFriendRequest(c, request.request.id, 'accept'), (err) => err.status === 404);
  const accepted = await respondFriendRequest(b, request.request.id, 'accept');
  assert.equal(accepted.status, 1);
  await assert.rejects(respondFriendRequest(b, request.request.id, 'reject'), (err) => err.status === 409);

  await assert.rejects(removeFriend(c, a), (err) => err.status === 404);
  assert.deepEqual(await removeFriend(a, b), { removed: true });
  assert.equal((await listFriends(a)).length, 0);

  const outgoing = await sendFriendRequest(c, a);
  await assert.rejects(cancelFriendRequest(a, outgoing.request.id), (err) => err.status === 404);
  assert.deepEqual(await cancelFriendRequest(c, outgoing.request.id), {
    id: outgoing.request.id,
    canceled: true,
  });
  assert.equal((await listFriendRequests(c)).outgoing.length, 0);

  const again = await sendFriendRequest(c, a);
  assert.equal((await respondFriendRequest(a, again.request.id, 'reject')).status, 2);

  const retry = await sendFriendRequest(c, a);
  assert.equal(retry.request.status, 0);
  assert.equal(retry.request.id, again.request.id);
  const incoming = await listFriendRequests(a);
  assert.deepEqual(incoming.incoming.map((item) => item.user.id), [c]);
  assert.equal(incoming.pending_count, 1);
});

test('读友列表与待处理摘要计数正确', async () => {
  await resetFriends();
  const { a, b, c } = ids.users;

  await makeFriends(a, b);
  await sendFriendRequest(c, a);

  const summary = await friendSummary(a);
  assert.deepEqual(summary, { friend_count: 1, pending_count: 1 });

  const friends = await listFriends(a);
  assert.equal(friends[0].nickname, '读友B');
  assert.equal(typeof friends[0].since, 'string');
  assert.equal(friends[0].reflection_count, 0);
});

test('搜索返回关系状态，排除自己与停用用户', async () => {
  await resetFriends();
  const { a, b, c, d } = ids.users;

  await makeFriends(a, b);
  await sendFriendRequest(a, c);
  await sendFriendRequest(d, a);

  const results = await searchUsers(a, '读友');
  const byId = new Map(results.map((item) => [item.id, item]));
  assert.equal(byId.has(a), false, '不应包含自己');
  assert.equal(byId.has(d), false, '不应包含停用用户');
  assert.equal(byId.get(b).relation, 'friend');
  assert.equal(byId.get(c).relation, 'pending_out');

  const incoming = await searchUsers(c, 'itest_fa');
  assert.equal(incoming.length, 1);
  assert.equal(incoming[0].id, a);
  assert.equal(incoming[0].relation, 'pending_in');
  assert.ok(incoming[0].request_id);
});

test('读友动态只包含读友的好友/公开感悟，且分页正确', async () => {
  await resetFriends();
  const { a, b, c } = ids.users;
  const [q1, q2, q3, q4] = ids.quotes;

  await makeFriends(a, b);

  await createReflection(b, q1, { body: 'B 的公开感悟', visibility: 2 });
  await createReflection(b, q2, { body: 'B 的好友感悟', visibility: 1 });
  await createReflection(b, q3, { body: 'B 的私密感悟', visibility: 0 });
  const hidden = await createReflection(b, q4, { body: 'B 的隐藏公开感悟', visibility: 2 });
  await pool.query('UPDATE reflection SET status = 2 WHERE id = ?', [hidden.reflection.id]);
  await createReflection(c, q1, { body: 'C 的公开感悟', visibility: 2 });

  const firstPage = await listFriendFeed(a, { page: 1, pageSize: 1, offset: 0 });
  assert.equal(firstPage.total, 2);
  assert.equal(firstPage.items.length, 1);
  assert.equal(firstPage.has_more, true);

  const secondPage = await listFriendFeed(a, { page: 2, pageSize: 1, offset: 1 });
  assert.equal(secondPage.items.length, 1);
  assert.equal(secondPage.has_more, false);

  const bodies = [...firstPage.items, ...secondPage.items].map((item) => item.body).sort();
  assert.deepEqual(bodies, ['B 的公开感悟', 'B 的好友感悟']);

  const stranger = await listFriendFeed(c, { page: 1, pageSize: 20, offset: 0 });
  assert.equal(stranger.total, 0);
  assert.ok(firstPage.items.every((item) => item.author.id === b));
  assert.ok(firstPage.items.some((item) => item.visibility === 1));

  const friends = await listFriends(a);
  assert.equal(friends.find((item) => item.id === b).reflection_count, 2, '计数不应包含私密或隐藏感悟');
});

test('好友可见感悟仅读友可点赞，移除读友后失去权限', async () => {
  await resetFriends();
  const { a, b, c } = ids.users;
  const [q1, q2, q3] = ids.quotes;

  await makeFriends(a, b);
  const friendOnly = await createReflection(b, q2, { body: '好友可赞', visibility: 1 });
  const publicOne = await createReflection(b, q1, { body: '公开可赞', visibility: 2 });
  const privateOne = await createReflection(b, q3, { body: '私密不可赞', visibility: 0 });

  const liked = await likeReflection(friendOnly.reflection.id, a);
  assert.equal(liked.liked, true);
  assert.equal(liked.like_count, 1);
  assert.equal((await unlikeReflection(friendOnly.reflection.id, a)).like_count, 0);

  await assert.rejects(likeReflection(friendOnly.reflection.id, c), (err) => err.status === 404);
  await assert.rejects(likeReflection(privateOne.reflection.id, a), (err) => err.status === 404);

  const publicLike = await likeReflection(publicOne.reflection.id, c);
  assert.equal(publicLike.liked, true);

  await removeFriend(b, a);
  await assert.rejects(likeReflection(friendOnly.reflection.id, a), (err) => err.status === 404);
  const feed = await listFriendFeed(a, { page: 1, pageSize: 20, offset: 0 });
  assert.equal(feed.total, 0);
});
