import { Link } from 'react-router-dom';
import type { ThemeRef } from '../api/types';

export function ThemeCard({ theme }: { theme: ThemeRef }) {
  return (
    <Link to={`/theme/${theme.slug}`} className="theme-card">
      <span className="theme-name">{theme.name}</span>
      <span className="theme-count">
        {theme.quote_count ?? 0} 句
        {typeof theme.work_count === 'number' ? ` · ${theme.work_count} 部作品` : ''}
      </span>
      {theme.description && <span className="theme-desc">{theme.description}</span>}
    </Link>
  );
}
