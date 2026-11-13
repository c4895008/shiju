import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from '../api/client';
import type {
  FriendItem,
  FriendReflection,
  FriendRequestItem,
  FriendSearchItem,
  FriendUser,
  FriendsSummary,
  Paged,
} from '../api/types';
import { Avatar } from '../components/Avatar';
import { formatDate, visibilityLabel } from '../lib/format';

type Tab = 'feed' | 'friends' | 'requests';

interface RequestsData {
  incoming: FriendRequestItem[];
  outgoing: FriendRequestItem[];
  pending_count: number;
}

const TAB_LABEL: Record<Tab, string> = { feed: '动态', friends: '读友', requests: '申请' };

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

const notifyFriends = () => window.dispatchEvent(new Event('shiju:friends'));

export function FriendsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const tab: Tab = rawTab === 'friends' || rawTab === 'requests' ? rawTab : 'feed';

  const [summary, setSummary] = useState<FriendsSummary | null>(null);
  const [feed, setFeed] = useState<Paged<FriendReflection> | null>(null);
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [requests, setRequests] = useState<RequestsData | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FriendSearchItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedBusy, setFeedBusy] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([
      apiGet<FriendsSummary>('/friends/summary'),
      apiGet<{ items: FriendItem[] }>('/friends'),
      apiGet<RequestsData>('/friends/requests'),
      apiGet<Paged<FriendReflection>>('/friends/feed?page=1&page_size=20'),
    ])
      .then(([summaryData, friendData, requestData, feedData]) => {
        if (cancelled) return;
        setSummary(summaryData);
        setFriends(friendData.items);
        setRequests(requestData);
        setFeed(feedData);
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err, '加载失败'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setTab = (next: Tab) => {
    setSearchParams(next === 'feed' ? {} : { tab: next }, { replace: true });
  };

  const refreshLists = async () => {
    const [summaryData, friendData, requestData] = await Promise.all([
      apiGet<FriendsSummary>('/friends/summary'),
      apiGet<{ items: FriendItem[] }>('/friends'),
      apiGet<RequestsData>('/friends/requests'),
    ]);
    setSummary(summaryData);
    setFriends(friendData.items);
    setRequests(requestData);
    notifyFriends();
  };

  const reloadFeed = async () => {
    const data = await apiGet<Paged<FriendReflection>>('/friends/feed?page=1&page_size=20');
    setFeed(data);
  };

  const run = async (key: string, action: () => Promise<void>, fallback: string) => {
    if (busy) return;
    setBusy(key);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(errorText(err, fallback));
    } finally {
      setBusy(null);
    }
  };

  const loadMoreFeed = async () => {
    if (!feed || !feed.has_more || feedBusy) return;
    setFeedBusy(true);
    setError('');
    try {
      const data = await apiGet<Paged<FriendReflection>>(
        `/friends/feed?page=${feed.page + 1}&page_size=${feed.page_size}`,
      );
      setFeed({ ...data, items: [...feed.items, ...data.items] });
    } catch (err) {
      setError(errorText(err, '加载失败'));
    } finally {
      setFeedBusy(false);
    }
  };

  const sendRequest = async (target: FriendUser) => {
    await run(
      `send-${target.id}`,
      async () => {
        const result = await apiPost<{ request: { id: number; status: number }; auto_accepted: boolean }>(
          '/friends/requests',
          { user_id: target.id },
        );
        await refreshLists();
        if (result.auto_accepted) await reloadFeed();
        setSearchResults((prev) =>
          prev
            ? prev.map((row) =>
                row.id === target.id
                  ? {
                      ...row,
                      relation: result.auto_accepted ? 'friend' : 'pending_out',
                      request_id: result.auto_accepted ? null : result.request.id,
                    }
                  : row,
              )
            : prev,
        );
      },
      '发送申请失败',
    );
  };

  const cancelRequest = async (requestId: number) => {
    await run(
      `cancel-${requestId}`,
      async () => {
        await apiDelete(`/friends/requests/${requestId}`);
        await refreshLists();
        setSearchResults((prev) =>
          prev
            ? prev.map((row) =>
                row.request_id === requestId ? { ...row, relation: 'none', request_id: null } : row,
              )
            : prev,
        );
      },
      '撤回失败',
    );
  };

  const respond = async (requestId: number, action: 'accept' | 'reject') => {
    await run(
      `respond-${requestId}`,
      async () => {
        await apiPut(`/friends/requests/${requestId}`, { action });
        await refreshLists();
        await reloadFeed();
        setSearchResults((prev) =>
          prev
            ? prev.map((row) =>
                row.request_id === requestId
                  ? { ...row, relation: action === 'accept' ? 'friend' : 'none', request_id: null }
                  : row,
              )
            : prev,
        );
      },
      '处理申请失败',
    );
  };

  const remove = async (friend: FriendItem) => {
    if (!window.confirm(`确定移除读友「${friend.nickname}」吗？移除后将看不到对方的好友可见感悟。`)) return;
    await run(
      `remove-${friend.id}`,
      async () => {
        await apiDelete(`/friends/${friend.id}`);
        await refreshLists();
        await reloadFeed();
      },
      '移除失败',
    );
  };

  const toggleLike = async (item: FriendReflection) => {
    await run(
      `like-${item.id}`,
      async () => {
        const result = item.liked
          ? await apiDelete<{ liked: boolean; like_count: number }>(`/reflections/${item.id}/like`)
          : await apiPut<{ liked: boolean; like_count: number }>(`/reflections/${item.id}/like`);
        setFeed((prev) =>
          prev
            ? {
                ...prev,
                items: prev.items.map((row) =>
                  row.id === item.id ? { ...row, liked: result.liked, like_count: result.like_count } : row,
                ),
              }
            : prev,
        );
      },
      '点赞失败',
    );
  };

  const onSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    setError('');
    try {
      const data = await apiGet<{ items: FriendSearchItem[] }>(`/friends/search?q=${encodeURIComponent(q)}`);
      setSearchResults(data.items);
    } catch (err) {
      setError(errorText(err, '搜索失败'));
    } finally {
      setSearching(false);
    }
  };

  const renderSearchAction = (item: FriendSearchItem) => {
    if (item.relation === 'friend') return <span className="meta-line">已是读友</span>;
    if (item.relation === 'pending_out') {
      return (
        <>
          <span className="meta-line">已申请</span>
          <button
            className="text-link"
            type="button"
            disabled={busy !== null || !item.request_id}
            onClick={() => item.request_id && cancelRequest(item.request_id)}
          >
            撤回
          </button>
        </>
      );
    }
    if (item.relation === 'pending_in') {
      return (
        <>
          <button
            className="btn btn-small btn-primary"
            type="button"
            disabled={busy !== null || !item.request_id}
            onClick={() => item.request_id && respond(item.request_id, 'accept')}
          >
            接受
          </button>
          <button
            className="text-link"
            type="button"
            disabled={busy !== null || !item.request_id}
            onClick={() => item.request_id && respond(item.request_id, 'reject')}
          >
            拒绝
          </button>
        </>
      );
    }
    return (
      <button
        className="btn btn-small"
        type="button"
        disabled={busy !== null}
        onClick={() => sendRequest(item)}
      >
        加为读友
      </button>
    );
  };

  return (
    <div className="page friends-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">我的</p>
          <h1>读友</h1>
          <p className="meta-line">
            {summary ? `${summary.friend_count} 位读友 · ${summary.pending_count} 条待处理申请` : '正在加载…'}
          </p>
        </div>
        <div className="head-actions">
          <Link className="btn btn-ghost" to="/notebook">
            我的台词本
          </Link>
        </div>
      </header>

      <nav className="friend-tabs" aria-label="读友分区">
        {(['feed', 'friends', 'requests'] as Tab[]).map((item) => (
          <button
            key={item}
            type="button"
            className={item === tab ? 'active' : ''}
            onClick={() => setTab(item)}
          >
            {TAB_LABEL[item]}
            {item === 'requests' && summary && summary.pending_count > 0 && (
              <span className="nav-badge">{summary.pending_count > 99 ? '99+' : summary.pending_count}</span>
            )}
          </button>
        ))}
      </nav>

      {error && <p className="form-error">{error}</p>}
      {loading && !feed && <p className="meta-line">加载中…</p>}

      {tab === 'feed' && feed && (
        <section className="friend-panel">
          {feed.items.length === 0 ? (
            <div className="empty-state friend-empty">
              <h2>还没有读友动态</h2>
              <p>添加读友后，就能看到他们分享的好友与公开感悟。</p>
              <button className="btn btn-primary" type="button" onClick={() => setTab('friends')}>
                去添加读友
              </button>
            </div>
          ) : (
            <ul className="friend-feed">
              {feed.items.map((item) => (
                <li key={item.id} className="friend-feed-card">
                  <Avatar preset={item.author.avatar_preset} name={item.author.nickname} />
                  <div className="friend-feed-main">
                    <div className="friend-feed-head">
                      <span className="reflection-author">{item.author.nickname}</span>
                      <span className="meta-line">@{item.author.username}</span>
                      <span className="pill">{visibilityLabel(item.visibility)}</span>
                      <span className="meta-line">{formatDate(item.created_at)}</span>
                    </div>
                    <p className="reflection-body">{item.body}</p>
                    <p className="friend-feed-quote">
                      <Link to={`/q/${item.quote.slug}`}>「{item.quote.text}」</Link>
                      <span className="meta-line">
                        {' · '}
                        <Link to={`/movie/${item.work.slug}`}>《{item.work.title}》</Link>
                      </span>
                    </p>
                    <div className="friend-feed-actions">
                      <button
                        type="button"
                        className={`like-btn${item.liked ? ' liked' : ''}`}
                        onClick={() => toggleLike(item)}
                        disabled={busy === `like-${item.id}`}
                        aria-pressed={item.liked}
                      >
                        <span aria-hidden="true">♥</span> {item.like_count > 0 ? item.like_count : '赞'}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {feed.has_more && (
            <div className="center">
              <button className="btn btn-ghost" type="button" onClick={loadMoreFeed} disabled={feedBusy}>
                {feedBusy ? '加载中…' : '加载更多'}
              </button>
            </div>
          )}
        </section>
      )}

      {tab === 'friends' && (
        <section className="friend-panel">
          <form className="friend-search" onSubmit={onSearch} role="search">
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="输入昵称或用户名"
              aria-label="搜索读友"
            />
            <button className="btn btn-primary" type="submit" disabled={searching}>
              {searching ? '搜索中…' : '搜索'}
            </button>
          </form>

          {searchResults !== null && (
            <div className="friend-search-results">
              <div className="section-head">
                <h2>搜索结果</h2>
                <span className="section-sub">{searchResults.length} 位用户</span>
              </div>
              {searchResults.length === 0 ? (
                <p className="meta-line">没有找到匹配的用户。</p>
              ) : (
                <ul className="friend-list">
                  {searchResults.map((item) => (
                    <li key={item.id} className="friend-row">
                      <Avatar preset={item.avatar_preset} name={item.nickname} />
                      <div className="friend-row-main">
                        <span className="reflection-author">{item.nickname}</span>
                        <span className="meta-line">@{item.username}</span>
                      </div>
                      <div className="friend-row-actions">{renderSearchAction(item)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="section-head">
            <h2>我的读友</h2>
            <span className="section-sub">{friends.length} 位</span>
          </div>
          {friends.length === 0 ? (
            <div className="empty-state friend-empty">
              <p>还没有读友，搜索昵称或用户名，向对方发送申请。</p>
            </div>
          ) : (
            <ul className="friend-list">
              {friends.map((item) => (
                <li key={item.id} className="friend-row">
                  <Avatar preset={item.avatar_preset} name={item.nickname} />
                  <div className="friend-row-main">
                    <span className="reflection-author">{item.nickname}</span>
                    <span className="meta-line">
                      @{item.username} · {item.reflection_count} 条可见感悟
                      {item.since ? ` · ${formatDate(item.since)} 成为读友` : ''}
                    </span>
                  </div>
                  <div className="friend-row-actions">
                    <button
                      className="text-link danger"
                      type="button"
                      disabled={busy !== null}
                      onClick={() => remove(item)}
                    >
                      移除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'requests' && (
        <section className="friend-panel">
          <div className="section-head">
            <h2>收到的申请</h2>
            <span className="section-sub">{requests?.incoming.length ?? 0} 条</span>
          </div>
          {!requests || requests.incoming.length === 0 ? (
            <p className="meta-line">没有待处理的申请。</p>
          ) : (
            <ul className="friend-list">
              {requests.incoming.map((item) => (
                <li key={item.id} className="friend-row friend-request">
                  <Avatar preset={item.user.avatar_preset} name={item.user.nickname} />
                  <div className="friend-row-main">
                    <span className="reflection-author">{item.user.nickname}</span>
                    <span className="meta-line">
                      @{item.user.username} · {formatDate(item.created_at)} 申请
                    </span>
                  </div>
                  <div className="friend-row-actions">
                    <button
                      className="btn btn-small btn-primary"
                      type="button"
                      disabled={busy !== null}
                      onClick={() => respond(item.id, 'accept')}
                    >
                      接受
                    </button>
                    <button
                      className="text-link danger"
                      type="button"
                      disabled={busy !== null}
                      onClick={() => respond(item.id, 'reject')}
                    >
                      拒绝
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="section-head">
            <h2>发出的申请</h2>
            <span className="section-sub">{requests?.outgoing.length ?? 0} 条</span>
          </div>
          {!requests || requests.outgoing.length === 0 ? (
            <p className="meta-line">没有等待确认的申请。</p>
          ) : (
            <ul className="friend-list">
              {requests.outgoing.map((item) => (
                <li key={item.id} className="friend-row friend-request">
                  <Avatar preset={item.user.avatar_preset} name={item.user.nickname} />
                  <div className="friend-row-main">
                    <span className="reflection-author">{item.user.nickname}</span>
                    <span className="meta-line">
                      @{item.user.username} · {formatDate(item.created_at)} 申请
                    </span>
                  </div>
                  <div className="friend-row-actions">
                    <span className="meta-line">等待对方确认</span>
                    <button
                      className="text-link danger"
                      type="button"
                      disabled={busy !== null}
                      onClick={() => cancelRequest(item.id)}
                    >
                      撤回
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
