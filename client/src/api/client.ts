export const TOKEN_KEY = 'shiju_token';

const runtimeBase = (globalThis as Record<string, unknown>).__SHIJU_API_BASE__ as string | undefined;
const BASE = runtimeBase || (typeof window === 'undefined' ? '' : '/api');

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export function clearSession() {
  setToken(null);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('shiju:logout'));
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const token = options.token === undefined ? getToken() : options.token;
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let payload: { data?: T; error?: { code: string; message: string; details?: unknown } } = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(res.status, 'BAD_RESPONSE', '服务返回了无法解析的内容');
  }

  if (!res.ok || payload.error) {
    const error = payload.error || { code: 'UNKNOWN', message: '请求失败' };
    if (
      res.status === 401 &&
      token &&
      ['TOKEN_EXPIRED', 'TOKEN_REVOKED', 'UNAUTHORIZED'].includes(error.code)
    ) {
      clearSession();
    }
    throw new ApiError(res.status, error.code, error.message, error.details);
  }

  return payload.data as T;
}

export const apiGet = <T>(path: string) => request<T>(path);

export const apiPost = <T>(path: string, body: unknown, headers?: Record<string, string>) =>
  request<T>(path, { method: 'POST', body, headers });

export const apiPut = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'PUT', body: body ?? {} });

export const apiDelete = <T>(path: string) => request<T>(path, { method: 'DELETE' });

export async function downloadFile(path: string, filename: string) {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let message = '导出失败';
    try {
      const payload = await res.json();
      message = payload?.error?.message || message;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, 'EXPORT_FAILED', message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
