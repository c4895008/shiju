import { useLoaderData } from 'react-router-dom';
import { QuoteCard } from '../components/QuoteCard';
import { Pagination } from '../components/Pagination';
import type { WorkLoaderData } from '../loaders';
import { NotFoundPage } from './Status';

export function WorkPage() {
  const data = useLoaderData() as WorkLoaderData;
  const work = data.work;
  const quotes = data.quotes;

  if (data.status === 404 || !work || !quotes) return <NotFoundPage />;

  return (
    <div className="page work-page">
      <header className="work-hero">
        <p className="eyebrow">作品</p>
        <h1>《{work.title}》</h1>
        {work.original_title && <p className="work-original">{work.original_title}</p>}
        <p className="work-meta">
          {work.year && <span>{work.year}</span>}
          {work.director && <span>导演：{work.director}</span>}
          {work.country && <span>{work.country}</span>}
          <span>{work.quote_count || quotes.total} 句台词</span>
        </p>
        {work.synopsis && <p className="work-synopsis">{work.synopsis}</p>}
      </header>

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
            makeHref={(page) => `/movie/${work.slug}${page > 1 ? `?page=${page}` : ''}`}
          />
        </>
      ) : (
        <div className="empty-state">
          <p>这部作品下的台词还在收录中。</p>
        </div>
      )}
    </div>
  );
}
