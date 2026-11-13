import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { apiGet, apiPut } from '../../api/client';
import type { AdminDailyPick as DailyPickData, AdminQuote, Paged } from '../../api/types';
import { AdminEmpty, errText, todayShanghai, truncateText } from './shared';

interface Choice {
  id: number;
  slug: string;
  text: string;
  speaker: string | null;
  work_title: string;
}

export function AdminDailyPick() {
  const [date, setDate] = useState(todayShanghai());
  const [pick, setPick] = useState<DailyPickData | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const [q, setQ] = useState('');
  const [results, setResults] = useState<AdminQuote[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const load = useCallback(async (value: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<DailyPickData>(`/admin/daily-picks/${value}`);
      setPick(data);
      setChoice(
        data.quote
          ? {
              id: data.quote.id,
              slug: data.quote.slug,
              text: data.quote.text,
              speaker: data.quote.speaker,
              work_title: data.quote.work_title,
            }
          : null,
      );
      setNote(data.note || '');
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (date) void load(date);
  }, [date, load]);

  const runSearch = async (term: string) => {
    setSearching(true);
    setSearchError('');
    try {
      const query = new URLSearchParams({ status: '1', page_size: '10' });
      if (term) query.set('q', term);
      const data = await apiGet<Paged<AdminQuote>>(`/admin/quotes?${query.toString()}`);
      setResults(data.items);
    } catch (err) {
      setSearchError(errText(err));
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    void runSearch('');
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!choice) {
      setFormError('请先选择一句台词');
      return;
    }
    setBusy(true);
    setFormError('');
    setMessage('');
    setError(null);
    try {
      await apiPut(`/admin/daily-picks/${date}`, {
        quote_id: choice.id,
        note: note.trim() || null,
      });
      setMessage('已更新今日一句（缓存已刷新）');
      await load(date);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="admin-section">
      <div className="admin-daily">
        <div className="admin-panel">
          <div className="admin-panel-head">
            <h3>选择日期</h3>
            <button
              className="btn btn-ghost btn-small"
              type="button"
              onClick={() => {
                setMessage('');
                setDate(todayShanghai());
              }}
            >
              今天
            </button>
          </div>
          <input
            className="admin-date"
            type="date"
            value={date}
            onChange={(event) => {
              setMessage('');
              setDate(event.target.value);
            }}
          />
          {loading ? (
            <p className="admin-loading">加载中…</p>
          ) : error ? (
            <p className="form-error">{errText(error)}</p>
          ) : pick?.quote ? (
            <>
              <p className="meta-line">当前已编排：</p>
              <p className="admin-daily-text">「{truncateText(pick.quote.text, 42)}」</p>
              <p className="meta-line">
                《{pick.quote.work_title}》{pick.note ? ` · ${pick.note}` : ''}
              </p>
            </>
          ) : (
            <p className="meta-line">该日期尚未手工编排，首页会按日期确定性回退挑选一句。</p>
          )}
        </div>

        <div className="admin-panel">
          <div className="admin-panel-head">
            <h3>选择台词</h3>
          </div>
          <form
            className="admin-filters"
            onSubmit={(event) => {
              event.preventDefault();
              void runSearch(q.trim());
            }}
          >
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="搜台词、作品或 slug"
            />
            <button className="btn btn-ghost btn-small" type="submit" disabled={searching}>
              {searching ? '搜索中…' : '搜索'}
            </button>
          </form>
          {searchError && <p className="form-error">{searchError}</p>}
          <div className="pick-quote-list">
            {results.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`pick-quote${choice?.id === item.id ? ' selected' : ''}`}
                onClick={() =>
                  setChoice({
                    id: item.id,
                    slug: item.slug,
                    text: item.text,
                    speaker: item.speaker,
                    work_title: item.work.title,
                  })
                }
              >
                <span className="pick-quote-text">「{truncateText(item.text, 32)}」</span>
                <span className="pick-quote-meta">
                  《{item.work.title}》
                  {item.speaker ? ` · ${item.speaker}` : ''}
                  {choice?.id === item.id ? ' · 已选' : ''}
                </span>
              </button>
            ))}
            {!searching && results.length === 0 && <AdminEmpty>没有找到已发布台词。</AdminEmpty>}
          </div>
        </div>
      </div>

      <form className="admin-form form" onSubmit={submit}>
        <h3>保存编排</h3>
        {message && <p className="form-success">{message}</p>}
        {error ? <p className="form-error">{errText(error)}</p> : null}
        <p className="meta-line">日期 {date} · 首页每日卡片</p>
        {choice ? (
          <div className="pick-selected">
            <span className="pick-quote-text">「{truncateText(choice.text, 36)}」</span>
            <span className="pick-quote-meta">
              《{choice.work_title}》
              {choice.speaker ? ` · ${choice.speaker}` : ''}
            </span>
          </div>
        ) : (
          <p className="meta-line">尚未选择台词。</p>
        )}
        <label>
          <span>备注（可选，≤200 字）</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            maxLength={200}
            placeholder="例如：今天的每日一句"
          />
        </label>
        {formError && <p className="form-error">{formError}</p>}
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={busy || !choice}>
            {busy ? '保存中…' : '保存今日一句'}
          </button>
        </div>
      </form>
    </section>
  );
}
