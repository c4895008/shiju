import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db/pool.js';
import { adminOverview, createQuote, getDailyPick, getQuoteRequest, setDailyPick } from '../src/services/content.js';
import { adminList, createReflection, setStatusByAdmin } from '../src/services/reflections.js';
import { searchStats } from '../src/services/search.js';

const ids = {};
const PICK_DATE = '2000-01-01';

async function assertTestDb() {
  const [[row]] = await pool.query('SELECT DATABASE() AS db');
  if (!String(row.db || '').endsWith('_test')) {
    throw new Error(`集成测试只能运行在 *_test 数据库，当前为 ${row.db}`);
  }
}

async function cleanFixtures() {
  await pool.query('DELETE FROM daily_pick WHERE pick_date = ?', [PICK_DATE]);
  await pool.query(
    "DELETE FROM reflection_like WHERE user_id IN (SELECT id FROM `user` WHERE username = 'itest_admin_user')",
  );
  await pool.query(
    "DELETE FROM reflection WHERE user_id IN (SELECT id FROM `user` WHERE username = 'itest_admin_user')",
  );
  await pool.query(
    "DELETE FROM reflection_like WHERE reflection_id IN (SELECT id FROM reflection WHERE quote_id IN (SELECT id FROM quote WHERE slug LIKE 'itest-admin-%'))",
  );
  await pool.query(
    "DELETE FROM reflection WHERE quote_id IN (SELECT id FROM quote WHERE slug LIKE 'itest-admin-%')",
  );
  await pool.query(
    "DELETE FROM quote_request WHERE user_id IN (SELECT id FROM `user` WHERE username = 'itest_admin_user')",
  );
  await pool.query("DELETE FROM `user` WHERE username = 'itest_admin_user'");
  await pool.query("DELETE FROM quote WHERE slug LIKE 'itest-admin-%'");
  await pool.query("DELETE FROM work WHERE slug LIKE 'itest-admin-%'");
}

before(async () => {
  await assertTestDb();
  await cleanFixtures();

  const [work] = await pool.query(
    "INSERT INTO work (slug, title, year, status) VALUES ('itest-admin-film', '后台测试影片', 2000, 1)",
  );
  ids.work = work.insertId;

  const [quote] = await pool.query(
    `INSERT INTO quote (work_id, slug, quote_text, context, search_text, pinyin, status, published_at)
     VALUES (?, 'itest-admin-quote', '后台测试台词', '测试场景', '', '', 1, NOW(3))`,
    [ids.work],
  );
  ids.quote = quote.insertId;

  const [user] = await pool.query(
    "INSERT INTO `user` (username, password_hash, nickname) VALUES ('itest_admin_user', 'x', '后台测试读者')",
  );
  ids.user = user.insertId;

  const [request] = await pool.query(
    `INSERT INTO quote_request (user_id, text, work_title, note, status)
     VALUES (?, '后台测试求收录台词', '后台测试影片', '后台测试备注', 1)`,
    [ids.user],
  );
  ids.request = request.insertId;
});

after(async () => {
  await cleanFixtures().catch(() => {});
  await pool.end();
});

test('后台概览返回计数与当天日期', async () => {
  const overview = await adminOverview();
  for (const key of ['published', 'draft', 'offline', 'removed', 'total']) {
    assert.equal(typeof overview.quotes[key], 'number');
    assert.ok(overview.quotes[key] >= 0);
  }
  assert.equal(typeof overview.works.total, 'number');
  assert.equal(typeof overview.themes.total, 'number');
  assert.equal(typeof overview.requests.pending, 'number');
  assert.equal(typeof overview.reflections.hidden, 'number');
  assert.match(overview.daily.date, /^\d{4}-\d{2}-\d{2}$/);
});

test('今日一句可写入并按日期读回', async () => {
  await setDailyPick(PICK_DATE, { quote_id: ids.quote, note: '后台测试备注' });
  const pick = await getDailyPick(PICK_DATE);
  assert.equal(pick.date, PICK_DATE);
  assert.equal(pick.note, '后台测试备注');
  assert.equal(pick.quote.id, ids.quote);
  assert.equal(pick.quote.text, '后台测试台词');
  assert.equal(pick.quote.work_title, '后台测试影片');
});

