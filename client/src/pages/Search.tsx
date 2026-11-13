import { useState, type FormEvent } from 'react';
import { useLoaderData, useNavigate } from 'react-router-dom';
import { QuoteCard } from '../components/QuoteCard';
import { QuoteRequestForm } from '../components/QuoteRequestForm';
import { Pagination } from '../components/Pagination';
import type { SearchLoaderData } from '../loaders';

export function SearchPage() {
  const data = useLoaderData() as SearchLoaderData;
  const navigate = useNavigate();
  const [q, setQ] = useState(data.q);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    navigate(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : '/search');
  };

  const result = data.result;

  return (
    <div className="page search-page">
      <header className="search-hero">
        <p className="eyebrow">站内搜索</p>
        <h1>{data.q ? `搜索「${data.q}」` : '找一句台词'}</h1>
        <form className="hero-search" onSubmit={submit} role="search">
          <input
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="台词、影片、角色，或拼音首字母"
            aria-label="搜索"
          />
          <button type="submit" className="btn btn-primary">
            搜索
          </button>
        </form>
        <p className="hint">支持中文、影片名、角色名与拼音，例如「阿甘」「agzz」「forrest」。</p>
      </header>

      {result && result.items.length > 0 && (
        <section>
          <p className="meta-line">找到 {result.total} 句</p>
          <div className="quote-grid is-full">
            {result.items.map((quote, index) => (
              <QuoteCard key={quote.id} quote={quote} index={index} />
            ))}
          </div>
          <Pagination
            page={result.page}
            hasMore={result.has_more}
            total={result.total}
            makeHref={(page) => `/search?q=${encodeURIComponent(data.q)}${page > 1 ? `&page=${page}` : ''}`}
          />
        </section>
      )}

      {data.q && result && result.items.length === 0 && (
        <section className="search-empty">
          <div className="empty-state">
            <h2>没找到这句</h2>
            <p>试试更短的关键词，或者换一个说法。也可以告诉我们你想找的那一句。</p>
          </div>
          <QuoteRequestForm />
        </section>
      )}

      {!data.q && (
        <section className="search-suggestions">
          <h2>试试这些</h2>
          <div className="chip-row">
            {['希望', '爱情', '离别', '勇气', '人生'].map((word) => (
              <button key={word} type="button" className="chip" onClick={() => navigate(`/search?q=${encodeURIComponent(word)}`)}>
                {word}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
