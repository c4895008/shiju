const base = (process.env.SITE_URL || process.argv[2] || 'http://localhost:3001').replace(/\/$/, '');
const failures = [];

async function check(name, fn) {
  try {
    const detail = await fn();
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (err) {
    failures.push(`${name}: ${err.message}`);
    console.log(`  ✗ ${name} — ${err.message}`);
  }
}

const get = async (path) => {
  const res = await fetch(`${base}${path}`, { headers: { accept: 'text/html' } });
  return { res, text: await res.text() };
};

const textOf = (html, re) => {
  const match = re.exec(html);
  return match ? match[1].trim() : '';
};

const jsonldTypes = (html) => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  return blocks.flatMap((block) => {
    const data = JSON.parse(block[1]);
    const graph = Array.isArray(data['@graph']) ? data['@graph'] : [data];
    return graph.map((node) => node['@type']).filter(Boolean);
  });
};

function checkPage(name, html, { indexed = true, jsonld = false } = {}) {
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.test(html);
  if (!h1) throw new Error('缺少 <h1>');
  const title = textOf(html, /<title>([\s\S]*?)<\/title>/i);
  if (!title) throw new Error('缺少 <title>');
  if ([...title].length > 60) throw new Error(`title 超过 60 字符（${[...title].length}）`);
  const description = textOf(html, /<meta name="description" content="([^"]*)"/i);
  if (!description) throw new Error('缺少 meta description');
  const canonical = textOf(html, /<link rel="canonical" href="([^"]*)"/i);
  if (indexed && !/^https?:\/\//.test(canonical)) throw new Error('canonical 不是绝对 URL');
  const robots = textOf(html, /<meta name="robots" content="([^"]*)"/i);
  if (indexed && /noindex/i.test(robots)) throw new Error('公共页含 noindex');
  if (!indexed && !/noindex/i.test(robots) && !/noindex/i.test(html.slice(0, 2000))) {
    throw new Error(`${name} 缺少 noindex`);
  }
  if (jsonld) {
    const types = jsonldTypes(html);
    if (!types.length) throw new Error('缺少可解析的 JSON-LD');
    return `JSON-LD ${types.join(', ')}`;
  }
  return title;
}

async function main() {
  console.log(`[check:seo] 检查 ${base}`);

  const home = await get('/');
  await check('首页', async () => {
    if (home.res.status !== 200) throw new Error(`HTTP ${home.res.status}`);
    const type = home.res.headers.get('content-type') || '';
    if (!type.includes('text/html')) throw new Error(`Content-Type ${type}`);
    return checkPage('首页', home.text, { indexed: true, jsonld: true });
  });

  const quotes = await (await fetch(`${base}/api/quotes?page_size=3`)).json();
  for (const quote of quotes.data.items) {
    await check(`台词 /q/${quote.slug}`, async () => {
      const page = await get(`/q/${quote.slug}`);
      if (page.res.status !== 200) throw new Error(`HTTP ${page.res.status}`);
      return checkPage('台词页', page.text, { indexed: true, jsonld: true });
    });
  }

  const works = await (await fetch(`${base}/api/works?page_size=2`)).json();
  for (const work of works.data.items) {
    await check(`影片 /movie/${work.slug}`, async () => {
      const page = await get(`/movie/${work.slug}`);
      if (page.res.status !== 200) throw new Error(`HTTP ${page.res.status}`);
      return checkPage('影片页', page.text, { indexed: true });
    });
  }

  const themes = await (await fetch(`${base}/api/themes`)).json();

  await check('主题总览 /themes', async () => {
    const page = await get('/themes');
    if (page.res.status !== 200) throw new Error(`HTTP ${page.res.status}`);
    return checkPage('主题总览', page.text, { indexed: true, jsonld: true });
  });

  for (const theme of themes.data.items.slice(0, 2)) {
    await check(`主题 /theme/${theme.slug}`, async () => {
      const page = await get(`/theme/${theme.slug}`);
      if (page.res.status !== 200) throw new Error(`HTTP ${page.res.status}`);
      return checkPage('主题页', page.text, { indexed: true, jsonld: true });
    });
  }

  await check('搜索页 noindex', async () => {
    const page = await get('/search?q=%E6%B5%8B%E8%AF%95');
    if (page.res.status !== 200) throw new Error(`HTTP ${page.res.status}`);
    if (!/noindex/i.test(page.text)) throw new Error('搜索页缺少 noindex');
    return 'noindex';
  });

  await check('私有页 noindex', async () => {
    for (const path of ['/notebook', '/settings', '/friends']) {
      const res = await fetch(`${base}${path}`);
      const header = res.headers.get('x-robots-tag') || '';
      if (res.status !== 200) throw new Error(`${path} HTTP ${res.status}`);
      if (!/noindex/i.test(header)) throw new Error(`${path} 的 X-Robots-Tag 缺少 noindex`);
    }
    return 'X-Robots-Tag: noindex（/notebook、/settings、/friends）';
  });

  await check('sitemap.xml', async () => {
    const res = await fetch(`${base}/sitemap.xml`);
    const text = await res.text();
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    if (!text.includes('<urlset')) throw new Error('不是 urlset');
    if (!text.includes(`${base}/`)) throw new Error('缺少站内 URL');
    if (!text.includes(`${base}/themes`)) throw new Error('sitemap 缺少 /themes');
    return `${(text.match(/<url>/g) || []).length} 条 URL`;
  });

  if (failures.length) {
    console.error(`\n[check:seo] 失败 ${failures.length} 项：`);
    failures.forEach((line) => console.error(`  - ${line}`));
    process.exit(1);
  }
  console.log('\n[check:seo] 全部通过');
}

main().catch((err) => {
  console.error('[check:seo] 运行失败：', err);
  process.exit(1);
});
