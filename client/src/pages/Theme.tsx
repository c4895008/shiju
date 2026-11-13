import { Link, useLoaderData } from 'react-router-dom';
import { Pagination } from '../components/Pagination';
import { QuoteCard } from '../components/QuoteCard';
import { ThemeCard } from '../components/ThemeCard';
import type { ThemeLoaderData } from '../loaders';
import { NotFoundPage } from './Status';

export function ThemePage() {
  const data = useLoaderData() as ThemeLoaderData;
  const { theme, stats, quotes, featured, topWorks, relatedThemes } = data;

  if (data.status === 404 || !theme || !stats || !quotes) return <NotFoundPage />;

  return (
    <div className="page theme-page">
      <nav className="breadcrumb" aria-label="面包屑">
        <Link to="/">首页</Link>
        <span aria-hidden="true">/</span>
        <Link to="/themes">主题</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{theme.name}</span>
      </nav>

      <header className="theme-hero">
        <p className="eyebrow">主题</p>
        <h1>{theme.name}</h1>
        <p className="theme-hero-desc">{theme.description || `与「${theme.name}」有关的电影台词。`}</p>
        <dl className="theme-stats">
          <div>
            <dt>台词</dt>
            <dd>{stats.quotes}</dd>
          </div>
          <div>
            <dt>作品</dt>
            <dd>{stats.works}</dd>
          </div>
          <div>
            <dt>公开感悟</dt>
            <dd>{stats.reflections}</dd>
          </div>
        </dl>
      </header>

      {featured && featured.length > 0 && (
        <section className="theme-featured">
          <div className="section-head">
            <h2>主题精选</h2>
            <span className="section-sub">编辑挑的几句</span>
          </div>
          <div className="quote-grid">
            {featured.map((quote, index) => (
              <QuoteCard key={quote.id} quote={quote} index={index} />
            ))}
          </div>
        </section>
      )}

      <section className="theme-quotes">
        <div className="section-head">
          <h2>{featured && featured.length > 0 ? '全部台词' : `「${theme.name}」台词`}</h2>
          <span className="section-sub">共 {quotes.total} 句</span>
        </div>

        {quotes.items.length > 0 ? (
          <>
            <div className="quote-grid">
              {quotes.items.map((quote, index) => (
                <QuoteCard key={quote.id} quote={quote} index={index} />
              ))}
            </div>
            <Pagination
              page={quotes.page}
              hasMore={quotes.has_more}
              total={quotes.total}
              makeHref={(page) => `/theme/${theme.slug}${page > 1 ? `?page=${page}` : ''}`}
            />
          </>
        ) : quotes.total > 0 ? (
          <div className="empty-state">
            <p>这一页没有台词。</p>
            <p className="empty-actions">
              <Link className="text-link" to={`/theme/${theme.slug}`}>
                回到第一页
              </Link>
            </p>
          </div>
        ) : (
          <div className="empty-state">
            <p>这个主题下还没有发布台词。</p>
            <p className="empty-actions">
              <Link className="text-link" to="/themes">
                看看其他主题
              </Link>
              <Link className="text-link" to="/search">
                搜索一句台词
              </Link>
            </p>
          </div>
        )}
      </section>

      {topWorks && topWorks.length > 0 && (
        <section className="theme-works">
          <div className="section-head">
            <h2>代表作品</h2>
            <span className="section-sub">这些电影里有「{theme.name}」</span>
          </div>
          <div className="work-links">
            {topWorks.map((work) => (
              <Link key={work.id} to={`/movie/${work.slug}`} className="work-link">
                <span className="work-link-title">《{work.title}》</span>
                <span className="work-link-meta">
                  {work.year ? `${work.year} · ` : ''}
                  {work.quote_count} 句
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {relatedThemes && relatedThemes.length > 0 && (
        <section className="theme-related">
          <div className="section-head">
            <h2>相关主题</h2>
            <span className="section-sub">经常一起出现</span>
          </div>
          <div className="theme-grid">
            {relatedThemes.map((item) => (
              <ThemeCard key={item.id} theme={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
