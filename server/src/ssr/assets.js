import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

let cachedTemplate = null;
let cachedMtime = 0;

function fixMarkers(html) {
  let out = html;
  if (!out.includes('<!--app-head-->')) {
    out = out.replace('</head>', '<meta name="ssr-head-marker" content=""><!--app-head--></head>');
  }
  if (!out.includes('<!--app-html-->')) {
    out = out.replace('<div id="root"></div>', '<div id="root"><!--app-html--></div>');
  }
  return out;
}

export async function loadTemplate(vite, url) {
  if (vite) {
    const raw = await fs.readFile(path.join(config.ssr.clientRoot, 'index.html'), 'utf8');
    return vite.transformIndexHtml(url, raw);
  }

  const file = path.join(config.ssr.clientDist, 'index.html');
  const stat = await fs.stat(file);
  if (!cachedTemplate || cachedMtime !== stat.mtimeMs) {
    cachedTemplate = fixMarkers(await fs.readFile(file, 'utf8'));
    cachedMtime = stat.mtimeMs;
  }
  return cachedTemplate;
}

export function injectHtml(template, { head = '', html = '', hydration = null }) {
  const hydrationScript = hydration
    ? `<script>window.__staticRouterHydrationData = JSON.parse(${JSON.stringify(
        JSON.stringify(hydration),
      ).replace(/</g, '\\u003c')})</script>`
    : '';

  return template
    .replace('<!--app-head-->', head ? `${head}` : '')
    .replace(/<title>[\s\S]*?<\/title>/, head ? '' : '<title>拾句 · 电影台词感悟本</title>')
    .replace('<!--app-html-->', `${html}${hydrationScript}`);
}
