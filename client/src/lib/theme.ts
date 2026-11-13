import { useSyncExternalStore } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'shiju_theme';
const THEME_COLOR = { light: '#fbfbfa', dark: '#141518' } as const;

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
const darkQuery = isBrowser ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function readPref(): ThemePref {
  if (!isBrowser) return 'system';
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

let pref = readPref();
const listeners = new Set<() => void>();

function resolveTheme(next: ThemePref): 'light' | 'dark' {
  if (next === 'system') return darkQuery?.matches ? 'dark' : 'light';
  return next;
}

function applyTheme() {
  if (!isBrowser) return;
  const mode = resolveTheme(pref);
  document.documentElement.dataset.theme = mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[mode]);
}

export function setThemePref(next: ThemePref) {
  if (next === pref) return;
  pref = next;
  if (isBrowser) {
    try {
      if (next === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // 存不下时只在本次会话生效
    }
  }
  applyTheme();
  listeners.forEach((fn) => fn());
}

if (isBrowser) {
  darkQuery?.addEventListener('change', () => {
    if (pref !== 'system') return;
    applyTheme();
    listeners.forEach((fn) => fn());
  });
  applyTheme();
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const useThemePref = () =>
  useSyncExternalStore(
    subscribe,
    () => pref,
    () => 'system' as ThemePref,
  );
