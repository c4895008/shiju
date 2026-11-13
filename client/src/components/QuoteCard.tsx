import { Link } from 'react-router-dom';
import type { Quote } from '../api/types';

export function QuoteCard({ quote, index }: { quote: Quote; index?: number }) {
  return (
    <article className="quote-card">
      <Link to={`/q/${quote.slug}`} className="quote-card-link">
        <p className="quote-card-text">「{quote.text}」</p>
      </Link>
      <p className="quote-card-meta">
        {quote.work && <span>《{quote.work.title}》</span>}
        {quote.speaker && <span>{quote.speaker}</span>}
        {typeof index === 'number' && <span className="quote-card-index">{String(index + 1).padStart(2, '0')}</span>}
      </p>
      {quote.themes && quote.themes.length > 0 && (
        <p className="tag-row">
          {quote.themes.map((theme) => (
            <Link key={theme.id} to={`/theme/${theme.slug}`} className="tag">
              {theme.name}
            </Link>
          ))}
        </p>
      )}
    </article>
  );
}
