import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router-dom';
import { renderToString } from 'react-dom/server';
import { AuthProvider } from './auth/AuthContext';
import { routes } from './routes';
import { quoteJsonld, themeIndexJsonld, themeJsonld, websiteJsonld } from './ssr/jsonld';
import { headFromMeta } from './ssr/meta';
import type { PageMeta, Quote, ThemeRef, WorkRef } from './api/types';
import type { HomeLoaderData, QuoteLoaderData } from './loaders';

const handler = createStaticHandler(routes);

interface LoaderShape {
  meta?: PageMeta;
  cache?: { tags: string[]; ttl: number };
  status?: number;
  redirect?: string;
  quote?: Quote;
  work?: WorkRef;
  themes?: ThemeRef[];
  theme?: ThemeRef;
  quotes?: { items: Quote[] };
  page?: number;
}

export interface SsrResult {
  html?: string;
  head?: string;
  status: number;
  redirect?: string;
  hydration?: { loaderData: Record<string, unknown>; errors?: Record<string, unknown> };
  tags?: string[];
  ttl?: number;
}

const serializeErrors = (errors: unknown) => {
  if (!errors) return undefined;
  const source = errors as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [
      key,
      value instanceof Error ? { message: value.message } : value,
    ]),
  );
};

export async function render(request: Request): Promise<SsrResult> {
  const context = await handler.query(request);
  if (context instanceof Response) {
    return { status: context.status || 302, redirect: context.headers.get('location') || '/' };
  }

  const router = createStaticRouter(routes, context);
  const html = renderToString(
    <AuthProvider>
      <StaticRouterProvider router={router} context={context} hydrate={false} />
    </AuthProvider>,
  );

  const leaf = [...context.matches].reverse().find((match) => match.route.id !== 'root');
  const data = leaf ? (context.loaderData[leaf.route.id] as LoaderShape | undefined) : undefined;
  if (data?.redirect) return { status: 301, redirect: data.redirect };

  const base = new URL(request.url).origin;
  const routeId = leaf?.route.id;

  let meta: PageMeta | undefined = data?.meta;
  if (routeId === 'notfound') {
    meta = {
      title: '页面不存在 | 拾句',
      description: '页面不存在或已下架，去首页看看别的台词。',
      noindex: true,
    };
  }

  if (meta && routeId === 'home' && (data as HomeLoaderData | undefined)?.home) {
    meta = { ...meta, jsonld: websiteJsonld(base) };
  }
  if (meta && routeId === 'quote' && data?.quote && data.work) {
    meta = {
      ...meta,
      jsonld: quoteJsonld(data.quote, data.work, data.themes || [], base),
    };
  }
  if (meta && routeId === 'themes' && data?.themes) {
    meta = { ...meta, jsonld: themeIndexJsonld(base, data.themes) };
  }
  if (meta && routeId === 'theme' && data?.theme && data.quotes) {
    meta = { ...meta, jsonld: themeJsonld(data.theme, data.quotes.items, base, data.page || 1) };
  }

  const status = data?.status ?? (routeId === 'notfound' ? 404 : 200);

  return {
    html,
    head: meta ? headFromMeta(meta, base) : '',
    status,
    hydration: {
      loaderData: context.loaderData as Record<string, unknown>,
      errors: serializeErrors(context.errors),
    },
    tags: routeId === 'notfound' ? [] : data?.cache?.tags,
    ttl: routeId === 'notfound' ? 60_000 : data?.cache?.ttl,
  };
}

export type { QuoteLoaderData };
