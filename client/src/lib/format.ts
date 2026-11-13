const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export const formatDate = (value: string | null | undefined) =>
  value ? dateFormatter.format(new Date(value)) : '';

export const visibilityLabel = (value: number) =>
  value === 2 ? '公开' : value === 1 ? '好友' : '私密';

export const statusLabel = (value: number) =>
  ({ 0: '草稿', 1: '已发布', 2: '已下线', 3: '墓碑' })[value] ?? '未知';

export function nextParam() {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname}${window.location.search}`;
}
