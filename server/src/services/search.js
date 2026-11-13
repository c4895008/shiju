import crypto from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db/pool.js';

export function hashIp(ip) {
  return crypto
    .createHash('sha256')
    .update(`${ip || ''}${config.ipHashSalt}`)
    .digest('hex')
    .slice(0, 32);
}

export async function logSearch({ query, normalized, resultCount, userId, ip }) {
  try {
    await pool.query(
      `INSERT INTO search_log (query, normalized, result_count, user_id, ip_hash)
       VALUES (?, ?, ?, ?, ?)`,
      [query, normalized, resultCount, userId || null, hashIp(ip)],
    );
  } catch (err) {
    console.error('[search_log] 写入失败', err.code || err.message);
  }
}

export async function searchStats(days = 30) {
  const window = Math.min(180, Math.max(1, Number(days) || 30));
  const [[summary]] = await pool.query(
    `SELECT COUNT(*) AS total, COALESCE(SUM(result_count = 0), 0) AS zero_total
       FROM search_log
      WHERE created_at >= NOW() - INTERVAL ? DAY`,
    [window],
  );
  const [zeroRows] = await pool.query(
    `SELECT normalized, COUNT(*) AS times
       FROM search_log
      WHERE result_count = 0 AND created_at >= NOW() - INTERVAL ? DAY
      GROUP BY normalized
      ORDER BY times DESC, normalized
      LIMIT 100`,
    [window],
  );
  const [topRows] = await pool.query(
    `SELECT normalized, COUNT(*) AS times, MAX(result_count) AS max_results
       FROM search_log
      WHERE created_at >= NOW() - INTERVAL ? DAY
      GROUP BY normalized
      ORDER BY times DESC, normalized
      LIMIT 100`,
    [window],
  );
  return {
    days: window,
    total: Number(summary.total),
    zero_total: Number(summary.zero_total),
    zero_results: zeroRows.map((r) => ({ term: r.normalized, times: Number(r.times) })),
    top_terms: topRows.map((r) => ({
      term: r.normalized,
      times: Number(r.times),
      max_results: Number(r.max_results),
    })),
  };
}
