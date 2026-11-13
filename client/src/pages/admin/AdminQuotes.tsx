import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { apiGet, apiPost, apiPut } from '../../api/client';
import type { AdminQuote, AdminTheme, AdminWork, Paged } from '../../api/types';
import { formatDate } from '../../lib/format';
import { AdminEmpty, AdminPager, StatusPill, errText, fieldError, truncateText } from './shared';
import { ThemePicker } from './ThemePicker';

const PAGE_SIZE = 20;

interface QuoteForm {
  work_id: string;
  slug: string;
  text: string;
  speaker: string;
  context: string;
  themes: string[];
  featured: boolean;
  status: number;
}

const emptyQuote: QuoteForm = {
  work_id: '',
  slug: '',
  text: '',
  speaker: '',
  context: '',
  themes: [],
  featured: false,
  status: 1,
};

export function AdminQuotes() {
  const [list, setList] = useState<Paged<AdminQuote> | null>(null);
  const [works, setWorks] = useState<AdminWork[]>([]);
  const [themeOptions, setThemeOptions] = useState<AdminTheme[]>([]);
  const [workId, setWorkId] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [rowBusy, setRowBusy] = useState<number | null>(null);

  const [form, setForm] = useState<QuoteForm>(emptyQuote);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const [bulkWorkId, setBulkWorkId] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [bulkError, setBulkError] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(
    async (nextPage: number) => {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({ page: String(nextPage), page_size: String(PAGE_SIZE) });
        if (workId) query.set('work_id', workId);
        if (status !== '') query.set('status', status);
        if (appliedQ) query.set('q', appliedQ);
        const [quotes, workPage, themePage] = await Promise.all([
          apiGet<Paged<AdminQuote>>(`/admin/quotes?${query.toString()}`),
          apiGet<Paged<AdminWork>>('/admin/works?page_size=100'),
          apiGet<{ items: AdminTheme[] }>('/admin/themes'),
        ]);
        setList(quotes);
        setWorks(workPage.items);
        setThemeOptions(themePage.items);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    },
    [workId, status, appliedQ],
  );

  useEffect(() => {
    void load(page);
  }, [load, page]);

  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    const next = q.trim();
    if (next === appliedQ) void load(1);
    else setAppliedQ(next);
    setPage(1);
  };

  const select = (quote: AdminQuote) => {
    setEditingId(quote.id);
    setMessage('');
    setError(null);
    setForm({
      work_id: String(quote.work_id),
      slug: quote.slug,
      text: quote.text,
      speaker: quote.speaker || '',
      context: quote.context || '',
      themes: quote.themes.map((theme) => theme.name),
      featured: quote.featured,
      status: quote.status,
    });
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyQuote);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage('');
    const payload = {
      work_id: Number(form.work_id),
      slug: form.slug.trim(),
      text: form.text.trim(),
      speaker: form.speaker.trim() || null,
      context: form.context.trim(),
      themes: form.themes,
      featured: form.featured,
      status: form.status,
    };
    try {
      if (editingId) {
        await apiPut(`/admin/quotes/${editingId}`, payload);
        setMessage('已保存');
      } else {
        await apiPost('/admin/quotes', payload);
        setMessage('已新建');
      }
      resetForm();
      if (editingId) await load(page);
      else if (page !== 1) setPage(1);
      else await load(1);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const quickStatus = async (quote: AdminQuote, next: number) => {
    const label = next === 2 ? '下线' : next === 3 ? '墓碑' : '发布';
    if (
      next !== 1 &&
      !window.confirm(
        `确定将「${truncateText(quote.text, 20)}」${label}吗？${next === 3 ? '墓碑不可恢复。' : ''}`,
      )
    ) {
      return;
    }
    setRowBusy(quote.id);
    setError(null);
    try {
      await apiPut(`/admin/quotes/${quote.id}/status`, { status: next });
      setMessage(`已${label}`);
      await load(page);
    } catch (err) {
      setError(err);
    } finally {
      setRowBusy(null);
    }
  };

  const submitBulk = async (event: FormEvent) => {
    event.preventDefault();
    setBulkError('');
    setMessage('');
    let items: unknown;
    try {
      items = JSON.parse(bulkText);
    } catch {
      setBulkError('JSON 解析失败，请检查格式');
      return;
    }
    if (!Array.isArray(items) || items.length === 0) {
      setBulkError('请提供至少一句台词');
      return;
    }
    setBulkBusy(true);
    try {
      const result = await apiPost<{ ids: number[]; count: number }>('/admin/quotes/bulk', {
        work_id: Number(bulkWorkId),
        items,
      });
      setMessage(`已批量导入 ${result.count} 句`);
      setBulkText('');
      setPage(1);
      await load(1);
    } catch (err) {
      setBulkError(
        fieldError(err, 'items') ||
          fieldError(err, 'work_id') ||
          fieldError(err, 'slug') ||
          errText(err),
      );
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <section className="admin-section">
      {message && <p className="form-success">{message}</p>}
      {error ? <p className="form-error">{errText(error)}</p> : null}

      <div className="admin-split">
        <div>
          <form className="admin-filters" onSubmit={applyFilters}>
            <select
              value={workId}
              onChange={(event) => {
                setWorkId(event.target.value);
                setPage(1);
              }}
            >
              <option value="">全部作品</option>
              {works.map((work) => (
                <option key={work.id} value={work.id}>
                  {work.title}
                </option>
              ))}
            </select>
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
              <option value="3">墓碑</option>
            </select>
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="搜台词或 slug，回车应用"
            />
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

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th className="col-optional">ID</th>
                  <th>台词</th>
                  <th>作品</th>
                  <th>状态</th>
                  <th className="col-optional">更新时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {list?.items.map((quote) => (
                  <tr key={quote.id} className={editingId === quote.id ? 'selected' : ''}>
                    <td className="col-optional">{quote.id}</td>
                    <td>
                      <button type="button" className="link-like" onClick={() => select(quote)}>
                        「{truncateText(quote.text, 20)}」
                      </button>
                      <div className="table-sub">
                        {quote.slug}
                        {quote.featured ? ' · 精选' : ''}
                      </div>
                    </td>
                    <td>《{quote.work.title}》</td>
                    <td>
                      <StatusPill status={quote.status} />
                    </td>
                    <td className="col-optional">{formatDate(quote.updated_at)}</td>
                    <td className="table-actions">
                      {(quote.status === 0 || quote.status === 2) && (
                        <button
                          type="button"
                          disabled={rowBusy === quote.id}
                          onClick={() => void quickStatus(quote, 1)}
                        >
                          发布
                        </button>
                      )}
                      {quote.status === 1 && (
                        <>
                          <button
                            type="button"
                            disabled={rowBusy === quote.id}
                            onClick={() => void quickStatus(quote, 2)}
                          >
                            下线
                          </button>
                          <a href={`/q/${quote.slug}`} target="_blank" rel="noreferrer">
                            查看
                          </a>
                        </>
                      )}
                      {quote.status === 2 && (
                        <button
                          type="button"
                          disabled={rowBusy === quote.id}
                          onClick={() => void quickStatus(quote, 3)}
                        >
                          墓碑
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loading && !list && <p className="admin-loading">加载中…</p>}
            {list && list.items.length === 0 && <AdminEmpty>没有符合条件的台词。</AdminEmpty>}
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
          <h3>{editingId ? `编辑 #${editingId}` : '新建台词'}</h3>
          <label>
            <span>作品</span>
            <select
              value={form.work_id}
              onChange={(event) => setForm({ ...form, work_id: event.target.value })}
              required
            >
              <option value="">选择作品</option>
              {works.map((work) => (
                <option key={work.id} value={work.id}>
                  {work.title}
                </option>
              ))}
            </select>
            {fieldError(error, 'work_id') && (
              <small className="field-error">{fieldError(error, 'work_id')}</small>
            )}
          </label>
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
            <span>台词（≤140 字）</span>
            <textarea
              value={form.text}
              onChange={(event) => setForm({ ...form, text: event.target.value })}
              rows={3}
              required
            />
            {fieldError(error, 'text') && (
              <small className="field-error">{fieldError(error, 'text')}</small>
            )}
          </label>
          <label>
            <span>角色</span>
            <input
              value={form.speaker}
              onChange={(event) => setForm({ ...form, speaker: event.target.value })}
            />
          </label>
          <label>
            <span>场景说明</span>
            <textarea
              value={form.context}
              onChange={(event) => setForm({ ...form, context: event.target.value })}
              rows={2}
              required
            />
            {fieldError(error, 'context') && (
              <small className="field-error">{fieldError(error, 'context')}</small>
            )}
          </label>
          <ThemePicker
            options={themeOptions}
            value={form.themes}
            onChange={(themes) => setForm({ ...form, themes })}
            error={fieldError(error, 'themes')}
          />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.featured}
              onChange={(event) => setForm({ ...form, featured: event.target.checked })}
            />
            <span>首页精选</span>
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
              <option value={3}>墓碑</option>
            </select>
          </label>
          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? '保存中…' : editingId ? '保存' : '新建'}
            </button>
            {editingId && (
              <button className="btn btn-ghost" type="button" onClick={resetForm} disabled={busy}>
                取消编辑
              </button>
            )}
          </div>
        </form>
      </div>

      <details className="admin-bulk">
        <summary>批量录入台词</summary>
        <form className="form" onSubmit={submitBulk}>
          <label>
            <span>作品</span>
            <select
              value={bulkWorkId}
              onChange={(event) => setBulkWorkId(event.target.value)}
              required
            >
              <option value="">选择作品</option>
              {works.map((work) => (
                <option key={work.id} value={work.id}>
                  {work.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>JSON 数组（单次最多 200 句）</span>
            <textarea
              value={bulkText}
              onChange={(event) => setBulkText(event.target.value)}
              rows={8}
              placeholder={`[
  {"slug":"example-quote","text":"台词","context":"场景说明","speaker":"角色","themes":["人生"],"featured":false}
]`}
              required
            />
          </label>
          <p className="meta-line">每项必须包含 slug、text、context；themes 需为已创建的主题名。</p>
          {bulkError && <p className="form-error">{bulkError}</p>}
          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={bulkBusy}>
              {bulkBusy ? '导入中…' : '开始导入'}
            </button>
          </div>
        </form>
      </details>
    </section>
  );
}
