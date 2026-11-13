import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPut } from '../../api/client';
import type { AdminRequest, Paged } from '../../api/types';
import { formatDate } from '../../lib/format';
import { AdminEmpty, AdminPager, errText, truncateText } from './shared';

const PAGE_SIZE = 20;

const REQUEST_LABELS: Record<number, string> = { 1: '待处理', 2: '已收录', 3: '已忽略' };

export function AdminRequests() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('1');
  const [data, setData] = useState<Paged<AdminRequest> | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [rowBusy, setRowBusy] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(
    async (nextPage: number) => {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({ page: String(nextPage), page_size: String(PAGE_SIZE) });
        if (status !== '') query.set('status', status);
        setData(await apiGet<Paged<AdminRequest>>(`/admin/quote-requests?${query.toString()}`));
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    },
    [status],
  );

  useEffect(() => {
    void load(page);
  }, [load, page]);

  const collect = (request: AdminRequest) => {
    navigate(`/admin/review/${request.id}`);
  };

  const mark = async (request: AdminRequest, next: number) => {
    if (next === 3 && !window.confirm(`确定忽略这条求收录吗？\n\n${request.text}`)) return;
    setRowBusy(request.id);
    setError(null);
    setMessage('');
    try {
      await apiPut(`/admin/quote-requests/${request.id}/status`, { status: next });
      setMessage(next === 3 ? '已忽略' : '已恢复待处理');
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
          <option value="1">待处理</option>
          <option value="2">已收录</option>
          <option value="3">已忽略</option>
          <option value="">全部</option>
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
              <th>台词</th>
              <th>出处</th>
              <th className="col-optional">备注</th>
              <th className="col-optional">用户</th>
              <th className="col-optional">时间</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((request) => (
              <tr key={request.id} className={rowBusy === request.id ? 'selected' : ''}>
                <td className="col-optional">{request.id}</td>
                <td>{truncateText(request.text, 60)}</td>
                <td>{request.work_title || '—'}</td>
                <td className="col-optional">{request.note || '—'}</td>
                <td className="col-optional">{request.nickname}</td>
                <td className="col-optional">{formatDate(request.created_at)}</td>
                <td>{REQUEST_LABELS[request.status] || '未知'}</td>
                <td className="table-actions">
                  {request.status === 1 ? (
                    <>
                      <button
                        type="button"
                        disabled={rowBusy === request.id}
                        onClick={() => collect(request)}
                      >
                        收录
                      </button>
                      <button
                        type="button"
                        disabled={rowBusy === request.id}
                        onClick={() => void mark(request, 3)}
                      >
                        忽略
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={rowBusy === request.id}
                      onClick={() => void mark(request, 1)}
                    >
                      恢复待处理
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && !data && <p className="admin-loading">加载中…</p>}
        {data && data.items.length === 0 && <AdminEmpty>没有符合条件的求收录请求。</AdminEmpty>}
      </div>
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
