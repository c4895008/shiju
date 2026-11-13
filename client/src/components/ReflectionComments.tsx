import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, apiDelete, apiGet, apiPost } from '../api/client';
import type { Comment, Paged } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { formatDate, nextParam } from '../lib/format';
import { makeIdempotencyKey } from '../lib/idempotency';
import { Avatar } from './Avatar';

const COMMENT_MAX = 300;
const PAGE_SIZE = 10;

export function ReflectionComments({
  reflectionId,
  onCountChange,
}: {
  reflectionId: number;
  onCountChange: (count: number) => void;
}) {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const countChangeRef = useRef(onCountChange);

  useEffect(() => {
    countChangeRef.current = onCountChange;
  });

  const [items, setItems] = useState<Comment[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loginHref = `/auth/login?next=${encodeURIComponent(nextParam())}`;

  const load = useCallback(
    async (targetPage: number, append: boolean) => {
      setLoading(true);
      setError('');
      try {
        const data = await apiGet<Paged<Comment>>(
          `/reflections/${reflectionId}/comments?page=${targetPage}&page_size=${PAGE_SIZE}`,
        );
        setItems((prev) => (append ? [...prev, ...data.items] : data.items));
        setPage(data.page);
        setHasMore(data.has_more);
        countChangeRef.current(data.total);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : '评论加载失败，请稍后再试');
      } finally {
        setLoading(false);
      }
    },
    [reflectionId],
  );

  useEffect(() => {
    void load(1, false);
  }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const text = body.trim();
    if (!text) {
      setError('请写下评论');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = await apiPost<{ comment: Comment; comment_count: number }>(
        `/reflections/${reflectionId}/comments`,
        { body: text },
        { 'Idempotency-Key': makeIdempotencyKey() },
      );
      setItems((prev) => [data.comment, ...prev]);
      setBody('');
      countChangeRef.current(data.comment_count);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) navigate(loginHref);
      else setError(err instanceof ApiError ? err.message : '评论失败，请稍后再试');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item: Comment) => {
    if (!window.confirm('确定删除这条评论吗？')) return;
    setBusy(true);
    setError('');
    try {
      const data = await apiDelete<{ deleted: boolean; comment_count: number }>(
        `/reflections/${reflectionId}/comments/${item.id}`,
      );
      setItems((prev) => prev.filter((row) => row.id !== item.id));
      countChangeRef.current(data.comment_count);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) navigate(loginHref);
      else setError(err instanceof ApiError ? err.message : '删除失败，请稍后再试');
    } finally {
      setBusy(false);
    }
  };

  const length = [...body].length;

  return (
    <div className="comment-panel">
      {error && <p className="form-error">{error}</p>}

      {loading && items.length === 0 ? (
        <p className="comment-empty">评论加载中…</p>
      ) : !loading && items.length === 0 ? (
        <p className="comment-empty">这句话下还没有评论，来说两句吧。</p>
      ) : (
        <ul className="comment-list">
          {items.map((item) => (
            <li key={item.id} className="comment-item">
              <Avatar preset={item.author.avatar_preset} name={item.author.nickname} size={28} />
              <div className="comment-main">
                <div className="comment-head">
                  <span className="comment-author">{item.author.nickname}</span>
                  <span className="meta-line">{formatDate(item.created_at)}</span>
                  {item.can_delete && (
                    <button
                      type="button"
                      className="text-link danger"
                      disabled={busy}
                      onClick={() => void remove(item)}
                    >
                      删除
                    </button>
                  )}
                </div>
                <p className="comment-body">{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {hasMore && (
        <button
          type="button"
          className="comment-more"
          disabled={loading}
          onClick={() => void load(page + 1, true)}
        >
          {loading ? '加载中…' : '查看更早的评论'}
        </button>
      )}

      {!authLoading &&
        (user ? (
          <form className="form comment-form" onSubmit={submit}>
            <label>
              <span>我的评论</span>
              <textarea
                rows={3}
                value={body}
                placeholder="说说你的想法"
                onChange={(event) => setBody([...event.target.value].slice(0, COMMENT_MAX).join(''))}
              />
              <small>
                {length}/{COMMENT_MAX}
              </small>
            </label>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary btn-small" disabled={busy}>
                {busy ? '提交中…' : '发表评论'}
              </button>
            </div>
          </form>
        ) : (
          <p className="hint">
            登录后即可参与评论。<Link to={loginHref}>去登录</Link>
          </p>
        ))}
    </div>
  );
}
