import { useEffect, useMemo, useState } from 'react';
import { Link, useLoaderData, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, apiDelete, apiGet, apiPut } from '../api/client';
import type { MyReflection, PublicReflection } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from '../components/Avatar';
import { Pagination } from '../components/Pagination';
import { ReflectionComments } from '../components/ReflectionComments';
import type { QuoteLoaderData } from '../loaders';
import { formatDate, visibilityLabel } from '../lib/format';
import { GonePage, NotFoundPage } from './Status';

interface MyState {
  reflection: MyReflection | null;
  liked_reflection_ids: number[];
}

export function QuotePage() {
  const data = useLoaderData() as QuoteLoaderData;
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [myState, setMyState] = useState<MyState | null>(null);
  const [likes, setLikes] = useState<Record<number, { liked: boolean; count: number }>>({});
  const [likeBusy, setLikeBusy] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [openComments, setOpenComments] = useState<Record<number, boolean>>({});
  const [commentCounts, setCommentCounts] = useState<Record<number, number>>({});

  const quote = data.quote;
  const work = data.work;

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const saved = params.get('saved');
    const deleted = params.get('deleted');
    if (!saved && !deleted) return;
    setNotice(deleted === '1' ? '感悟已删除。' : '感悟已保存。');
    params.delete('saved');
    params.delete('deleted');
    const search = params.toString();
    window.history.replaceState(null, '', `${location.pathname}${search ? `?${search}` : ''}${location.hash}`);
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    if (!user || !quote) {
      setMyState(null);
      setLikes({});
      return;
    }
    let cancelled = false;
    apiGet<MyState>(`/quotes/${encodeURIComponent(quote.slug)}/my-state`)
      .then((state) => {
        if (!cancelled) setMyState(state);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, quote]);

  const likedIds = useMemo(() => new Set(myState?.liked_reflection_ids || []), [myState]);
  const hiddenMine = myState?.reflection?.status === 2;

  if (data.status === 410) return <GonePage />;
  if (data.status === 404 || !quote || !work) return <NotFoundPage />;

  const loginHref = `/auth/login?next=${encodeURIComponent(location.pathname)}`;

  const toggleLike = async (item: PublicReflection) => {
    if (!user) {
      navigate(loginHref);
      return;
    }
    if (likeBusy === item.id) return;
    setLikeBusy(item.id);
    setActionError('');
    const current = likes[item.id] || { liked: likedIds.has(item.id), count: item.like_count };
    try {
      const result = current.liked
        ? await apiDelete<{ liked: boolean; like_count: number }>(`/reflections/${item.id}/like`)
        : await apiPut<{ liked: boolean; like_count: number }>(`/reflections/${item.id}/like`);
      setLikes((prev) => ({ ...prev, [item.id]: { liked: result.liked, count: result.like_count } }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) navigate(loginHref);
      else setActionError(err instanceof ApiError ? err.message : '操作失败，请稍后再试');
    } finally {
      setLikeBusy(null);
    }
  };

  return (
    <div className="page quote-page">
      {notice && <p className="form-success">{notice}</p>}
      <article className="quote-hero">
        <p className="eyebrow">
          <Link to={`/movie/${work.slug}`}>《{work.title}》</Link>
          {work.year ? ` · ${work.year}` : ''}
        </p>
        <h1 className="quote-title">「{quote.text}」</h1>
        <p className="quote-attribution">
          {quote.speaker && <span className="quote-speaker">— {quote.speaker}</span>}
          {work.director && <span>导演：{work.director}</span>}
        </p>
        {quote.context && <p className="quote-context">{quote.context}</p>}
        {data.themes && data.themes.length > 0 && (
          <p className="tag-row">
            {data.themes.map((theme) => (
              <Link key={theme.id} to={`/theme/${theme.slug}`} className="tag">
                {theme.name}
              </Link>
            ))}
          </p>
        )}
        <div className="quote-actions">
          <Link className="btn btn-primary" to={user ? `/q/${quote.slug}/write` : loginHref}>
            {myState?.reflection
              ? hiddenMine
                ? '查看隐藏的感悟'
                : '修改我的感悟'
              : '写下我的感悟'}
          </Link>
          {!user && <span className="hint">登录后可以写感悟、点赞</span>}
        </div>
      </article>

      {myState?.reflection && (
        <section className="my-card">
          <div className="my-card-head">
            <span className="my-card-label">我的感悟</span>
            <span className="pill">{hiddenMine ? '已隐藏' : visibilityLabel(myState.reflection.visibility)}</span>
            <span className="meta-line">{formatDate(myState.reflection.created_at)}</span>
            <Link className="text-link" to="/notebook">
              去台词本管理
            </Link>
          </div>
          <p className="my-card-body">{myState.reflection.body}</p>
          {hiddenMine && (
            <p className="hint">这条感悟已被管理员隐藏，公开列表与读友动态不再展示；可在写感悟页删除。</p>
          )}
        </section>
      )}

      <section className="reflections">
        <div className="section-head">
          <h2>大家怎么写</h2>
          <span className="section-sub">
            {data.reflections ? `共 ${data.reflections.total} 条公开感悟` : ''}
          </span>
        </div>

        {actionError && <p className="form-error">{actionError}</p>}

        {data.reflections && data.reflections.items.length > 0 ? (
          <ul className="reflection-list">
            {data.reflections.items.map((item) => {
              const state = likes[item.id] || { liked: likedIds.has(item.id), count: item.like_count };
              const commentsOpen = Boolean(openComments[item.id]);
              const commentCount = commentCounts[item.id] ?? item.comment_count;
              return (
                <li key={item.id} className="reflection-item">
                  <Avatar preset={item.author.avatar_preset} name={item.author.nickname} size={36} />
                  <div className="reflection-main">
                    <div className="reflection-head">
                      <span className="reflection-author">{item.author.nickname}</span>
                      <span className="meta-line">{formatDate(item.created_at)}</span>
                    </div>
                    <p className="reflection-body">{item.body}</p>
                    <div className="reflection-actions">
                      <button
                        type="button"
                        className={`like-btn${state.liked ? ' liked' : ''}`}
                        onClick={() => toggleLike(item)}
                        disabled={likeBusy === item.id}
                        aria-pressed={state.liked}
                      >
                        <span aria-hidden="true">♥</span> {state.count > 0 ? state.count : '赞'}
                      </button>
                      <button
                        type="button"
                        className={`comment-toggle${commentsOpen ? ' active' : ''}`}
                        aria-expanded={commentsOpen}
                        onClick={() => setOpenComments((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                      >
                        评论{commentCount > 0 ? ` ${commentCount}` : ''}
                      </button>
                    </div>
                    {commentsOpen && (
                      <ReflectionComments
                        reflectionId={item.id}
                        onCountChange={(count) => setCommentCounts((prev) => ({ ...prev, [item.id]: count }))}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="empty-state">
            <p>这句话下还没有公开感悟。</p>
            <Link className="text-link" to={user ? `/q/${quote.slug}/write` : loginHref}>
              做第一个写感悟的人 →
            </Link>
          </div>
        )}

        {data.reflections && (
          <Pagination
            page={data.reflections.page}
            hasMore={data.reflections.has_more}
            total={data.reflections.total}
            makeHref={(page) => `/q/${quote.slug}${page > 1 ? `?page=${page}` : ''}`}
          />
        )}
      </section>
    </div>
  );
}
