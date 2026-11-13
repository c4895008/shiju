import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../src/config.js';
import { pool, withTransaction } from '../src/db/pool.js';
import { charLength, checkSlug } from '../src/validate.js';
import { quoteSourceKey, refreshQuoteSearch } from '../src/services/quotes.js';
import { bump } from '../src/ssr/cache.js';

const apply = process.argv.includes('--apply');
const seedDir = path.join(config.repoRoot, 'seed');

async function readJsonl(name) {
  const file = path.join(seedDir, name);
  const text = await fs.readFile(file, 'utf8');
  const rows = [];
  const errors = [];
  text.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      rows.push({ ...JSON.parse(trimmed), __line: index + 1 });
    } catch (err) {
      errors.push(`${name}:${index + 1} JSON 解析失败：${err.message}`);
    }
  });
  return { rows, errors, raw: text };
}

function report(name, row, reason) {
  return `${name}:${row.__line} ${reason}`;
}

async function main() {
  if (!apply) console.log('[seed] dry-run：只校验，不写库。加 --apply 才会写入。');

  const themesFile = await readJsonl('themes.jsonl');
  const worksFile = await readJsonl('works.jsonl');
  const quotesFile = await readJsonl('quotes.jsonl');

  const sha = crypto
    .createHash('sha256')
    .update(themesFile.raw)
    .update(worksFile.raw)
    .update(quotesFile.raw)
    .digest('hex');

  const [[existingBatch]] = await pool.query('SELECT id FROM seed_batch WHERE file_sha256 = ?', [sha]);
  if (existingBatch) {
    console.log(`[seed] 该批次已导入过（batch #${existingBatch.id}，sha256 ${sha.slice(0, 12)}…），无需重复执行。`);
    await pool.end();
    return;
  }

  const errors = [...themesFile.errors, ...worksFile.errors, ...quotesFile.errors];
  const stats = { inserted: 0, updated: 0, skipped: 0, invalid: 0 };
  const themeNames = new Set();
  const workSlugs = new Set();
  const seenQuoteKeys = new Set();

  const [dbThemes] = await pool.query('SELECT name FROM theme');
  dbThemes.forEach((row) => themeNames.add(row.name));
  const [dbWorks] = await pool.query('SELECT slug FROM work');
  dbWorks.forEach((row) => workSlugs.add(row.slug));

  // 预校验主题与作品
  for (const theme of themesFile.rows) {
    if (!theme.name || charLength(theme.name) > 30 || checkSlug(theme.slug)) {
      stats.invalid += 1;
      errors.push(report('themes.jsonl', theme, `主题字段不合法：${theme.name || '(空)'}`));
      continue;
    }
    themeNames.add(theme.name);
  }

  for (const work of worksFile.rows) {
    if (!work.title || checkSlug(work.slug)) {
      stats.invalid += 1;
      errors.push(report('works.jsonl', work, `作品字段不合法：${work.slug || '(空)'}`));
      continue;
    }
    workSlugs.add(work.slug);
  }

  // 逐行校验台词
  const validQuotes = [];
  for (const row of quotesFile.rows) {
    const work = row.work || {};
    const quote = row.quote || {};
    if (!workSlugs.has(work.slug)) {
      stats.invalid += 1;
      errors.push(report('quotes.jsonl', row, `未知作品 slug：${work.slug || '(空)'}`));
      continue;
    }
    if (!quote.text || charLength(quote.text) > 140) {
      stats.invalid += 1;
      errors.push(report('quotes.jsonl', row, '台词缺失或超过 140 字'));
      continue;
    }
    if (!quote.context || !quote.context.trim()) {
      stats.invalid += 1;
      errors.push(report('quotes.jsonl', row, '缺场景说明'));
      continue;
    }
    if (checkSlug(quote.slug)) {
      stats.invalid += 1;
      errors.push(report('quotes.jsonl', row, `台词 slug 不合法：${quote.slug || '(空)'}`));
      continue;
    }
    const themes = Array.isArray(quote.themes) ? quote.themes : [];
    if (themes.length > 3) {
      stats.invalid += 1;
      errors.push(report('quotes.jsonl', row, '主题超过 3 个'));
      continue;
    }
    const unknownTheme = themes.find((name) => !themeNames.has(name));
    if (unknownTheme) {
      stats.invalid += 1;
      errors.push(report('quotes.jsonl', row, `未知主题：${unknownTheme}`));
      continue;
    }
    if (quote.speaker && charLength(quote.speaker) > 60) {
      stats.invalid += 1;
      errors.push(report('quotes.jsonl', row, '角色名超过 60 字'));
      continue;
    }
    const key = quoteSourceKey(work.slug, quote.text);
    if (seenQuoteKeys.has(key)) {
      stats.skipped += 1;
      errors.push(report('quotes.jsonl', row, '同一文件内重复台词，已跳过'));
      continue;
    }
    seenQuoteKeys.add(key);
    validQuotes.push({ row, key, workSlug: work.slug, quote, themes });
  }

  const run = async (conn) => {
    const themeIds = new Map();
    for (const theme of themesFile.rows) {
      if (checkSlug(theme.slug) || !theme.name) continue;
      const [rows] = await conn.query('SELECT id FROM theme WHERE name = ?', [theme.name]);
      if (rows[0]) {
        themeIds.set(theme.name, rows[0].id);
        if (apply) {
          await conn.query(
            'UPDATE theme SET slug = ?, description = ?, sort_order = ?, status = 1 WHERE id = ?',
            [theme.slug, theme.description || null, Number(theme.sort_order) || 0, rows[0].id],
          );
        }
      } else if (apply) {
        const [res] = await conn.query(
          'INSERT INTO theme (slug, name, description, sort_order, status) VALUES (?, ?, ?, ?, 1)',
          [theme.slug, theme.name, theme.description || null, Number(theme.sort_order) || 0],
        );
        themeIds.set(theme.name, res.insertId);
      }
    }
    if (!apply) {
      const [rows] = await conn.query('SELECT id, name FROM theme');
      rows.forEach((r) => themeIds.set(r.name, r.id));
    }

    const workIds = new Map();
    for (const work of worksFile.rows) {
      if (checkSlug(work.slug) || !work.title) continue;
      const [rows] = await conn.query('SELECT id FROM work WHERE slug = ?', [work.slug]);
      if (rows[0]) {
        workIds.set(work.slug, rows[0].id);
        if (apply) {
          await conn.query(
            `UPDATE work SET title = ?, original_title = ?, year = ?, director = ?, country = ?,
                    synopsis = ?, status = 1 WHERE id = ?`,
            [
              work.title,
              work.original_title || null,
              work.year || null,
              work.director || null,
              work.country || null,
              work.synopsis || null,
              rows[0].id,
            ],
          );
        }
      } else if (apply) {
        const [res] = await conn.query(
          `INSERT INTO work (type, slug, title, original_title, year, director, country, synopsis, status)
           VALUES (1, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            work.slug,
            work.title,
            work.original_title || null,
            work.year || null,
            work.director || null,
            work.country || null,
            work.synopsis || null,
          ],
        );
        workIds.set(work.slug, res.insertId);
      }
    }
    if (!apply) {
      const [rows] = await conn.query('SELECT id, slug FROM work');
      rows.forEach((r) => workIds.set(r.slug, r.id));
      for (const work of worksFile.rows) {
        if (!workIds.has(work.slug) && !checkSlug(work.slug)) workIds.set(work.slug, `pending:${work.slug}`);
      }
    }

    for (const item of validQuotes) {
      const workId = workIds.get(item.workSlug);
      if (!workId) {
        stats.invalid += 1;
        errors.push(report('quotes.jsonl', item.row, '作品未能写入'));
        continue;
      }
      const [rows] = await conn.query('SELECT id, slug FROM quote WHERE source_key = ?', [item.key]);
      const [slugRows] = await conn.query('SELECT id, source_key FROM quote WHERE slug = ?', [item.quote.slug]);
      if (slugRows[0] && slugRows[0].source_key !== item.key) {
        stats.invalid += 1;
        errors.push(report('quotes.jsonl', item.row, `slug 已被其他台词占用：${item.quote.slug}`));
        continue;
      }

      if (rows[0]) {
        stats.updated += 1;
        if (apply) {
          await conn.query(
            `UPDATE quote SET work_id = ?, slug = ?, quote_text = ?, speaker = ?, context = ?,
                    featured = ?, status = 1, published_at = COALESCE(published_at, NOW(3))
              WHERE id = ?`,
            [
              workId,
              item.quote.slug,
              item.quote.text,
              item.quote.speaker || null,
              item.quote.context,
              item.quote.featured ? 1 : 0,
              rows[0].id,
            ],
          );
          await conn.query('DELETE FROM quote_theme WHERE quote_id = ?', [rows[0].id]);
          for (const name of item.themes) {
            await conn.query('INSERT INTO quote_theme (quote_id, theme_id) VALUES (?, ?)', [
              rows[0].id,
              themeIds.get(name),
            ]);
          }
          await refreshQuoteSearch(rows[0].id, conn);
        }
      } else {
        stats.inserted += 1;
        if (apply) {
          const [res] = await conn.query(
            `INSERT INTO quote (work_id, slug, quote_text, speaker, context, search_text, pinyin,
                                featured, status, source_key, published_at)
             VALUES (?, ?, ?, ?, ?, '', '', ?, 1, ?, NOW(3))`,
            [
              workId,
              item.quote.slug,
              item.quote.text,
              item.quote.speaker || null,
              item.quote.context,
              item.quote.featured ? 1 : 0,
              item.key,
            ],
          );
          for (const name of item.themes) {
            await conn.query('INSERT INTO quote_theme (quote_id, theme_id) VALUES (?, ?)', [
              res.insertId,
              themeIds.get(name),
            ]);
          }
          await refreshQuoteSearch(res.insertId, conn);
        }
      }
    }

    if (apply) {
      await conn.query(
        `UPDATE work SET quote_count = (SELECT COUNT(*) FROM quote WHERE work_id = work.id AND status = 1)`,
      );
      await conn.query(
        `INSERT INTO seed_batch (batch_name, file_sha256, total, inserted, updated, skipped, report)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          'seed-v1',
          sha,
          quotesFile.rows.length,
          stats.inserted,
          stats.updated,
          stats.skipped,
          JSON.stringify({ errors: errors.slice(0, 200) }),
        ],
      );
    }
  };

  if (apply) {
    await withTransaction(run);
    bump('all');
  } else {
    const conn = await pool.getConnection();
    try {
      await run(conn);
    } finally {
      conn.release();
    }
  }

  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    总行数: quotesFile.rows.length,
    新增: stats.inserted,
    更新: stats.updated,
    跳过: stats.skipped,
    不合格: stats.invalid,
  };
  console.log('[seed] 报告', summary);
  if (errors.length) {
    console.log(`[seed] 问题行 ${errors.length} 条：`);
    errors.slice(0, 50).forEach((line) => console.log(`  - ${line}`));
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error('[seed] 失败：', err);
  await pool.end().catch(() => {});
  process.exit(1);
});
