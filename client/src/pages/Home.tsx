import { Link, useLoaderData } from 'react-router-dom';
import type { HomeLoaderData } from '../loaders';
import { QuoteCard } from '../components/QuoteCard';
import { ThemeCard } from '../components/ThemeCard';

export function HomePage() {
  const { home } = useLoaderData() as HomeLoaderData;

  return (
    <div className="page home">
      <section className="hero">
        <p className="eyebrow">每句台词，一个页面</p>
        <h1 className="hero-title">把打动你的那句话，留下来。</h1>
        <p className="hero-desc">
          搜一句台词，写下你的感悟。公开的感悟会被同样记得这句话的人看见，也会攒成一本带得走的台词本。
        </p>
        <form className="hero-search" action="/search" method="get" role="search">
          <input type="search" name="q" placeholder="试试搜「希望」「阿甘」或「agzz」" aria-label="搜索台词" />
          <button type="submit" className="btn btn-primary">
            找一句
          </button>
        </form>
      </section>

      {home.daily ? (
        <section className="daily" id="daily">
          <div className="section-head">
            <h2>今日一句</h2>
            <span className="section-sub">{home.date}</span>
          </div>
          <Link to={`/q/${home.daily.slug}`} className="daily-card">
            <p className="daily-text">「{home.daily.text}」</p>
            <p className="daily-meta">
              {home.daily.speaker && <span>{home.daily.speaker}</span>}
              <span>
                《{home.daily.work.title}》{home.daily.work.year ? ` · ${home.daily.work.year}` : ''}
              </span>
            </p>
            {home.daily.context && <p className="daily-context">{home.daily.context}</p>}
            <span className="daily-cta">去看看这句话下的感悟 →</span>
          </Link>
        </section>
      ) : (
        <section className="empty-state">
          <h2>台词正在收录中</h2>
          <p>站里还没有发布台词。稍后再来，或先注册账号，等第一句出现时写下感悟。</p>
        </section>
      )}

      {home.featured.length > 0 && (
        <section>
          <div className="section-head">
            <h2>精选台词</h2>
            <span className="section-sub">编辑部挑的几句</span>
          </div>
          <div className="quote-grid">
            {home.featured.map((quote, index) => (
              <QuoteCard key={quote.id} quote={quote} index={index} />
            ))}
          </div>
        </section>
      )}

      {home.themes.length > 0 && (
        <section id="themes">
          <div className="section-head">
            <h2>按主题浏览</h2>
            <Link className="section-sub section-link" to="/themes">
              全部主题 →
            </Link>
          </div>
          <div className="theme-grid">
            {home.themes.map((theme) => (
              <ThemeCard key={theme.id} theme={theme} />
            ))}
          </div>
        </section>
      )}

      {home.latest.length > 0 && (
        <section id="latest">
          <div className="section-head">
            <h2>最近收录</h2>
            <span className="section-sub">新近发布的台词</span>
          </div>
          <div className="latest-list">
            {home.latest.map((quote) => (
              <Link key={quote.id} to={`/q/${quote.slug}`} className="latest-item">
                <span className="latest-text">「{quote.text}」</span>
                <span className="latest-meta">
                  {quote.work?.title}
                  {quote.speaker ? ` · ${quote.speaker}` : ''}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
