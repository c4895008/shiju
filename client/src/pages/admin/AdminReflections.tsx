import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPut } from '../../api/client';
import type { AdminReflection, Paged } from '../../api/types';
import { formatDate, visibilityLabel } from '../../lib/format';
import { AdminComments } from './AdminComments';
import { AdminEmpty, AdminPager, StatusPill, errText, truncateText } from './shared';

const PAGE_SIZE = 20;

export function AdminReflections() {
  const [status, setStatus] = useState('1');
  const [visibility, setVisibility] = useState('');
  const [data, setData] = useState<Paged<AdminReflection> | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [rowBusy, setRowBusy] = useState<number | null>(null);
  const [commentsFor, setCommentsFor] = useState<AdminReflection | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(
    async (nextPage: number) => {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({ page: String(nextPage), page_size: String(PAGE_SIZE) });
        if (status !== '') query.set('status', status);
        if (visibility !== '') query.set('visibility', visibility);
        setData(await apiGet<Paged<AdminReflection>>(`/admin/reflections?${query.toString()}`));
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    },
    [status, visibility],
  );

  useEffect(() => {
    void load(page);
  }, [load, page]);

  const mark = async (item: AdminReflection, next: number) => {
    if (
      next === 2 &&
      !window.confirm(
        `确定隐藏 ${item.nickname} 的这条感悟吗？隐藏后公开页与读友动态不再展示，作者仅可查看和删除。`,
      )
    ) {
      return;
    }
    setRowBusy(item.id);
    setError(null);
    setMessage('');
    try {
      await apiPut(`/admin/reflections/${item.id}/status`, { status: next });
      setMessage(next === 2 ? '已隐藏' : '已恢复');
      await load(page);
    } catch (err) {
      setError(err);
    } finally {
      setRowBusy(null);
    }
  };

  return (
    <section className="admin-section">
      <div className="admin-filters">
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="1">正常</option>
          <option value="2">已隐藏</option>
          <option value="">全部状态</option>
        </select>
        <select
          value={visibility}
          onChange={(event) => {
            setVisibility(event.target.value);
            setPage(1);
          }}
        >
          <option value="">全部可见范围</option>
          <option value="2">公开</option>
          <option value="1">好友</option>
          <option value="0">私密</option>
        </select>
        <button
          className="btn btn-ghost btn-small"
          type="button"
          onClick={() => void load(page)}
          disabled={loading}
        >
          刷新
        </button>
      </div>

      {message && <p className="form-success">{message}</p>}
      {error ? <p className="form-error">{errText(error)}</p> : null}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th className="col-optional">ID</th>
              <th>感悟</th>
              <th className="col-optional">作者</th>
              <th>出处</th>
              <th>可见范围</th>
              <th className="col-optional">评论</th>
              <th className="col-optional">时间</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((item) => (
              <tr key={item.id} className={rowBusy === item.id || commentsFor?.id === item.id ? 'selected' : ''}>
                <td className="col-optional">{item.id}</td>
                <td>{truncateText(item.body, 80)}</td>
                <td className="col-optional">{item.nickname}</td>
                <td>
                  <a href={`/q/${item.quote.slug}`} target="_blank" rel="noreferrer">
                    「{truncateText(item.quote.text, 16)}」
                  </a>
                  <div className="table-sub">《{item.work.title}》</div>
                </td>
                <td>{visibilityLabel(item.visibility)}</td>
                <td className="col-optional">{item.comment_count}</td>
                <td className="col-optional">{formatDate(item.published_at || item.created_at)}</td>
                <td>
                  <StatusPill status={item.status} labels={{ 1: '正常', 2: '已隐藏' }} />
                </td>
                <td className="table-actions">
                  {item.status === 1 ? (
                    <button
                      type="button"
                      disabled={rowBusy === item.id}
                      onClick={() => void mark(item, 2)}
                    >
                      隐藏
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={rowBusy === item.id}
                      onClick={() => void mark(item, 1)}
                    >
                      恢复
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setCommentsFor(commentsFor?.id === item.id ? null : item)}
                  >
                    {commentsFor?.id === item.id ? '收起评论' : '管理评论'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && !data && <p className="admin-loading">加载中…</p>}
        {data && data.items.length === 0 && <AdminEmpty>没有符合条件的感悟。</AdminEmpty>}
      </div>
      {commentsFor && (
        <AdminComments
          reflection={commentsFor}
          onChanged={() => void load(page)}
          onClose={() => setCommentsFor(null)}
        />
      )}
      <AdminPager
        page={page}
        pageSize={PAGE_SIZE}
        total={data?.total || 0}
        busy={loading}
        onChange={setPage}
      />
    </section>
  );
}
