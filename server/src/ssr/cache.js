import crypto from 'node:crypto';
import { config } from '../config.js';

const stamps = new Map();
const entries = new Map();
const stats = { hits: 0, stale: 0, misses: 0, invalidations: 0 };

export function bump(...tags) {
  for (const tag of tags.filter(Boolean)) {
    stamps.set(tag, (stamps.get(tag) ?? 0) + 1);
  }
  stats.invalidations += 1;
}

const snapshot = (tags) => Object.fromEntries(tags.map((tag) => [tag, stamps.get(tag) ?? 0]));

export function lookup(key, now = Date.now()) {
  const entry = entries.get(key);
  if (!entry) {
    stats.misses += 1;
    return null;
  }
  for (const [tag, version] of Object.entries(entry.seen)) {
    if ((stamps.get(tag) ?? 0) !== version) {
      entries.delete(key);
      stats.misses += 1;
      return null;
    }
  }
  if (now > entry.staleUntil) {
    entries.delete(key);
    stats.misses += 1;
    return null;
  }
  entries.delete(key);
  entries.set(key, entry);
  if (now <= entry.freshUntil) {
    stats.hits += 1;
    return { status: 'fresh', entry };
  }
  stats.stale += 1;
  return { status: 'stale', entry };
}

export function store(key, { html, tags, ttlMs, staleMs = 30_000 }) {
  const now = Date.now();
  const entry = {
    html,
    etag: `"${crypto.createHash('sha1').update(html).digest('hex').slice(0, 32)}"`,
    tags,
    seen: snapshot(tags),
    storedAt: now,
    freshUntil: now + ttlMs,
    staleUntil: now + ttlMs + staleMs,
  };
  entries.delete(key);
  entries.set(key, entry);
  while (entries.size > config.ssr.cacheMax) {
    entries.delete(entries.keys().next().value);
  }
  return entry;
}

export function peek(key) {
  return entries.get(key) || null;
}

export function statsSnapshot() {
  return {
    size: entries.size,
    max: config.ssr.cacheMax,
    hits: stats.hits,
    stale_hits: stats.stale,
    misses: stats.misses,
    invalidations: stats.invalidations,
    stamps: Object.fromEntries(stamps),
  };
}

export function clearCache() {
  entries.clear();
  stats.hits = 0;
  stats.stale = 0;
  stats.misses = 0;
}
