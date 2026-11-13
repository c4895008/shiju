import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db/pool.js';
import { getThemeBySlug, getThemeDetail, listThemes } from '../src/services/themes.js';

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
    await pool.query('DELETE FROM reflection WHERE user_id IN (?)', [userIds]);
    await pool.query('DELETE FROM quote_request WHERE user_id IN (?)', [userIds]);
  }
  const [works] = await pool.query("SELECT id FROM work WHERE slug LIKE 'itest-theme-%'");
  const workIds = works.map((row) => row.id);
  if (workIds.length) {
    await pool.query('DELETE FROM quote WHERE work_id IN (?)', [workIds]);
    await pool.query('DELETE FROM work WHERE id IN (?)', [workIds]);
  }
  await pool.query("DELETE FROM theme WHERE slug LIKE 'itest-theme-%'");
  await pool.query("DELETE FROM slug_redirect WHERE old_slug LIKE 'itest-theme-%'");
  await pool.query("DELETE FROM `user` WHERE username LIKE 'itest\\_%'");
}

async function insertQuote({ slug, workId, status = 1, featured = 0, themes }) {
  const [res] = await pool.query(
    `INSERT INTO quote (work_id, slug, quote_text, context, search_text, pinyin, featured, status, published_at)
     VALUES (?, ?, ?, ?, '', '', ?, ?, ?)`,
    [workId, slug, `台词 ${slug}`, '测试场景', featured, status, status === 1 ? new Date() : null],
  );
  for (const themeId of themes) {
    await pool.query('INSERT INTO quote_theme (quote_id, theme_id) VALUES (?, ?)', [res.insertId, themeId]);
  }
  return res.insertId;
}

before(async () => {
  await assertTestDb();
  await cleanFixtures();

  const [hope] = await pool.query(
    "INSERT INTO theme (slug, name, description, sort_order, status) VALUES ('itest-theme-hope', '测试希望', '希望主题', 1, 1)",
  );
  const [freedom] = await pool.query(
    "INSERT INTO theme (slug, name, description, sort_order, status) VALUES ('itest-theme-freedom', '测试自由', '自由主题', 2, 1)",
  );
  const [hidden] = await pool.query(
    "INSERT INTO theme (slug, name, description, sort_order, status) VALUES ('itest-theme-hidden', '测试隐藏', '隐藏主题', 3, 0)",
  );
  const [workA] = await pool.query(
    "INSERT INTO work (slug, title, year, status) VALUES ('itest-theme-film-a', '测试影片甲', 2001, 1)",
  );
  const [workB] = await pool.query(
    "INSERT INTO work (slug, title, year, status) VALUES ('itest-theme-film-b', '测试影片乙', 2002, 1)",
  );
  const [workHidden] = await pool.query(
    "INSERT INTO work (slug, title, year, status) VALUES ('itest-theme-film-hidden', '测试影片丙', 2003, 2)",
  );
  const [userA] = await pool.query(
    "INSERT INTO `user` (username, password_hash, nickname) VALUES ('itest_theme_a', 'x', '测试读者A')",
  );
  const [userB] = await pool.query(
    "INSERT INTO `user` (username, password_hash, nickname) VALUES ('itest_theme_b', 'x', '测试读者B')",
  );

  ids.hope = hope.insertId;
  ids.freedom = freedom.insertId;
  ids.workA = workA.insertId;
  ids.workB = workB.insertId;
  ids.userA = userA.insertId;
  ids.userB = userB.insertId;

  const q1 = await insertQuote({
    slug: 'itest-theme-q1',
    workId: ids.workA,
    featured: 1,
    themes: [ids.hope, ids.freedom],
  });
  const q2 = await insertQuote({ slug: 'itest-theme-q2', workId: ids.workA, themes: [ids.hope] });
  const q3 = await insertQuote({ slug: 'itest-theme-q3', workId: ids.workB, themes: [ids.hope] });
  await insertQuote({ slug: 'itest-theme-q4', workId: ids.workB, status: 0, themes: [ids.hope] });
  await insertQuote({
    slug: 'itest-theme-q5',
    workId: workHidden.insertId,
    themes: [ids.hope, ids.freedom],
  });
  await insertQuote({ slug: 'itest-theme-q6', workId: ids.workB, themes: [ids.freedom] });
  await insertQuote({ slug: 'itest-theme-q7', workId: ids.workA, themes: [hidden.insertId] });

  await pool.query(
    `INSERT INTO reflection (quote_id, user_id, body, visibility, status, published_at)
     VALUES (?, ?, '公开感悟', 2, 1, NOW(3)), (?, ?, '被隐藏的公开感悟', 2, 2, NOW(3)),
            (?, ?, '私密感悟', 0, 1, NULL), (?, ?, '另一条公开感悟', 2, 1, NOW(3))`,
    [q1, ids.userA, q1, ids.userB, q2, ids.userA, q3, ids.userB],
  );

  await pool.query(
    "INSERT INTO slug_redirect (entity, old_slug, new_slug) VALUES (3, 'itest-theme-old', 'itest-theme-hope')",
  );
});

