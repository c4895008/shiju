import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet, apiPost, apiPut } from '../../api/client';
import type { AdminRequest, AdminTheme, AdminWork, Paged } from '../../api/types';
import { formatDate } from '../../lib/format';
import { AdminEmpty, StatusPill, errText, fieldError } from './shared';
import { ThemePicker } from './ThemePicker';

const REQUEST_LABELS: Record<number, string> = { 1: '待处理', 2: '已收录', 3: '已忽略' };

const cleanTitle = (value: string) => value.replace(/[《》]/g, '').trim();

interface WorkForm {
  title: string;
  slug: string;
  year: string;
  director: string;
  synopsis: string;
}

const emptyWork: WorkForm = { title: '', slug: '', year: '', director: '', synopsis: '' };

interface QuoteForm {
  slug: string;
  text: string;
  speaker: string;
  context: string;
  themes: string[];
  featured: boolean;
  status: number;
}

const emptyQuote: QuoteForm = {
  slug: '',
  text: '',
  speaker: '',
  context: '',
  themes: [],
  featured: false,
  status: 1,
};

export function AdminReviewPage() {
  const { id } = useParams();
  const requestId = Number(id) || 0;

  const [request, setRequest] = useState<AdminRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);

  const [workQuery, setWorkQuery] = useState('');
  const [workResults, setWorkResults] = useState<AdminWork[]>([]);
  const [worksLoading, setWorksLoading] = useState(false);
  const [workError, setWorkError] = useState('');
  const [selectedWork, setSelectedWork] = useState<AdminWork | null>(null);

  const [showWorkForm, setShowWorkForm] = useState(false);
  const [workForm, setWorkForm] = useState<WorkForm>(emptyWork);
  const [workFormError, setWorkFormError] = useState<unknown>(null);
  const [workBusy, setWorkBusy] = useState(false);

  const [quoteForm, setQuoteForm] = useState<QuoteForm>(emptyQuote);
  const [quoteError, setQuoteError] = useState<unknown>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);

  const [themeOptions, setThemeOptions] = useState<AdminTheme[]>([]);
  const [themeLoadError, setThemeLoadError] = useState('');

  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [message, setMessage] = useState('');

  const [created, setCreated] = useState<{ slug: string } | null>(null);
  const [marked, setMarked] = useState(false);

  const searchWorks = useCallback(async (term: string) => {
    setWorksLoading(true);
    setWorkError('');
    try {
      const query = new URLSearchParams({ page_size: '20' });
      if (term) query.set('q', term);
      const data = await apiGet<Paged<AdminWork>>(`/admin/works?${query.toString()}`);
      setWorkResults(data.items);
      return data.items;
    } catch (err) {
      setWorkError(errText(err));
      return [];
    } finally {
      setWorksLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!requestId) {
      setLoading(false);
      setLoadError(new Error('请求不存在'));
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void apiGet<AdminRequest>(`/admin/quote-requests/${requestId}`)
      .then((data) => {
        if (cancelled) return;
        setRequest(data);
        setQuoteForm({ ...emptyQuote, text: data.text });
        const term = cleanTitle(data.work_title || '');
        setWorkQuery(term);
        setWorkForm((prev) => (prev.title ? prev : { ...prev, title: term }));
        void searchWorks(term).then((items) => {
          if (cancelled) return;
          const exact =
            items.find((work) => work.title === term) ||
            items.find(
              (work) => term && (work.title.includes(term) || term.includes(work.title)),
            );
          if (exact) setSelectedWork(exact);
        });
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [requestId, searchWorks]);

  useEffect(() => {
    void apiGet<{ items: AdminTheme[] }>('/admin/themes')
      .then((data) => setThemeOptions(data.items))
      .catch((err) => setThemeLoadError(errText(err)));
  }, []);

  const markCollected = async () => {
    setActionBusy(true);
    setActionError(null);
    try {
      await apiPut(`/admin/quote-requests/${requestId}/status`, { status: 2 });
      setMarked(true);
      setMessage('已收录');
      setRequest((prev) => (prev ? { ...prev, status: 2 } : prev));
    } catch (err) {
      setActionError(err);
    } finally {
      setActionBusy(false);
    }
  };

  const submitWork = async (event: FormEvent) => {
    event.preventDefault();
    setWorkBusy(true);
    setWorkFormError(null);
    setMessage('');
    const title = workForm.title.trim();
    const slug = workForm.slug.trim();
    try {
      const data = await apiPost<{ id: number; slug: string }>('/admin/works', {
        title,
        slug,
        year: workForm.year ? Number(workForm.year) : null,
        director: workForm.director.trim() || null,
        synopsis: workForm.synopsis.trim() || null,
        status: 1,
      });
      const work: AdminWork = {
        id: data.id,
        slug: data.slug || slug,
        title,
        year: workForm.year ? Number(workForm.year) : null,
        director: workForm.director.trim() || null,
        synopsis: workForm.synopsis.trim() || null,
        status: 1,
        quote_count: 0,
        updated_at: new Date().toISOString(),
      };
      setSelectedWork(work);
      setWorkResults((prev) => [work, ...prev]);
      setWorkQuery(title);
      setWorkForm(emptyWork);
      setShowWorkForm(false);
      setMessage(`已新建作品《${title}》`);
    } catch (err) {
      setWorkFormError(err);
    } finally {
      setWorkBusy(false);
    }
  };

  const submitQuote = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedWork) return;
    setQuoteBusy(true);
    setQuoteError(null);
    setMessage('');
    setActionError(null);
    const slug = quoteForm.slug.trim();
    try {
      await apiPost<{ id: number }>('/admin/quotes', {
        work_id: selectedWork.id,
        slug,
        text: quoteForm.text.trim(),
        speaker: quoteForm.speaker.trim() || null,
        context: quoteForm.context.trim(),
        themes: quoteForm.themes,
        featured: quoteForm.featured,
        status: quoteForm.status,
      });
      setCreated({ slug });
      await markCollected();
    } catch (err) {
      setQuoteError(err);
    } finally {
      setQuoteBusy(false);
    }
  };

  const markRequest = async (status: number, label: string) => {
    if (status === 3 && !window.confirm('确定忽略这条求收录吗？')) return;
    setActionBusy(true);
    setActionError(null);
    setMessage('');
    try {
      await apiPut(`/admin/quote-requests/${requestId}/status`, { status });
      setRequest((prev) => (prev ? { ...prev, status } : prev));
      setMessage(`已${label}`);
    } catch (err) {
      setActionError(err);
    } finally {
      setActionBusy(false);
    }
  };

  const content = (() => {
    if (loading) return <p className="admin-loading">加载中…</p>;
    if (loadError || !request) {
      return (
        <section className="admin-panel">
          <p className="form-error">{loadError ? errText(loadError) : '请求不存在'}</p>
          <div className="review-actions">
            <Link className="btn btn-ghost btn-small" to="/admin?tab=requests">
              返回求收录
            </Link>
          </div>
        </section>
      );
    }

    return (
      <>
        {message && <p className="form-success">{message}</p>}
        {actionError ? <p className="form-error">{errText(actionError)}</p> : null}

        <section className="admin-panel review-request">
          <div className="admin-panel-head">
            <h3>求收录 #{request.id}</h3>
            <StatusPill status={request.status} labels={REQUEST_LABELS} />
          </div>
          <p className="review-request-text">「{request.text}」</p>
          <p className="review-meta-line">出处：{request.work_title || '未填写'}</p>
          {request.note && <p className="review-meta-line">备注：{request.note}</p>}
          <p className="review-meta-line">
            {request.nickname} · {formatDate(request.created_at)}
          </p>
        </section>

        {created ? (
          <section className="admin-panel review-success">
            <h3>{marked ? '已收录' : '台词已创建'}</h3>
            <p className="review-meta-line">
              {marked
                ? '台词已创建，求收录已标记为已收录。'
                : '台词已创建，但求收录状态更新失败，可重试标记。'}
            </p>
            <div className="review-actions">
              <a
                className="btn btn-primary btn-small"
                href={`/q/${created.slug}`}
                target="_blank"
                rel="noreferrer"
              >
                查看台词
              </a>
              {!marked && (
                <button
                  className="btn btn-ghost btn-small"
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void markCollected()}
                >
                  重试标记已收录
                </button>
              )}
              <Link className="btn btn-ghost btn-small" to="/admin?tab=requests">
                返回求收录
              </Link>
            </div>
          </section>
        ) : request.status !== 1 ? (
          <section className="admin-panel">
            <p className="review-meta-line">
              该请求已{request.status === 2 ? '收录' : '忽略'}，如需重新处理请恢复为待处理。
            </p>
            <div className="review-actions">
              <button
                className="btn btn-ghost btn-small"
                type="button"
                disabled={actionBusy}
                onClick={() => void markRequest(1, '恢复待处理')}
              >
                恢复待处理
              </button>
              <Link className="btn btn-ghost btn-small" to="/admin?tab=requests">
                返回求收录
              </Link>
            </div>
          </section>
        ) : (
          <div className="review-layout">
            <section className="admin-panel">
              <div className="admin-panel-head">
                <h3>第一步 · 选择作品</h3>
              </div>
              <form
                className="admin-filters review-work-search"
                onSubmit={(event) => {
                  event.preventDefault();
                  setSelectedWork(null);
                  void searchWorks(workQuery.trim());
                }}
              >
                <input
                  value={workQuery}
                  onChange={(event) => setWorkQuery(event.target.value)}
                  placeholder="搜片名、原名或 slug"
                />
                <button className="btn btn-ghost btn-small" type="submit" disabled={worksLoading}>
                  {worksLoading ? '搜索中…' : '搜索'}
                </button>
              </form>
              {workError && <p className="form-error">{workError}</p>}
              <div className="pick-quote-list">
                {workResults.map((work) => (
                  <button
                    key={work.id}
                    type="button"
                    className={`pick-quote${selectedWork?.id === work.id ? ' selected' : ''}`}
                    onClick={() => setSelectedWork(work)}
                  >
                    <span className="pick-quote-text">
                      《{work.title}》{work.year ? ` · ${work.year}` : ''}
                    </span>
                    <span className="pick-quote-meta">
                      {work.slug}
                      {selectedWork?.id === work.id ? ' · 已选' : ''}
                    </span>
                  </button>
                ))}
                {!worksLoading && workResults.length === 0 && (
                  <AdminEmpty>没有匹配作品，请在下方新建。</AdminEmpty>
                )}
              </div>
              {selectedWork && (
                <div className="pick-selected review-work-selected">
                  <span className="pick-quote-text">已选《{selectedWork.title}》</span>
                  <span className="pick-quote-meta">
                    状态：{selectedWork.status === 1 ? '已发布' : '未发布'}
                  </span>
                  {selectedWork.status !== 1 && (
                    <span className="field-error">该作品未发布，台词不会出现在公开页。</span>
                  )}
                </div>
              )}
              <details
                className="admin-bulk review-work-create"
                open={showWorkForm}
                onToggle={(event) => setShowWorkForm(event.currentTarget.open)}
              >
                <summary>新建作品</summary>
                <form className="form" onSubmit={submitWork}>
                  <label>
                    <span>片名</span>
                    <input
                      value={workForm.title}
                      onChange={(event) => setWorkForm({ ...workForm, title: event.target.value })}
                      required
                    />
                    {fieldError(workFormError, 'title') && (
                      <small className="field-error">{fieldError(workFormError, 'title')}</small>
                    )}
                  </label>
                  <label>
                    <span>slug</span>
                    <input
                      value={workForm.slug}
                      onChange={(event) => setWorkForm({ ...workForm, slug: event.target.value })}
                    />
                    <small className="hint">留空时按片名自动生成，如 kong-qiang</small>
                    {fieldError(workFormError, 'slug') && (
                      <small className="field-error">{fieldError(workFormError, 'slug')}</small>
                    )}
                  </label>
                  <label>
                    <span>年份</span>
                    <input
                      value={workForm.year}
                      onChange={(event) => setWorkForm({ ...workForm, year: event.target.value })}
                      inputMode="numeric"
                    />
                  </label>
                  <label>
                    <span>导演</span>
                    <input
                      value={workForm.director}
                      onChange={(event) =>
                        setWorkForm({ ...workForm, director: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>简介</span>
                    <textarea
                      value={workForm.synopsis}
                      onChange={(event) =>
                        setWorkForm({ ...workForm, synopsis: event.target.value })
                      }
                      rows={2}
                    />
                  </label>
                  <div className="form-actions">
                    <button className="btn btn-primary btn-small" type="submit" disabled={workBusy}>
                      {workBusy ? '创建中…' : '创建并选中'}
                    </button>
                  </div>
                </form>
              </details>
            </section>

            <form className="admin-form form" onSubmit={submitQuote}>
              <h3>第二步 · 创建台词</h3>
              {selectedWork ? (
                <div className="pick-selected">
                  <span className="pick-quote-text">《{selectedWork.title}》</span>
                  <span className="pick-quote-meta">{selectedWork.slug}</span>
                </div>
              ) : (
                <p className="meta-line">请先选择或新建作品。</p>
              )}
              <label>
                <span>台词 slug</span>
                <input
                  value={quoteForm.slug}
                  onChange={(event) => setQuoteForm({ ...quoteForm, slug: event.target.value })}
                  required
                />
                <small className="hint">台词的独立地址 /q/&lt;slug&gt;，与作品 slug 无关</small>
                {fieldError(quoteError, 'slug') && (
                  <small className="field-error">{fieldError(quoteError, 'slug')}</small>
                )}
              </label>
              <label>
                <span>台词（≤140 字）</span>
                <textarea
                  value={quoteForm.text}
                  onChange={(event) => setQuoteForm({ ...quoteForm, text: event.target.value })}
                  rows={3}
                  required
                />
                {fieldError(quoteError, 'text') && (
                  <small className="field-error">{fieldError(quoteError, 'text')}</small>
                )}
              </label>
              <label>
                <span>角色</span>
                <input
                  value={quoteForm.speaker}
                  onChange={(event) => setQuoteForm({ ...quoteForm, speaker: event.target.value })}
                />
              </label>
              <label>
                <span>场景说明</span>
                <textarea
                  value={quoteForm.context}
                  onChange={(event) => setQuoteForm({ ...quoteForm, context: event.target.value })}
                  rows={2}
                  required
                />
                {fieldError(quoteError, 'context') && (
                  <small className="field-error">{fieldError(quoteError, 'context')}</small>
                )}
              </label>
              <ThemePicker
                options={themeOptions}
                value={quoteForm.themes}
                onChange={(themes) => setQuoteForm({ ...quoteForm, themes })}
                error={fieldError(quoteError, 'themes') || themeLoadError || null}
              />
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={quoteForm.featured}
                  onChange={(event) =>
                    setQuoteForm({ ...quoteForm, featured: event.target.checked })
                  }
                />
                <span>首页精选</span>
              </label>
              <label>
                <span>状态</span>
                <select
                  value={quoteForm.status}
                  onChange={(event) =>
                    setQuoteForm({ ...quoteForm, status: Number(event.target.value) })
                  }
                >
                  <option value={0}>草稿</option>
                  <option value={1}>发布</option>
                </select>
              </label>
              {!!quoteError &&
                !fieldError(quoteError, 'slug') &&
                !fieldError(quoteError, 'text') && (
                  <p className="form-error">{errText(quoteError)}</p>
                )}
              <div className="form-actions">
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={quoteBusy || !selectedWork}
                >
                  {quoteBusy ? '创建中…' : '创建台词并标记已收录'}
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void markRequest(3, '忽略')}
                >
                  忽略请求
                </button>
              </div>
            </form>
          </div>
        )}
      </>
    );
  })();

  return (
    <div className="page admin-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">内容后台 · 求收录</p>
          <h1>审核收录</h1>
        </div>
        <div className="head-actions">
          <Link className="btn btn-ghost btn-small" to="/admin?tab=requests">
            返回求收录
          </Link>
        </div>
      </header>
      {content}
    </div>
  );
}
