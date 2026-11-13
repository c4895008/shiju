import type { PageMeta } from '../api/types';

export const truncate = (value: string, length: number) =>
  [...value].length > length ? `${[...value].slice(0, length).join('')}…` : value;

const HTML_ESCAPES: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' };
const escapeHtml = (value: string) => value.replace(/[<>&"]/g, (ch) => HTML_ESCAPES[ch]);

export function headFromMeta(meta: PageMeta, base: string): string {
  const canonical = meta.canonical ? new URL(meta.canonical, base).toString() : null;
  const parts = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    meta.noindex ? '<meta name="robots" content="noindex,follow" />' : '<meta name="robots" content="index,follow" />',
    `<meta property="og:site_name" content="拾句" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:type" content="${meta.ogType || 'website'}" />`,
  ];
  if (canonical) {
    parts.push(`<link rel="canonical" href="${escapeHtml(canonical)}" />`);
    parts.push(`<meta property="og:url" content="${escapeHtml(canonical)}" />`);
  }
  if (meta.jsonld) {
    const json = JSON.stringify(meta.jsonld).replace(/</g, '\\u003c');
    parts.push(`<script type="application/ld+json">${json}</script>`);
  }
  return parts.join('\n');
}
