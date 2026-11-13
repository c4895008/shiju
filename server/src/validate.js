import { AppError, validationError } from './errors.js';

export function readBody(body, allowed) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(400, 'VALIDATION_ERROR', '请求参数不正确');
  }
  const unknown = Object.keys(body).filter((k) => !allowed.includes(k));
  if (unknown.length) {
    throw new AppError(400, 'VALIDATION_ERROR', `不支持的字段：${unknown.join('、')}`, { unknown });
  }
  return body;
}

export const charLength = (s) => [...s].length;

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;
const MULTILINE_CONTROL_RE = /[\u0000-\u0008\u000b-\u001f\u007f]/;
const normalizeNewlines = (s) => s.replace(/\r\n?/g, '\n');

export function checkUsername(value) {
  if (typeof value !== 'string' || !value) return '请填写用户名';
  if (!USERNAME_RE.test(value)) return '用户名为 3–20 位字母、数字或下划线';
  return null;
}

export function checkPassword(value) {
  if (typeof value !== 'string' || !value) return '请填写密码';
  if (value.length < 8) return '密码至少 8 位';
  if (value.length > 64 || Buffer.byteLength(value, 'utf8') > 72) return '密码最长 64 位';
  return null;
}

export function checkNickname(value) {
  if (typeof value !== 'string') return '昵称格式不正确';
  const v = value.trim();
  if (!v) return '请填写昵称';
  if (charLength(v) > 20) return '昵称最多 20 个字';
  if (CONTROL_RE.test(v)) return '昵称包含不支持的字符';
  return null;
}

const AVATAR_PRESETS = 12;

export function parseNicknameInput(body) {
  const error = checkNickname(body.nickname);
  if (error) throw validationError({ nickname: error });
  return body.nickname.trim();
}

export function parseAvatarPreset(body) {
  const preset = body.avatar_preset;
  if (!Number.isInteger(preset) || preset < 0 || preset >= AVATAR_PRESETS) {
    throw validationError({ avatar_preset: '头像序号不正确' });
  }
  return preset;
}

export function parsePasswordChange(body) {
  const current = body.current_password;
  if (typeof current !== 'string' || !current) {
    throw validationError({ current_password: '请填写当前密码' });
  }

  const next = body.new_password;
  const error = checkPassword(next);
  if (error) throw validationError({ new_password: error });
  if (next === current) {
    throw validationError({ new_password: '新密码不能与当前密码相同' });
  }

  return { current_password: current, new_password: next };
}

export function assertValid(fields) {
  const errors = Object.fromEntries(Object.entries(fields).filter(([, msg]) => msg));
  if (Object.keys(errors).length) throw validationError(errors);
}

export const REFLECTION_MAX = 500;

export function parseReflectionInput(body) {
  let bodyText = '';
  let visibility = 0;

  if (body.visibility !== undefined) {
    if (body.visibility === 0 || body.visibility === 1 || body.visibility === 2) {
      visibility = body.visibility;
    } else {
      throw validationError({ visibility: '可见范围不正确' });
    }
  }

  if (typeof body.body !== 'string' || !body.body.trim()) {
    throw validationError({ body: '请写下你的感悟' });
  }
  bodyText = normalizeNewlines(body.body).trim();
  if (charLength(bodyText) > REFLECTION_MAX) {
    throw validationError({ body: `感悟最多 ${REFLECTION_MAX} 字` });
  }
  if (MULTILINE_CONTROL_RE.test(bodyText)) {
    throw validationError({ body: '感悟包含不支持的字符' });
  }

  return { body: bodyText, visibility };
}

export const COMMENT_MAX = 300;

export function parseCommentInput(body) {
  if (typeof body.body !== 'string' || !body.body.trim()) {
    throw validationError({ body: '请写下评论' });
  }
  const text = normalizeNewlines(body.body).trim();
  if (charLength(text) > COMMENT_MAX) {
    throw validationError({ body: `评论最多 ${COMMENT_MAX} 字` });
  }
  if (MULTILINE_CONTROL_RE.test(text)) {
    throw validationError({ body: '评论包含不支持的字符' });
  }
  return { body: text };
}

export function parseQuoteRequestInput(body) {
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) throw validationError({ text: '请填写想收录的台词' });
  if (charLength(text) > 200) throw validationError({ text: '台词最多 200 字' });
  if (MULTILINE_CONTROL_RE.test(text)) throw validationError({ text: '台词包含不支持的字符' });

  const workTitle = typeof body.work_title === 'string' ? body.work_title.trim() : '';
  if (charLength(workTitle) > 120) throw validationError({ work_title: '影片名最多 120 字' });

  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (charLength(note) > 300) throw validationError({ note: '备注最多 300 字' });

  return { text, work_title: workTitle || null, note: note || null };
}

export function checkSlug(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,94}[a-z0-9]$/.test(value)) {
    return 'slug 只能包含小写字母、数字与连字符';
  }
  return null;
}

export function parseFriendQuery(value) {
  const q = typeof value === 'string' ? value.trim() : '';
  if (!q) throw validationError({ q: '请输入昵称或用户名' });
  if (charLength(q) > 20) throw validationError({ q: '搜索词最多 20 个字' });
  if (CONTROL_RE.test(q)) throw validationError({ q: '搜索词包含不支持的字符' });
  return q;
}

export function parseFriendTarget(body) {
  const id = body.user_id;
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw validationError({ user_id: '用户不存在' });
  }
  return id;
}

export function parseFriendAction(body) {
  if (body.action !== 'accept' && body.action !== 'reject') {
    throw validationError({ action: '操作不正确' });
  }
  return body.action;
}