test('未编排日期返回空台词，非法日期报错', async () => {
  const empty = await getDailyPick('2000-01-02');
  assert.equal(empty.quote, null);
  assert.equal(empty.note, null);
  await assert.rejects(() => getDailyPick('2000-1-1'), /日期格式/);
});

test('求收录详情返回请求与提交人昵称', async () => {
  const request = await getQuoteRequest(ids.request);
  assert.equal(request.id, ids.request);
  assert.equal(request.text, '后台测试求收录台词');
  assert.equal(request.work_title, '后台测试影片');
  assert.equal(request.note, '后台测试备注');
  assert.equal(request.status, 1);
  assert.equal(request.nickname, '后台测试读者');
  assert.equal(typeof request.created_at, 'string');
  await assert.rejects(() => getQuoteRequest(999999999), /请求不存在/);
});

test('台词长度上限为 140 字', async () => {
  const created = await createQuote({
    work_id: ids.work,
    slug: 'itest-admin-long-quote',
    text: '字'.repeat(140),
    context: '边界测试场景',
  });
  assert.ok(created.id > 0);
  const [[row]] = await pool.query('SELECT CHAR_LENGTH(quote_text) AS len FROM quote WHERE id = ?', [created.id]);
  assert.equal(row.len, 140);

  await assert.rejects(
    () =>
      createQuote({
        work_id: ids.work,
        slug: 'itest-admin-overlong-quote',
        text: '字'.repeat(141),
        context: '边界测试场景',
      }),
    /最多 140 字/,
  );
});

test('后台可按可见范围与状态筛选感悟', async () => {
  const insertQuote = async (slug, text) => {
    const [result] = await pool.query(
      `INSERT INTO quote (work_id, slug, quote_text, context, search_text, pinyin, status, published_at)
       VALUES (?, ?, ?, '筛选测试场景', '', '', 1, NOW(3))`,
      [ids.work, slug, text],
    );
    return result.insertId;
  };
  const friendQuote = await insertQuote('itest-admin-filter-friend', '后台筛选台词A');
  const publicQuote = await insertQuote('itest-admin-filter-public', '后台筛选台词B');

  await createReflection(ids.user, ids.quote, { body: '后台私密感悟', visibility: 0 });
  const friend = await createReflection(ids.user, friendQuote, { body: '后台好友感悟', visibility: 1 });
  const pub = await createReflection(ids.user, publicQuote, { body: '后台公开感悟', visibility: 2 });

  const publicList = await adminList({ status: 1, visibility: 2, page: 1, pageSize: 50, offset: 0 });
  assert.ok(publicList.items.every((item) => item.status === 1 && item.visibility === 2));
  assert.ok(publicList.items.some((item) => item.id === pub.reflection.id));

  const friendList = await adminList({ status: 1, visibility: 1, page: 1, pageSize: 50, offset: 0 });
  assert.ok(friendList.items.every((item) => item.status === 1 && item.visibility === 1));
  assert.ok(friendList.items.some((item) => item.id === friend.reflection.id));

  await setStatusByAdmin(friend.reflection.id, 2);
  const hiddenFriend = await adminList({ status: 2, visibility: 1, page: 1, pageSize: 50, offset: 0 });
  assert.ok(hiddenFriend.items.every((item) => item.status === 2 && item.visibility === 1));
  assert.ok(hiddenFriend.items.some((item) => item.id === friend.reflection.id));
});

test('搜索报表包含汇总数', async () => {
  const stats = await searchStats(7);
  assert.equal(stats.days, 7);
  assert.equal(typeof stats.total, 'number');
  assert.equal(typeof stats.zero_total, 'number');
  assert.ok(stats.zero_total <= stats.total);
  assert.ok(Array.isArray(stats.zero_results));
  assert.ok(Array.isArray(stats.top_terms));
});
