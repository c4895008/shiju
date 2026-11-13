import type { ReactNode } from 'react';
import { ApiError } from '../../api/client';

export const errText = (err: unknown) => (err instanceof ApiError ? err.message : '操作失败');

export function fieldError(err: unknown, field: string): string | undefined {
  if (!(err instanceof ApiError)) return undefined;
  const fields = (err.details as { fields?: Record<string, string> } | undefined)?.fields;
  return fields?.[field];
}

export function todayShanghai() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
}

export function truncateText(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

const STATUS_LABELS: Record<number, string> = {
  0: '草稿',
  1: '已发布',
  2: '已下线',
  3: '墓碑',
};

const STATUS_TONES: Record<number, string> = {
  0: 'draft',
  1: 'published',
  2: 'offline',
  3: 'removed',
};

export function StatusPill({
  status,
  labels,
}: {
  status: number;
  labels?: Record<number, string>;
}) {
  const label = labels?.[status] ?? STATUS_LABELS[status] ?? '未知';
  return <span className={`status-pill is-${STATUS_TONES[status] || 'draft'}`}>{label}</span>;
}

export function AdminEmpty({ children }: { children: ReactNode }) {
  return <p className="admin-empty">{children}</p>;
}

export function AdminPager({
  page,
  pageSize,
  total,
  busy,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  busy?: boolean;
  onChange: (page: number) => void;
}) {
  if (!total) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="admin-pager">
      <button
        type="button"
        className="btn btn-ghost btn-small"
        disabled={busy || page <= 1}
        onClick={() => onChange(page - 1)}
      >
        上一页
      </button>
      <span>
        第 {page} / {pages} 页 · 共 {total} 条
      </span>
      <button
        type="button"
        className="btn btn-ghost btn-small"
        disabled={busy || page >= pages}
        onClick={() => onChange(page + 1)}
      >
        下一页
      </button>
    </div>
  );
}
