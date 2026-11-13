import { Link } from 'react-router-dom';

export function Pagination({
  page,
  hasMore,
  total,
  makeHref,
}: {
  page: number;
  hasMore: boolean;
  total: number;
  makeHref: (page: number) => string;
}) {
  if (page <= 1 && !hasMore) return null;
  return (
    <nav className="pagination" aria-label="分页">
      {page > 1 ? (
        <Link className="btn btn-ghost" to={makeHref(page - 1)} rel="prev">
          ← 上一页
        </Link>
      ) : (
        <span />
      )}
      <span className="pagination-info">
        第 {page} 页 · 共 {total} 条
      </span>
      {hasMore ? (
        <Link className="btn btn-ghost" to={makeHref(page + 1)} rel="next">
          下一页 →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
