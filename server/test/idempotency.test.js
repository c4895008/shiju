import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidIdempotencyKey, once } from '../src/services/idempotency.js';

test('幂等键：长度与字符集校验', () => {
  assert.equal(isValidIdempotencyKey('abcd1234'), true);
  assert.equal(isValidIdempotencyKey('short'), false);
  assert.equal(isValidIdempotencyKey('bad key!'), false);
});

test('once：同一 scope/key 只执行一次', async () => {
  let calls = 0;
  const run = async () => {
    calls += 1;
    return { value: calls };
  };
  const [a, b] = await Promise.all([
    once('scope', 'key-0001', run),
    once('scope', 'key-0001', run),
  ]);
  assert.equal(calls, 1);
  assert.equal(a.value, 1);
  assert.equal(b.value, 1);
  assert.equal(a, b);
});

test('once：失败后允许重试', async () => {
  let calls = 0;
  const key = 'key-0002';
  await assert.rejects(
    once('scope', key, async () => {
      calls += 1;
      throw new Error('boom');
    }),
    /boom/,
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  const result = await once('scope', key, async () => {
    calls += 1;
    return 'ok';
  });
  assert.equal(result, 'ok');
  assert.equal(calls, 2);
});
