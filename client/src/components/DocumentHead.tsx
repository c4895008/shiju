import { useEffect } from 'react';
import { useMatches } from 'react-router-dom';
import type { PageMeta } from '../api/types';

interface MatchData {
  meta?: PageMeta;
}

export function DocumentHead() {
  const matches = useMatches();
  const meta = [...matches]
    .reverse()
    .map((match) => (match.data as MatchData | undefined)?.meta)
    .find(Boolean);

  useEffect(() => {
    if (!meta) return;
    document.title = meta.title;
    const ensure = (name: string, content: string) => {
      let tag = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
      if (!tag) {
        tag = document.createElement('meta');
        tag.name = name;
        document.head.appendChild(tag);
      }
      tag.content = content;
    };
    ensure('description', meta.description);
    ensure('robots', meta.noindex ? 'noindex,follow' : 'index,follow');
  }, [meta]);

  return null;
}
