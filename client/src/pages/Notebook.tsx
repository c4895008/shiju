import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, apiDelete, apiGet, apiPut, downloadFile } from '../api/client';
import type { Paged, WorkRef } from '../api/types';
import { formatDate, visibilityLabel } from '../lib/format';

interface NotebookItem {
  id: number;
  body: string;
  visibility: number;
  status: number;
  like_count: number;
  created_at: string;
  quote: { id: number; slug: string; text: string; speaker: string | null; context: string | null };
}

interface NotebookGroup {
  work: WorkRef;
  reflections: NotebookItem[];
}

type NotebookData = Paged<NotebookGroup> & { reflection_total: number };

function mergeNotebook(prev: NotebookData, next: NotebookData): NotebookData {
  const items = prev.items.map((group) => ({ ...group, reflections: [...group.reflections] }));
  const index = new Map(items.map((group) => [group.work.id, group]));
  for (const group of next.items) {
    const existing = index.get(group.work.id);
    if (!existing) {
      const copy = { ...group, reflections: [...group.reflections] };
      items.push(copy);
      index.set(group.work.id, copy);
      continue;
    }
    const seen = new Set(existing.reflections.map((item) => item.id));
    existing.reflections.push(...group.reflections.filter((item) => !seen.has(item.id)));
  }
  return { ...next, items };
}

export function NotebookPage() {
  const [data, setData] = useState<NotebookData | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const load = async (targetPage: number, append = false) => {
    setError('');
    try {
      const result = await apiGet<NotebookData>(`/me/reflections?page=${targetPage}&page_size=20`);
      setData((prev) => (append && prev ? mergeNotebook(prev, result) : result));
      setPage(targetPage);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '加载失败');
    }
  };

  useEffect(() => {
    void load(1);
  }, []);

  const updateVisibility = async (item: NotebookItem, visibility: number) => {
    setBusy(item.id);
    setActionError('');
    try {
      const updated = await apiPut<{ visibility: number }>(`/reflections/${item.id}/visibility`, { visibility });
      setData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((group) => ({
                ...group,
                reflections: group.reflections.map((row) =>
                  row.id === item.id ? { ...row, visibility: updated.visibility } : row,
                ),
              })),
            }
          : prev,
      );
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : '修改失败');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (item: NotebookItem) => {
    if (!window.confirm('删除后不可恢复，确定删除这条感悟吗？')) return;
    setBusy(item.id);
    setActionError('');
    const remaining = data
      ? data.items.reduce((count, group) => count + group.reflections.length, 0) - 1
      : 0;
    try {
      await apiDelete(`/reflections/${item.id}`);
      setData((prev) => {
        if (!prev) return prev;
        const items = prev.items
          .map((group) => ({
            ...group,
            reflections: group.reflections.filter((row) => row.id !== item.id),
          }))
          .filter((group) => group.reflections.length > 0);
        const total = Math.max(0, prev.reflection_total - 1);
        return {
          ...prev,
          items,
          total,
          reflection_total: total,
          has_more: prev.page * prev.page_size < total,
        };
      });
      if (remaining === 0 && page > 1) await load(page - 1);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : '删除失败');
    } finally {
      setBusy(null);
    }
  };

  const exportAs = async (format: 'md' | 'txt') => {
    setExporting(format);
    setActionError('');
    try {
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      await downloadFile(`/me/export?format=${format}`, `拾句-台词本-${stamp}.${format}`);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : '导出失败');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="page notebook-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">我的</p>
          <h1>台词本</h1>
          <p className="meta-line">{data ? `共 ${data.reflection_total} 条感悟` : '正在加载…'}</p>
        </div>
        <div className="head-actions">
          <Link className="btn btn-ghost" to="/settings">
            个人设置
          </Link>
          <button className="btn btn-ghost" type="button" onClick={() => exportAs('md')} disabled={exporting !== null}>
            {exporting === 'md' ? '导出中…' : '导出 Markdown'}
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => exportAs('txt')} disabled={exporting !== null}>
            {exporting === 'txt' ? '导出中…' : '导出 TXT'}
          </button>
        </div>
      </header>

      {error && <p className="form-error">{error}</p>}
      {actionError && <p className="form-error">{actionError}</p>}

      {data && data.items.length === 0 && (
        <div className="empty-state">
          <h2>台词本还是空的</h2>
          <p>去首页找一句打动你的台词，写下第一条感悟。</p>
          <Link className="btn btn-primary" to="/">
            去挑一句
          </Link>
        </div>
      )}

      {data?.items.map((group) => (
        <section key={group.work.id} className="notebook-group">
          <div className="section-head">
            <h2>
              <Link to={`/movie/${group.work.slug}`}>《{group.work.title}》</Link>
            </h2>
            <span className="section-sub">{group.reflections.length} 条</span>
          </div>
          <ul className="notebook-list">
            {group.reflections.map((item) => (
              <li key={item.id} className="notebook-item">
                <Link to={`/q/${item.quote.slug}`} className="notebook-quote">
                  「{item.quote.text}」
                </Link>
                <p className="notebook-body">{item.body}</p>
                <div className="notebook-tools">
                  <span className="meta-line">
                    {formatDate(item.created_at)} · {item.status === 2 ? '已隐藏' : visibilityLabel(item.visibility)}
                  </span>
                  {item.status === 2 ? (
                    <span className="pill">管理员隐藏</span>
                  ) : (
                    <>
                      <label className="inline-select">
                        <span>可见</span>
                        <select
                          value={item.visibility}
                          disabled={busy === item.id}
                          onChange={(event) => updateVisibility(item, Number(event.target.value))}
                        >
                          <option value={0}>私密</option>
                          <option value={1}>好友</option>
                          <option value={2}>公开</option>
                        </select>
                      </label>
                      <Link className="text-link" to={`/q/${item.quote.slug}/write`}>
                        编辑
                      </Link>
                    </>
                  )}
                  <button className="text-link danger" type="button" onClick={() => remove(item)} disabled={busy === item.id}>
                    删除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {data && data.has_more && (
        <div className="center">
          <button className="btn btn-ghost" type="button" onClick={() => load(page + 1, true)}>
            加载更多
          </button>
        </div>
      )}
    </div>
  );
}