after(async () => {
  await cleanFixtures().catch(() => {});
  await pool.end();
});

test('主题详情只统计已发布台词与可见作品', async () => {
  const detail = await getThemeDetail({
    slug: 'itest-theme-hope',
    page: 1,
    pageSize: 20,
    offset: 0,
  });

  assert.equal(detail.kind, 'ok');
  assert.equal(detail.theme.quote_count, 3);
  assert.equal(detail.theme.work_count, 2);
  assert.deepEqual(detail.stats, { quotes: 3, works: 2, reflections: 2 });
  assert.equal(detail.quotes.total, 3);
  assert.deepEqual(
    detail.quotes.items.map((quote) => quote.slug).sort(),
    ['itest-theme-q1', 'itest-theme-q2', 'itest-theme-q3'],
  );
  assert.deepEqual(detail.featured.map((quote) => quote.slug), ['itest-theme-q1']);
});

test('代表作品按主题内台词数排序', async () => {
  const detail = await getThemeDetail({
    slug: 'itest-theme-hope',
    page: 1,
    pageSize: 20,
    offset: 0,
  });

  assert.equal(detail.top_works.length, 2);
  assert.equal(detail.top_works[0].slug, 'itest-theme-film-a');
  assert.equal(detail.top_works[0].quote_count, 2);
  assert.equal(detail.top_works[1].slug, 'itest-theme-film-b');
  assert.equal(detail.top_works[1].quote_count, 1);
});

test('相关主题按共同台词共现，排除隐藏主题', async () => {
  const detail = await getThemeDetail({
    slug: 'itest-theme-hope',
    page: 1,
    pageSize: 20,
    offset: 0,
  });

  assert.deepEqual(detail.related_themes.map((theme) => theme.slug), ['itest-theme-freedom']);
  assert.equal(detail.related_themes[0].quote_count, 2);
});

test('主题列表排除隐藏主题并返回作品数', async () => {
  const themes = await listThemes();
  const hope = themes.find((theme) => theme.slug === 'itest-theme-hope');
  const freedom = themes.find((theme) => theme.slug === 'itest-theme-freedom');

  assert.equal(hope.quote_count, 3);
  assert.equal(hope.work_count, 2);
  assert.equal(freedom.quote_count, 2);
  assert.equal(freedom.work_count, 2);
  assert.equal(themes.some((theme) => theme.slug === 'itest-theme-hidden'), false);
});

test('分页与 slug 301 保持原行为', async () => {
  const page2 = await getThemeDetail({
    slug: 'itest-theme-hope',
    page: 2,
    pageSize: 2,
    offset: 2,
  });
  assert.equal(page2.quotes.total, 3);
  assert.equal(page2.quotes.items.length, 1);
  assert.equal(page2.quotes.has_more, false);

  const redirect = await getThemeBySlug('itest-theme-old');
  assert.deepEqual(redirect, { kind: 'redirect', redirect: '/theme/itest-theme-hope' });

  const hidden = await getThemeBySlug('itest-theme-hidden');
  assert.deepEqual(hidden, { kind: 'notfound' });
});
