import { redirect } from 'react-router-dom';
import { ApiError, apiGet } from './api/client';
import { truncate } from './ssr/meta';
import type {
  CacheHint,
  HomeData,
  PageMeta,
  Paged,
  PublicReflection,
  Quote,
  QuoteDetailData,
  ThemeDetailData,
  ThemeRef,
  ThemeStats,
  WorkRef,
} from './api/types';

export interface BaseLoader {
  meta: PageMeta;
  cache: CacheHint;
  status?: number;
}

export interface HomeLoaderData extends BaseLoader {
  home: HomeData;
}

export interface QuoteLoaderData extends BaseLoader {
  status: number;
  quote?: Quote;
  work?: WorkRef;
  themes?: ThemeRef[];
  reflections?: Paged<PublicReflection>;
  page: number;
}

export interface WorkLoaderData extends BaseLoader {
  status: number;
  work?: WorkRef;
  quotes?: Paged<Quote>;
  page: number;
}

export interface ThemeLoaderData extends BaseLoader {
  status: number;
  theme?: ThemeRef;
  stats?: ThemeStats;
  quotes?: Paged<Quote>;
  featured?: Quote[];
  topWorks?: ThemeDetailData['top_works'];
  relatedThemes?: ThemeRef[];
  page: number;
}

export interface ThemesLoaderData extends BaseLoader {
  themes: ThemeRef[];
}

export interface SettingsLoaderData {
  meta: PageMeta;
  cache: CacheHint;
}

export const settingsLoader = (): SettingsLoaderData => ({
  meta: {
    title: '设置 | 拾句',
    description: '管理你的头像、外观与密码。',
    noindex: true,
  },
  cache: { tags: [], ttl: 0 },
});

export interface SearchLoaderData extends BaseLoader {
  q: string;
  result?: Paged<Quote> & { query: string; normalized: string };
}

const notFoundMeta: PageMeta = {
  title: '页面不存在 | 拾句',
  description: '页面不存在或已下架，去首页看看别的台词。',
  noindex: true,
};

const goneMeta: PageMeta = {
  title: '台词已下架 | 拾句',
  description: '这句台词已永久下架。去首页看看别的台词，或搜索你想找的那一句。',
  noindex: true,
};

export const notFoundData = (status: 404 | 410) => ({
  status,
  meta: status === 410 ? goneMeta : notFoundMeta,
  cache: { tags: [], ttl: 60_000 },
});

