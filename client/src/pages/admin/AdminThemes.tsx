import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { apiGet, apiPost, apiPut } from '../../api/client';
import type { AdminTheme } from '../../api/types';
import { formatDate } from '../../lib/format';
import { AdminEmpty, StatusPill, errText, fieldError } from './shared';

interface ThemeForm {
  slug: string;
  name: string;
  description: string;
  sort_order: string;
  status: number;
}

const emptyTheme: ThemeForm = { slug: '', name: '', description: '', sort_order: '0', status: 1 };

export function AdminThemes() {
  const [list, setList] = useState<AdminTheme[] | null>(null);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [rowBusy, setRowBusy] = useState<number | null>(null);

  const [form, setForm] = useState<ThemeForm>(emptyTheme);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ items: AdminTheme[] } | AdminTheme[]>('/admin/themes');
      setList(Array.isArray(data) ? data : data.items);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const select = (theme: AdminTheme) => {
    setEditingId(theme.id);
    setMessage('');
    setError(null);
    setForm({
      slug: theme.slug,
      name: theme.name,
      description: theme.description || '',
      sort_order: String(theme.sort_order),
      status: theme.status,
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage('');
    const payload = {
      slug: form.slug.trim(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      sort_order: Number(form.sort_order) || 0,
      status: form.status,
    };
    try {
      if (editingId) {
        await apiPut(`/admin/themes/${editingId}`, payload);
        setMessage('已保存');
      } else {
        await apiPost('/admin/themes', payload);
        setMessage('已新建主题');
      }
      setEditingId(null);
      setForm(emptyTheme);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const quickStatus = async (theme: AdminTheme, next: number) => {
    const label = next === 1 ? '发布' : '隐藏';
    if (
      next === 0 &&
      !window.confirm(`确定隐藏「${theme.name}」主题吗？隐藏后公开页不再展示。`)
    ) {
      return;
    }
    setRowBusy(theme.id);
    setError(null);
    try {
      await apiPut(`/admin/themes/${theme.id}`, { status: next });
      setMessage(`已${label}`);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setRowBusy(null);
    }
  };

  const visible = (list || []).filter((theme) => filter === '' || String(theme.status) === filter);

  return (
    <section className="admin-section admin-split">
      <div>
        <div className="admin-filters">
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="">全部状态</option>
            <option value="1">已发布</option>
            <option value="0">已隐藏</option>
          </select>
          <button
            className="btn btn-ghost btn-small"
            type="button"
            onClick={() => void load()}
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
                <th>主题</th>
                <th className="col-optional">排序</th>
                <th>台词数</th>
                <th>状态</th>
                <th className="col-optional">更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((theme) => (
                <tr key={theme.id} className={editingId === theme.id ? 'selected' : ''}>
                  <td className="col-optional">{theme.id}</td>
                  <td>
                    <button type="button" className="link-like" onClick={() => select(theme)}>
                      {theme.name}
                    </button>
                    <div className="table-sub">{theme.slug}</div>
                  </td>
                  <td className="col-optional">{theme.sort_order}</td>
                  <td>{theme.quote_count || 0}</td>
                  <td>
                    <StatusPill status={theme.status} labels={{ 0: '已隐藏', 1: '已发布' }} />
                  </td>
                  <td className="col-optional">{formatDate(theme.updated_at)}</td>
                  <td className="table-actions">
                    {theme.status === 1 ? (
                      <>
                        <button
                          type="button"
                          disabled={rowBusy === theme.id}
                          onClick={() => void quickStatus(theme, 0)}
                        >
                          隐藏
                        </button>
                        <a href={`/theme/${theme.slug}`} target="_blank" rel="noreferrer">
                          查看
                        </a>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={rowBusy === theme.id}
                        onClick={() => void quickStatus(theme, 1)}
                      >
                        发布
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && !list && <p className="admin-loading">加载中…</p>}
          {list && visible.length === 0 && <AdminEmpty>没有符合条件的主题。</AdminEmpty>}
        </div>
      </div>

      <form className="admin-form form" onSubmit={submit}>
        <h3>{editingId ? `编辑 #${editingId}` : '新建主题'}</h3>
        <label>
          <span>slug</span>
          <input
            value={form.slug}
            onChange={(event) => setForm({ ...form, slug: event.target.value })}
            required
          />
          {fieldError(error, 'slug') && (
            <small className="field-error">{fieldError(error, 'slug')}</small>
          )}
        </label>
        <label>
          <span>名称</span>
          <input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            required
          />
          {fieldError(error, 'name') && (
            <small className="field-error">{fieldError(error, 'name')}</small>
          )}
        </label>
        <label>
          <span>描述</span>
          <textarea
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            rows={3}
          />
          {fieldError(error, 'description') && (
            <small className="field-error">{fieldError(error, 'description')}</small>
          )}
        </label>
        <label>
          <span>排序</span>
          <input
            value={form.sort_order}
            onChange={(event) => setForm({ ...form, sort_order: event.target.value })}
            inputMode="numeric"
          />
        </label>
        <label>
          <span>状态</span>
          <select
            value={form.status}
            onChange={(event) => setForm({ ...form, status: Number(event.target.value) })}
          >
            <option value={0}>隐藏</option>
            <option value={1}>发布</option>
          </select>
        </label>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? '保存中…' : editingId ? '保存' : '新建'}
          </button>
          {editingId && (
            <button
              className="btn btn-ghost"
              type="button"
              disabled={busy}
              onClick={() => {
                setEditingId(null);
                setForm(emptyTheme);
              }}
            >
              取消编辑
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
