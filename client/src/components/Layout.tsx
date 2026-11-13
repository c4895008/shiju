import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { apiGet } from '../api/client';
import type { FriendsSummary } from '../api/types';
import { Avatar } from './Avatar';
import { DocumentHead } from './DocumentHead';

export function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [pendingFriends, setPendingFriends] = useState(0);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    if (!user) {
      setPendingFriends(0);
      return;
    }
    let cancelled = false;
    const load = () => {
      apiGet<FriendsSummary>('/friends/summary')
        .then((data) => {
          if (!cancelled) setPendingFriends(data.pending_count);
        })
        .catch(() => {});
    };
    load();
    window.addEventListener('shiju:friends', load);
    return () => {
      cancelled = true;
      window.removeEventListener('shiju:friends', load);
    };
  }, [user]);

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const q = String(data.get('q') || '').trim();
    navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
  };

  return (
    <>
      <DocumentHead />
      <header className="site-header">
        <div className="header-inner">
          <Link to="/" className="brand" aria-label="拾句首页">
            <span className="brand-mark">「</span>
            <span className="brand-name">拾句</span>
            <span className="brand-mark">」</span>
          </Link>

          <nav className="site-nav" aria-label="主导航">
            <NavLink to="/" end>
              首页
            </NavLink>
            <NavLink to="/themes">主题</NavLink>
            <Link to="/notebook">我的台词本</Link>
            <NavLink to="/friends">
              读友
              {pendingFriends > 0 && (
                <span className="nav-badge" aria-label={`${pendingFriends} 条待处理申请`}>
                  {pendingFriends > 99 ? '99+' : pendingFriends}
                </span>
              )}
            </NavLink>
          </nav>

          <form className="search-form" onSubmit={onSearch} role="search">
            <input type="search" name="q" placeholder="搜台词、影片、角色" aria-label="站内搜索" />
            <button type="submit" aria-label="搜索">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </form>

          <div className="account">
            {user ? (
              <>
                <Link className="account-user" to="/settings" aria-label="个人设置" title="个人设置">
                  <Avatar preset={user.avatar_preset} name={user.nickname} size={24} />
                  <span className="account-user-name">{user.nickname}</span>
                </Link>
                {user.role === 9 && (
                  <Link className="account-link" to="/admin">
                    后台
                  </Link>
                )}
                <button type="button" className="account-link" onClick={logout}>
                  退出
                </button>
              </>
            ) : (
              <>
                <Link className="account-link" to="/auth/login">
                  登录
                </Link>
                <Link className="btn btn-small" to="/auth/register">
                  注册
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="site-main">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="footer-inner">
          <p>拾句 · 每句台词一个页面，写下你的感悟。</p>
          <p className="footer-meta">单句节选，仅作学习与交流；版权归原作品所有。</p>
        </div>
      </footer>
    </>
  );
}