const pageOf = (request: Request) => {
  const url = new URL(request.url);
  const page = Number.parseInt(url.searchParams.get('page') || '1', 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
};

export async function homeLoader(): Promise<HomeLoaderData> {
  const home = await apiGet<HomeData>('/home');
  return {
    home,
    meta: {
      title: '拾句 · 电影台词感悟本',
      description: '每句经典台词一个页面，写下你的感悟，攒成一本带得走的台词本。',
      canonical: '/',
      ogType: 'website',
    },
    cache: { tags: ['all', 'home', 'daily'], ttl: 60_000 },
  };
}

export async function quoteLoader({ params, request }: { params: Record<string, string | undefined>; request: Request }): Promise<QuoteLoaderData> {
  const slug = params.slug || '';
  const page = pageOf(request);

  let detail: QuoteDetailData;
  try {
    detail = await apiGet<QuoteDetailData>(`/quotes/${encodeURIComponent(slug)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 410) return { ...notFoundData(410), page };
    if (err instanceof ApiError && err.status === 404) return { ...notFoundData(404), page };
    throw err;
  }

  if (detail.redirect) throw redirect(detail.redirect);

  const reflections = await apiGet<Paged<PublicReflection>>(
    `/quotes/${encodeURIComponent(slug)}/reflections?page=${page}&page_size=10`,
  );
  const quote = detail.quote;
  const work = detail.work;

  return {
    status: 200,
    quote,
    work,
    themes: detail.themes,
    reflections,
    page,
    meta: {
      title: `「${truncate(quote.text, 18)}」台词 ·《${work.title}》| 拾句`,
      description: `${truncate(quote.text, 60)}${quote.speaker ? `——${quote.speaker}。` : ''}《${work.title}》经典台词，看看别人在这句话下写了什么。`,
      canonical: page > 1 ? undefined : `/q/${quote.slug}`,
      noindex: page > 1,
      ogType: 'article',
      jsonld: undefined,
    },
    cache: {
      tags: ['all', `quote:${quote.id}`, `work:${work.id}`, ...(detail.themes || []).map((t) => `theme:${t.id}`)],
      ttl: page > 1 ? 120_000 : 300_000,
    },
  };
}

export async function workLoader({ params, request }: { params: Record<string, string | undefined>; request: Request }): Promise<WorkLoaderData> {
  const slug = params.slug || '';
  const page = pageOf(request);
  let detail: { work: WorkRef; quotes: Paged<Quote> } | { redirect: string };
  try {
    detail = await apiGet(`/works/${encodeURIComponent(slug)}?page=${page}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return { ...notFoundData(404), page };
    throw err;
  }
  if ('redirect' in detail) throw redirect(detail.redirect);
  const { work, quotes } = detail;

  return {
    status: 200,
    work,
    quotes,
    page,
    meta: {
      title: `《${work.title}》经典台词（${work.quote_count || 0} 句）| 拾句`,
      description: `收录《${work.title}》${work.quote_count || 0} 句经典台词，含角色与场景说明，每句都可写下你的感悟。`,
      canonical: page > 1 ? undefined : `/movie/${work.slug}`,
      noindex: page > 1,
    },
    cache: { tags: ['all', `work:${work.id}`], ttl: 300_000 },
  };
}

export async function themesLoader(): Promise<ThemesLoaderData> {
  const data = await apiGet<{ items: ThemeRef[] }>('/themes');
  return {
    themes: data.items,
    meta: {
      title: '台词主题 · 按主题浏览经典台词 | 拾句',
      description: '按人生、爱情、离别、勇气等主题浏览经典电影台词，每句都能写下你的感悟。',
      canonical: '/themes',
    },
    cache: { tags: ['all', 'themes'], ttl: 600_000 },
  };
}

export async function themeLoader({ params, request }: { params: Record<string, string | undefined>; request: Request }): Promise<ThemeLoaderData> {
  const slug = params.slug || '';
  const page = pageOf(request);
  let detail: ThemeDetailData;
  try {
    detail = await apiGet(`/themes/${encodeURIComponent(slug)}?page=${page}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return { ...notFoundData(404), page };
    throw err;
  }
  if (detail.redirect) throw redirect(detail.redirect);
  const { theme, stats, quotes, featured, top_works, related_themes } = detail;

  return {
    status: 200,
    theme,
    stats,
    quotes,
    featured,
    topWorks: top_works,
    relatedThemes: related_themes,
    page,
    meta: {
      title: `${theme.name}主题台词精选 | 拾句`,
      description:
        theme.description ||
        `收录${stats.quotes}句${theme.name}主题的经典电影台词，来自${stats.works}部作品，每句都可写下你的感悟。`,
      canonical: page > 1 ? undefined : `/theme/${theme.slug}`,
      noindex: page > 1,
    },
    cache: { tags: ['all', 'themes', `theme:${theme.id}`], ttl: 300_000 },
  };
}

export async function searchLoader({ request }: { request: Request }): Promise<SearchLoaderData> {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  const page = pageOf(request);
  const result = q
    ? await apiGet<Paged<Quote> & { query: string; normalized: string }>(
        `/search?q=${encodeURIComponent(q)}&page=${page}`,
      )
    : undefined;

  return {
    q,
    result,
    meta: {
      title: q ? `搜索「${truncate(q, 16)}」| 拾句` : '搜索台词 | 拾句',
      description: '按台词、影片、角色或拼音搜索经典电影台词。',
      noindex: true,
    },
    cache: { tags: [], ttl: 120_000 },
  };
}

export type { QuoteDetailData };
