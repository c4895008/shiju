import test from 'node:test';
import assert from 'node:assert/strict';
import { bump, clearCache, lookup, statsSnapshot, store } from '../src/ssr/cache.js';

test('缓存：命中后按 tag 版本失效', () => {
  clearCache();
  store('/q/a', { html: '<p>a</p>', tags: ['quote:1', 'all'], ttlMs: 60_000 });

  assert.equal(lookup('/q/a').status, 'fresh');
  bump('quote:1');
  assert.equal(lookup('/q/a'), null);

  store('/q/a', { html: '<p>a2</p>', tags: ['quote:1'], ttlMs: 60_000 });
  assert.equal(lookup('/q/a').status, 'fresh');
  bump('other');
  assert.equal(lookup('/q/a').status, 'fresh');
});

test('缓存：TTL 过期返回 stale，stale 窗口结束后移除', () => {
  clearCache();
  const base = Date.now();
  store('/movie/x', { html: 'x', tags: ['work:1'], ttlMs: 1_000, staleMs: 2_000 });

  assert.equal(lookup('/movie/x', base + 500).status, 'fresh');
  assert.equal(lookup('/movie/x', base + 2_000).status, 'stale');
  assert.equal(lookup('/movie/x', base + 5_000), null);
});

test('缓存：ETag 稳定且统计可读', () => {
  clearCache();
  const entry = store('/', { html: '<div/>', tags: ['home'], ttlMs: 1_000 });
  assert.match(entry.etag, /^"[0-9a-f]{32}"$/);
  assert.equal(lookup('/').entry.etag, entry.etag);
  const stats = statsSnapshot();
  assert.equal(stats.size, 1);
  assert.ok(stats.hits >= 1);
});
