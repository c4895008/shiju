import type { Quote, ThemeRef, WorkRef } from '../api/types';

const base = (url: string) => url.replace(/\/$/, '');

export function websiteJsonld(siteUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        name: '拾句',
        url: siteUrl,
        inLanguage: 'zh-CN',
        potentialAction: {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: `${siteUrl}/search?q={search_term_string}` },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [{ '@type': 'ListItem', position: 1, name: '首页', item: siteUrl }],
      },
    ],
  };
}

export function themeIndexJsonld(siteUrl: string, themes: ThemeRef[]) {
  const root = base(siteUrl);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: '台词主题',
        url: `${root}/themes`,
        inLanguage: 'zh-CN',
        description: '按人生、爱情、离别、勇气等主题浏览经典电影台词。',
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: themes.length,
          itemListElement: themes.map((theme, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: theme.name,
            url: `${root}/theme/${theme.slug}`,
          })),
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '首页', item: `${root}/` },
          { '@type': 'ListItem', position: 2, name: '主题', item: `${root}/themes` },
        ],
      },
    ],
  };
}

export function themeJsonld(theme: ThemeRef, quotes: Quote[], siteUrl: string, page: number) {
  const root = base(siteUrl);
  const themeUrl = `${root}/theme/${theme.slug}`;
  const pageUrl = page > 1 ? `${themeUrl}?page=${page}` : themeUrl;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: `${theme.name}主题台词`,
        url: pageUrl,
        inLanguage: 'zh-CN',
        description: theme.description || `${theme.name}主题下的经典电影台词。`,
        about: { '@type': 'Thing', name: theme.name },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: quotes.length,
          itemListElement: quotes.map((quote, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: `「${quote.text}」`,
            url: `${root}/q/${quote.slug}`,
          })),
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '首页', item: `${root}/` },
          { '@type': 'ListItem', position: 2, name: '主题', item: `${root}/themes` },
          { '@type': 'ListItem', position: 3, name: theme.name, item: themeUrl },
        ],
      },
    ],
  };
}

export function quoteJsonld(quote: Quote, work: WorkRef, themes: ThemeRef[], siteUrl: string) {
  const url = `${base(siteUrl)}/q/${quote.slug}`;
  const graph: Record<string, unknown>[] = [
    {
      '@type': 'Quotation',
      text: quote.text,
      inLanguage: 'zh-CN',
      spokenByCharacter: quote.speaker ? { '@type': 'Person', name: quote.speaker } : undefined,
      isBasedOn: { '@type': 'Movie', name: work.title, dateCreated: work.year ? String(work.year) : undefined },
      about: themes.length ? themes.map((t) => ({ '@type': 'Thing', name: t.name })) : undefined,
      mainEntityOfPage: url,
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首页', item: `${base(siteUrl)}/` },
        { '@type': 'ListItem', position: 2, name: `《${work.title}》`, item: `${base(siteUrl)}/movie/${work.slug}` },
        { '@type': 'ListItem', position: 3, name: '台词' },
      ],
    },
  ];
  return { '@context': 'https://schema.org', '@graph': graph };
}
