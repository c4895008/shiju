import { Link, useLoaderData } from 'react-router-dom';
import { ThemeCard } from '../components/ThemeCard';
import type { ThemesLoaderData } from '../loaders';

export function ThemesPage() {
  const { themes } = useLoaderData() as ThemesLoaderData;

  return (
    <div className="page themes-page">
      <header className="page-head themes-head">
        <div>
          <p className="eyebrow">主题</p>
          <h1>按主题浏览</h1>
          <p className="page-lead">
            从人生、爱情到离别、勇气，按你当下想找的心情，走进一组台词。
          </p>
        </div>
        <p className="page-count">{themes.length} 个主题</p>
      </header>

      {themes.length > 0 ? (
        <div className="theme-grid">
          {themes.map((theme) => (
            <ThemeCard key={theme.id} theme={theme} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>主题正在整理中</h2>
          <p>还没有可浏览的主题。先去首页看看今日一句，或者直接搜索你想找的台词。</p>
          <p className="empty-actions">
            <Link className="text-link" to="/">
              回首页
            </Link>
            <Link className="text-link" to="/search">
              搜索台词
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
