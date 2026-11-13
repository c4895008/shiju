import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, parsePaging, paged, quoteSourceKey, quoteTags, toTheme } from '../src/services/quotes.js';

test('normalize：全角转半角、去标点、转小写', () => {
  assert.equal(normalize('  希 望，是好事！ABC　１２３ '), '希望是好事abc123');
  assert.equal(normalize('《肖申克的救赎》'), '肖申克的救赎');
});

test('parsePaging：非法值回退，page_size 受上限约束', () => {
  assert.deepEqual(parsePaging({}), { page: 1, pageSize: 20, offset: 0 });
  assert.deepEqual(parsePaging({ page: '3', page_size: '10' }), { page: 3, pageSize: 10, offset: 20 });
  assert.equal(parsePaging({ page_size: '999' }).pageSize, 50);
  assert.equal(parsePaging({ page_size: '0' }).pageSize, 1);
  assert.equal(parsePaging({ page: '-2' }).page, 1);
});

test('paged：has_more 由 page/pageSize/total 推导', () => {
  assert.equal(paged([], { page: 1, pageSize: 10, total: 0 }).has_more, false);
  assert.equal(paged([], { page: 2, pageSize: 10, total: 25 }).has_more, true);
  assert.equal(paged([], { page: 3, pageSize: 10, total: 25 }).has_more, false);
});

test('quoteSourceKey：同作品同原文稳定，换作品则变化', () => {
  const a = quoteSourceKey('coco', '家人是比梦想更重要的事情。');
  assert.equal(a, quoteSourceKey('coco', '家人是比梦想更重要的事情。'));
  assert.notEqual(a, quoteSourceKey('coco', '家人是比梦想更重要的事情'));
  assert.notEqual(a, quoteSourceKey('other', '家人是比梦想更重要的事情。'));
  assert.match(a, /^[0-9a-f]{40}$/);
});

test('quoteTags：包含台词、作品与主题标签', () => {
  assert.deepEqual(quoteTags({ id: 3, work_id: 7, theme_ids: [1, 2] }), [
    'quote:3',
    'work:7',
    'theme:1',
    'theme:2',
  ]);
});

test('toTheme：计数转为数字并保留 work_count', () => {
  assert.deepEqual(
    toTheme({ id: 1, slug: 'hope', name: '希望', description: null, quote_count: '8', work_count: '5' }),
    { id: 1, slug: 'hope', name: '希望', description: null, quote_count: 8, work_count: 5 },
  );
});
