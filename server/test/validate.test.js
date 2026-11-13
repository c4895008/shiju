import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkNickname,
  checkPassword,
  checkSlug,
  checkUsername,
  parseAvatarPreset,
  parseCommentInput,
  parseFriendAction,
  parseFriendQuery,
  parseFriendTarget,
  parseNicknameInput,
  parsePasswordChange,
  parseReflectionInput,
  parseQuoteRequestInput,
  readBody,
} from '../src/validate.js';

test('用户名、密码、slug 校验', () => {
  assert.equal(checkUsername('reader_01'), null);
  assert.match(checkUsername('ab'), /3–20/);
  assert.match(checkUsername('中文名'), /3–20/);
  assert.equal(checkPassword('secret123'), null);
  assert.match(checkPassword('short'), /至少 8 位/);
  assert.equal(checkSlug('shawshank-hope'), null);
  assert.match(checkSlug('-bad'), /slug/);
});

test('昵称校验：长度与控制字符', () => {
  assert.equal(checkNickname('拾句读者'), null);
  assert.match(checkNickname(''), /请填写/);
  assert.match(checkNickname('a'.repeat(21)), /最多 20/);
  assert.match(checkNickname('bad\u0000name'), /不支持/);
});

test('感悟输入：默认私密、换行规范化、可见范围受限', () => {
  assert.deepEqual(parseReflectionInput({ body: '  一句话  ' }), { body: '一句话', visibility: 0 });
  assert.deepEqual(parseReflectionInput({ body: 'a\r\nb', visibility: 2 }), { body: 'a\nb', visibility: 2 });
  assert.deepEqual(parseReflectionInput({ body: '好友可见', visibility: 1 }), {
    body: '好友可见',
    visibility: 1,
  });
  assert.throws(() => parseReflectionInput({ body: 'x', visibility: 3 }), /可见范围/);
  assert.throws(() => parseReflectionInput({ body: '   ' }), /请写下/);
});

test('感悟字数按码点计算，500 字含 emoji 不回退', () => {
  assert.equal(parseReflectionInput({ body: '😀'.repeat(500) }).body, '😀'.repeat(500));
  assert.throws(() => parseReflectionInput({ body: '😀'.repeat(501) }), /最多 500 字/);
});

test('评论输入：换行规范化、控制字符与 300 字码点上限', () => {
  assert.deepEqual(parseCommentInput({ body: '  同意  ' }), { body: '同意' });
  assert.deepEqual(parseCommentInput({ body: 'a\r\nb' }), { body: 'a\nb' });
  assert.throws(() => parseCommentInput({ body: '   ' }), /请写下评论/);
  assert.throws(() => parseCommentInput({ body: 'bad\u0000name' }), /不支持的字符/);
  assert.equal(parseCommentInput({ body: '😀'.repeat(300) }).body, '😀'.repeat(300));
  assert.throws(() => parseCommentInput({ body: '😀'.repeat(301) }), /最多 300 字/);
});

test('收录请求：必填与长度', () => {
  assert.deepEqual(parseQuoteRequestInput({ text: '  想收录这句  ' }), {
    text: '想收录这句',
    work_title: null,
    note: null,
  });
  assert.throws(() => parseQuoteRequestInput({ text: '' }), /请填写/);
});

test('设置资料：昵称去空白，头像只接受 0–11 的整数', () => {
  assert.equal(parseNicknameInput({ nickname: '  拾句读者  ' }), '拾句读者');
  assert.throws(() => parseNicknameInput({ nickname: '   ' }), /请填写昵称/);
  assert.equal(parseAvatarPreset({ avatar_preset: 0 }), 0);
  assert.equal(parseAvatarPreset({ avatar_preset: 11 }), 11);
  assert.throws(() => parseAvatarPreset({ avatar_preset: 12 }), /头像序号/);
  assert.throws(() => parseAvatarPreset({ avatar_preset: -1 }), /头像序号/);
  assert.throws(() => parseAvatarPreset({ avatar_preset: '3' }), /头像序号/);
  assert.throws(() => parseAvatarPreset({ avatar_preset: 1.5 }), /头像序号/);
});

test('改密输入：当前密码必填、新密码长度与新密不能复用', () => {
  assert.deepEqual(parsePasswordChange({ current_password: 'oldpass123', new_password: 'newpass123' }), {
    current_password: 'oldpass123',
    new_password: 'newpass123',
  });
  assert.throws(() => parsePasswordChange({ new_password: 'newpass123' }), /当前密码/);
  assert.throws(
    () => parsePasswordChange({ current_password: 'oldpass123', new_password: 'short' }),
    /至少 8 位/,
  );
  assert.throws(
    () => parsePasswordChange({ current_password: 'samepass1', new_password: 'samepass1' }),
    /不能与当前密码相同/,
  );
});

test('readBody：拒绝未知字段', () => {
  assert.deepEqual(readBody({ a: 1 }, ['a']), { a: 1 });
  assert.throws(() => readBody({ a: 1, b: 2 }, ['a']), /不支持的字段/);
  assert.throws(() => readBody(null, ['a']), /请求参数/);
});

test('读友搜索与操作入参校验', () => {
  assert.equal(parseFriendQuery('  拾句读者  '), '拾句读者');
  assert.throws(() => parseFriendQuery('   '), /请输入昵称或用户名/);
  assert.throws(() => parseFriendQuery('a'.repeat(21)), /最多 20 个字/);

  assert.equal(parseFriendTarget({ user_id: 12 }), 12);
  assert.throws(() => parseFriendTarget({ user_id: 0 }), /用户不存在/);
  assert.throws(() => parseFriendTarget({ user_id: '12' }), /用户不存在/);
  assert.throws(() => parseFriendTarget({}), /用户不存在/);

  assert.equal(parseFriendAction({ action: 'accept' }), 'accept');
  assert.equal(parseFriendAction({ action: 'reject' }), 'reject');
  assert.throws(() => parseFriendAction({ action: 'remove' }), /操作不正确/);
});
