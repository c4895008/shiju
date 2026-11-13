import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { VISIBILITY_LABEL } from './reflections.js';

const shanghaiDate = (value) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));

const stamp = () => shanghaiDate(new Date()).replaceAll('-', '');

const url = (slug) => `${config.siteUrl}/q/${slug}`;

const indent = (body) =>
  body
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');

const EXPORT_SQL = `
  SELECT r.id, r.body, r.visibility, r.created_at,
         q.slug AS quote_slug, q.quote_text, q.speaker, q.context,
         w.id AS work_id, w.title AS work_title
    FROM reflection r
    JOIN quote q ON q.id = r.quote_id
    JOIN work w ON w.id = q.work_id
   WHERE r.user_id = ? AND r.status = 1
   ORDER BY w.title COLLATE utf8mb4_unicode_ci, r.created_at DESC, r.id DESC
   LIMIT ? OFFSET ?`;

function workHeader(format, title, count) {
  return format === 'md' ? `## 《${title}》（${count} 条）\n\n` : `【${title}】（${count} 条）\n\n`;
}

function renderRow(format, row) {
  const meta = [row.speaker ? `— ${row.speaker}` : null, row.context ? `场景：${row.context}` : null]
    .filter(Boolean)
    .join(' · ');

  if (format === 'md') {
    return [
      `### 「${row.quote_text}」`,
      meta,
      '',
      `- ${shanghaiDate(row.created_at)} · ${VISIBILITY_LABEL[row.visibility]}`,
      indent(row.body),
      '',
      `[查看这句](${url(row.quote_slug)})`,
      '',
    ]
      .filter((line) => line !== null)
      .join('\n');
  }

  return [
    `「${row.quote_text}」`,
    meta ? meta.replace(/^— /, '— ') : '',
    `  ${shanghaiDate(row.created_at)} · ${VISIBILITY_LABEL[row.visibility]}`,
    indent(row.body),
    `  ${url(row.quote_slug)}`,
    '',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

export async function exportNotebook(user, format, res) {
  const ext = format === 'md' ? 'md' : 'txt';
  const type = format === 'md' ? 'text/markdown' : 'text/plain';
  const dateLabel = shanghaiDate(new Date());

  res.status(200);
  res.setHeader('Content-Type', `${type}; charset=utf-8`);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="shiju-notebook-${stamp()}.${ext}"; filename*=UTF-8''${encodeURIComponent(
      `拾句-台词本-${stamp()}.${ext}`,
    )}`,
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');

  const [[{ total }]] = await pool.query(
    'SELECT COUNT(*) AS total FROM reflection WHERE user_id = ? AND status = 1',
    [user.id],
  );

  let bytes = 0;
  const write = (chunk) => {
    bytes += Buffer.byteLength(chunk, 'utf8');
    res.write(chunk);
  };

  write('\uFEFF');
  write(
    format === 'md'
      ? `# 我的台词本\n\n> 导出于 ${dateLabel} · 共 ${total} 条 · 拾句\n\n`
      : `我的台词本\n导出于 ${dateLabel} · 共 ${total} 条 · 拾句\n\n`,
  );

  let offset = 0;
  let group = null;
  for (;;) {
    const [rows] = await pool.query(EXPORT_SQL, [user.id, 200, offset]);
    for (const row of rows) {
      if (!group || group.workId !== row.work_id) {
        const [[{ count }]] = await pool.query(
          'SELECT COUNT(*) AS count FROM reflection WHERE user_id = ? AND status = 1 AND quote_id IN (SELECT id FROM quote WHERE work_id = ?)',
          [user.id, row.work_id],
        );
        group = { workId: row.work_id, count: Number(count) };
        write(workHeader(format, row.work_title, group.count));
      }
      write(renderRow(format, row));
    }
    if (rows.length < 200) break;
    offset += 200;
  }

  await pool.query(
    'INSERT INTO export_log (user_id, format, reflection_count, bytes) VALUES (?, ?, ?, ?)',
    [user.id, format === 'md' ? 2 : 1, Number(total), bytes],
  );

  res.end();
}
