import { useCallback, useEffect, useState } from 'react';
import { apiDelete, apiGet, apiPut } from '../../api/client';
import type { AdminComment, AdminReflection, Paged } from '../../api/types';
import { formatDate } from '../../lib/format';
import { AdminEmpty, AdminPager, StatusPill, errText, truncateText } from './shared';

const PAGE_SIZE = 20;

export function AdminComments({
  reflection,
  onChanged,
  onClose,
}: {
  reflection: AdminReflection;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<AdminComment> | null>(null);
  const [loading, setLoading] = useState(true);
  const [rowBusy, setRowBusy] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
      if (status !== '') query.set('status', status);
      setData(
        await apiGet<Paged<AdminComment>>(`/admin/reflections/${reflection.id}/comments?${query.toString()}`),
      );
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [page, status, reflection.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const mark = async (item: AdminComment, next: number) => {
    setRowBusy(item.id);
    setError(null);
    setMessage('');
    try {
      await apiPut(`/admin/comments/${item.id}/status`, { status: next });
      setMessage(next === 2 ? '评论已隐藏' : '评论已恢复');
      await load();
      onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setRowBusy(null);
    }
  };

  const remove = async (item: AdminComment) => {
    if (!window.confirm('删除后不可恢复，确定删除这条评论吗？')) return;
    setRowBusy(item.id);
    setError(null);
    setMessage('');
    try {
      await apiDelete(`/admin/comments/${item.id}`);
      setMessage('评论已删除');
      await load();
      onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setRowBusy(null);
    }
  };

  return (
    <div className="admin-panel admin-comments">
      <div className="admin-panel-head">
        <h3>评论管理</h3>
        <button type="button" className="btn btn-ghost btn-small" onClick={onClose}>
          关闭
        </button>
      </div>
      <p className="table-sub">
        {reflection.nickname}：{truncateText(reflection.body, 60)}
      </p>

      <div className="admin-filters">
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">全部评论</option>
          <option value="1">正常</option>
          <option value="2">已隐藏</option>
        </select>
        <button className="btn btn-ghost btn-small" type="button" onClick={() => void load()} disabled={loading}>
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
              <th>评论</th>
              <th className="col-optional">评论者</th>
              <th className="col-optional">时间</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((item) => (
              <tr key={item.id} className={rowBusy === item.id ? 'selected' : ''}>
                <td className="col-optional">{item.id}</td>
                <td>{truncateText(item.body, 80)}</td>
                <td className="col-optional">{item.nickname}</td>
                <td className="col-optional">{formatDate(item.created_at)}</td>
                <td>
                  <StatusPill status={item.status} labels={{ 1: '正常', 2: '已隐藏' }} />
                </td>
                <td className="table-actions">
                  {item.status === 1 ? (
                    <button type="button" disabled={rowBusy === item.id} onClick={() => void mark(item, 2)}>
                      隐藏
                    </button>
                  ) : (
                    <button type="button" disabled={rowBusy === item.id} onClick={() => void mark(item, 1)}>
                      恢复
                    </button>
                  )}
                  <button type="button" disabled={rowBusy === item.id} onClick={() => void remove(item)}>
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && !data && <p className="admin-loading">加载中…</p>}
        {data && data.items.length === 0 && <AdminEmpty>这条感悟下还没有评论。</AdminEmpty>}
      </div>
      <AdminPager
        page={page}
        pageSize={PAGE_SIZE}
        total={data?.total || 0}
        busy={loading}
        onChange={setPage}
      />
    </div>
  );
}
