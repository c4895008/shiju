import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from '../api/client';
import type { MyReflection, QuoteDetailData } from '../api/types';
import { visibilityLabel } from '../lib/format';
import { makeIdempotencyKey } from '../lib/idempotency';
import { GonePage } from './Status';

const REFLECTION_MAX = 500;

export function WritePage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();

  const [quote, setQuote] = useState<QuoteDetailData | null>(null);
  const [existing, setExisting] = useState<MyReflection | null>(null);
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [gone, setGone] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(makeIdempotencyKey);

  const load = async () => {
    setLoading(true);
    setGone(false);
    try {
      const detail = await apiGet<QuoteDetailData>(`/quotes/${encodeURIComponent(slug)}`);
      if (detail.redirect) {
        navigate(detail.redirect, { replace: true });
        return;
      }
      setQuote(detail);
      const reflection = detail.my_reflection;
      setExisting(reflection);
      setBody(reflection ? reflection.body : '');
      setVisibility(reflection ? reflection.visibility : 0);
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) {
        setGone(true);
        return;
      }
      setError(err instanceof ApiError ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const changeBody = (value: string) => {
    setBody([...value].slice(0, REFLECTION_MAX).join(''));
    setIdempotencyKey(makeIdempotencyKey());
  };

  const changeVisibility = (value: number) => {
    setVisibility(value);
    setIdempotencyKey(makeIdempotencyKey());
  };

  const hidden = existing?.status === 2;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (hidden) return;
    if (!body.trim()) {
      setError('请写下你的感悟');
      return;
    }
    setBusy(true);
    try {
      if (existing) {
        await apiPut(`/reflections/${existing.id}`, { body });
        if (visibility !== existing.visibility) {
          await apiPut(`/reflections/${existing.id}/visibility`, { visibility });
        }
      } else {
        await apiPost(
          '/reflections',
          { quote_slug: slug, body, visibility },
          { 'Idempotency-Key': idempotencyKey },
        );
      }
      navigate(`/q/${slug}?saved=1`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setNotice('同句已有感悟，已为你载入，可以直接修改。');
        await load();
      } else {
        setError(err instanceof ApiError ? err.message : '保存失败，请稍后再试');
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    if (!window.confirm('删除后不可恢复，确定删除这条感悟吗？')) return;
    setBusy(true);
    setError('');
    try {
      await apiDelete(`/reflections/${existing.id}`);
      navigate(`/q/${slug}?deleted=1`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '删除失败，请稍后再试');
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="page status-page">
        <p className="meta-line">正在加载…</p>
      </div>
    );
  }

  if (gone) return <GonePage />;

  if (!quote) {
    return (
      <div className="page status-page">
        <p className="status-code">404</p>
        <h1>这句台词暂时打不开</h1>
        <p className="status-desc">{error || '页面不存在或已下架。'}</p>
        <Link className="text-link" to="/">
          回首页
        </Link>
      </div>
    );
  }

  return (
    <div className="page write-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">写感悟</p>
          <h1>{hidden ? '查看被隐藏的感悟' : existing ? '修改我的感悟' : '写下我的感悟'}</h1>
        </div>
      </header>

      <div className="write-quote">
        <Link to={`/q/${quote.quote.slug}`}>「{quote.quote.text}」</Link>
        <p className="meta-line">
          《{quote.work.title}》{quote.quote.speaker ? ` · ${quote.quote.speaker}` : ''}
        </p>
      </div>

      {notice && <p className="form-success">{notice}</p>}
      {hidden && (
        <p className="form-error">
          这条感悟已被管理员隐藏：不能编辑正文或切换可见性，可以删除后重新写。
        </p>
      )}
      {existing && !hidden && (
        <p className="hint">你在这句下已有一条感悟（{visibilityLabel(existing.visibility)}）。一句一感悟，保存会更新原内容。</p>
      )}

      <form className="form write-form" onSubmit={submit}>
        <label>
          <span>你的感悟</span>
          <textarea
            value={body}
            onChange={(event) => changeBody(event.target.value)}
            rows={8}
            readOnly={hidden}
            required
            placeholder="这句话让你想到什么？"
          />
          <small>{[...body].length}/{REFLECTION_MAX}</small>
        </label>

        <fieldset className="visibility-field">
          <legend>可见范围</legend>
          {[
            { value: 0, label: '私密', desc: '只有自己可见，会进入台词本与导出' },
            {
              value: 1,
              label: '好友',
              desc: '出现在互为读友的人的读友动态中，可被读友点赞；不出现在台词页公开列表',
            },
            { value: 2, label: '公开', desc: '出现在这句台词的公开感悟列表，可被点赞' },
          ].map((option) => (
            <label key={option.value} className="radio-card">
              <input
                type="radio"
                name="visibility"
                value={option.value}
                checked={visibility === option.value}
                disabled={hidden}
                onChange={() => changeVisibility(option.value)}
              />
              <span>
                <strong>{option.label}</strong>
                <small>{option.desc}</small>
              </span>
            </label>
          ))}
        </fieldset>

        {error && <p className="form-error">{error}</p>}

        <div className="form-actions">
          {!hidden && (
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? '保存中…' : existing ? '保存修改' : '发布感悟'}
            </button>
          )}
          {existing && (
            <button className="text-link danger" type="button" onClick={remove} disabled={busy}>
              删除感悟
            </button>
          )}
          <Link className="btn btn-ghost" to={`/q/${slug}`}>
            取消
          </Link>
        </div>
      </form>
    </div>
  );
}
