import { Link, useSearchParams } from 'react-router-dom';
import { AdminOverview } from './AdminOverview';
import { AdminQuotes } from './AdminQuotes';
import { AdminWorks } from './AdminWorks';
import { AdminThemes } from './AdminThemes';
import { AdminDailyPick } from './AdminDailyPick';
import { AdminReflections } from './AdminReflections';
import { AdminRequests } from './AdminRequests';
import { AdminStats } from './AdminStats';

const tabs = [
  { key: 'overview', label: '概览' },
  { key: 'quotes', label: '台词' },
  { key: 'works', label: '作品' },
  { key: 'themes', label: '主题' },
  { key: 'daily', label: '今日一句' },
  { key: 'reflections', label: '感悟' },
  { key: 'requests', label: '求收录' },
  { key: 'stats', label: '搜索报表' },
];

export function AdminPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab') || 'overview';
  const tab = tabs.some((item) => item.key === requested) ? requested : 'overview';

  const go = (key: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', key);
    setParams(next);
  };

  return (
    <div className="page admin-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">内容后台</p>
          <h1>拾句管理</h1>
        </div>
        <div className="head-actions">
          <Link className="btn btn-ghost btn-small" to="/">
            查看站点
          </Link>
        </div>
      </header>
      <nav className="admin-tabs">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            className={tab === item.key ? 'active' : ''}
            onClick={() => go(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {tab === 'overview' && <AdminOverview onTab={go} />}
      {tab === 'quotes' && <AdminQuotes />}
      {tab === 'works' && <AdminWorks />}
      {tab === 'themes' && <AdminThemes />}
      {tab === 'daily' && <AdminDailyPick />}
      {tab === 'reflections' && <AdminReflections />}
      {tab === 'requests' && <AdminRequests />}
      {tab === 'stats' && <AdminStats />}
    </div>
  );
}
