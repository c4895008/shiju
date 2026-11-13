import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { apiGet, apiPost, apiPut } from '../../api/client';
import type { AdminWork, Paged } from '../../api/types';
import { formatDate } from '../../lib/format';
import { AdminEmpty, AdminPager, StatusPill, errText, fieldError } from './shared';

const PAGE_SIZE = 20;

interface WorkForm {
  slug: string;
  title: string;
  original_title: string;
  year: string;
  director: string;
  country: string;
  synopsis: string;
  status: number;
}

const emptyWork: WorkForm = {
  slug: '',
  title: '',
  original_title: '',
  year: '',
  director: '',
  country: '',
  synopsis: '',
  status: 1,
};

export function AdminWorks() {
  const [list, setList] = useState<Paged<AdminWork> | null>(null);
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [rowBusy, setRowBusy] = useState<number | null>(null);

  const [form, setForm] = useState<WorkForm>(emptyWork);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (nextPage: number) => {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({ page: String(nextPage), page_size: String(PAGE_SIZE) });
        if (appliedQ) query.set('q', appliedQ);
        if (status !== '') query.set('status', status);
        setList(await apiGet<Paged<AdminWork>>(`/admin/works?${query.toString()}`));
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    },
    [appliedQ, status],
  );

  useEffect(() => {
    void load(page);
  }, [load, page]);

  const select = (work: AdminWork) => {
    setEditingId(work.id);
    setMessage('');
    setError(null);
    setForm({
      slug: work.slug,
      title: work.title,
      original_title: work.original_title || '',
      year: work.year ? String(work.year) : '',
      director: work.director || '',
      country: work.country || '',
      synopsis: work.synopsis || '',
      status: work.status,
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage('');
    const payload = {
      slug: form.slug.trim(),
      title: form.title.trim(),
      original_title: form.original_title.trim() || null,
      year: form.year ? Number(form.year) : null,
      director: form.director.trim() || null,
      country: form.country.trim() || null,
      synopsis: form.synopsis.trim() || null,
      status: form.status,
    };
    try {
      if (editingId) {
        await apiPut(`/admin/works/${editingId}`, payload);
        setMessage('已保存');
      } else {
        await apiPost('/admin/works', payload);
        setMessage('已新建作品');
      }
      setEditingId(null);
      setForm(emptyWork);
      if (editingId) await load(page);
      else if (page !== 1) setPage(1);
      else await load(1);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const quickStatus = async (work: AdminWork, next: number) => {
    const label = next === 1 ? '发布' : '下线';
    if (next === 2 && !window.confirm(`确定下线《${work.title}》吗？其下台词将不再出现在公开页。`)) {
      return;
    }
    setRowBusy(work.id);
    setError(null);
    try {
      await apiPut(`/admin/works/${work.id}`, { status: next });
      setMessage(`已${label}`);
      await load(page);
    } catch (err) {
      setError(err);
    } finally {
      setRowBusy(null);
    }
  };

  return (
    <section className="admin-section admin-split">
      <div>
        <form
          className="admin-filters"
          onSubmit={(event) => {
            event.preventDefault();
            const next = q.trim();
            if (next === appliedQ) void load(1);
            else setAppliedQ(next);
            setPage(1);
          }}
        >
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="搜片名、原名或 slug"
          />
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">全部状态</option>
            <option value="0">草稿</option>
            <option value="1">已发布</option>
            <option value="2">已下线</option>
          </select>
          <button className="btn btn-ghost btn-small" type="submit">
            搜索
          </button>
          <button
            className="btn btn-ghost btn-small"
            type="button"
            onClick={() => void load(page)}
            disabled={loading}
          >
            刷新
          </button>
        </form>

        {message && <p className="form-success">{message}</p>}
        {error ? <p className="form-error">{errText(error)}</p> : null}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th className="col-optional">ID</th>
                <th>影片</th>
                <th className="col-optional">年份</th>
                <th>台词数</th>
                <th>状态</th>
                <th className="col-optional">更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {list?.items.map((work) => (
                <tr key={work.id} className={editingId === work.id ? 'selected' : ''}>
                  <td className="col-optional">{work.id}</td>
                  <td>
                    <button type="button" className="link-like" onClick={() => select(work)}>
                      《{work.title}》
                    </button>
                    <div className="table-sub">{work.slug}</div>
                  </td>
                  <td className="col-optional">{work.year || '—'}</td>
                  <td>{work.quote_count}</td>
                  <td>
                    <StatusPill status={work.status} />
                  </td>
                  <td className="col-optional">{formatDate(work.updated_at)}</td>
                  <td className="table-actions">
                    {work.status === 1 ? (
                      <>
                        <button
                          type="button"
                          disabled={rowBusy === work.id}
                          onClick={() => void quickStatus(work, 2)}
                        >
                          下线
                        </button>
                        <a href={`/movie/${work.slug}`} target="_blank" rel="noreferrer">
                          查看
                        </a>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={rowBusy === work.id}
                        onClick={() => void quickStatus(work, 1)}
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
          {list && list.items.length === 0 && <AdminEmpty>没有符合条件的作品。</AdminEmpty>}
        </div>
        <AdminPager
          page={page}
          pageSize={PAGE_SIZE}
          total={list?.total || 0}
          busy={loading}
          onChange={setPage}
        />
      </div>

      <form className="admin-form form" onSubmit={submit}>
        <h3>{editingId ? `编辑 #${editingId}` : '新建作品'}</h3>
        <label>
          <span>slug</span>
          <input
            value={form.slug}
            onChange={(event) => setForm({ ...form, slug: event.target.value })}
            required={editingId !== null}
          />
          <small className="hint">
            {editingId ? '修改后旧地址会自动跳转到新地址' : '留空时按片名自动生成，如 kong-qiang'}
          </small>
          {fieldError(error, 'slug') && (
            <small className="field-error">{fieldError(error, 'slug')}</small>
          )}
        </label>
        <label>
          <span>片名</span>
          <input
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            required
          />
          {fieldError(error, 'title') && (
            <small className="field-error">{fieldError(error, 'title')}</small>
          )}
        </label>
        <label>
          <span>原名</span>
          <input
            value={form.original_title}
            onChange={(event) => setForm({ ...form, original_title: event.target.value })}
          />
        </label>
        <label>
          <span>年份</span>
          <input
            value={form.year}
            onChange={(event) => setForm({ ...form, year: event.target.value })}
            inputMode="numeric"
          />
        </label>
        <label>
          <span>导演</span>
          <input
            value={form.director}
            onChange={(event) => setForm({ ...form, director: event.target.value })}
          />
        </label>
        <label>
          <span>国家</span>
          <input
            value={form.country}
            onChange={(event) => setForm({ ...form, country: event.target.value })}
          />
        </label>
        <label>
          <span>简介</span>
          <textarea
            value={form.synopsis}
            onChange={(event) => setForm({ ...form, synopsis: event.target.value })}
            rows={3}
          />
        </label>
        <label>
          <span>状态</span>
          <select
            value={form.status}
            onChange={(event) => setForm({ ...form, status: Number(event.target.value) })}
          >
            <option value={0}>草稿</option>
            <option value={1}>发布</option>
            <option value={2}>下线</option>
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
                setForm(emptyWork);
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
