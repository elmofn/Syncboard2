import { useState } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'sb-theme';

export function getTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', t);
}

export function setTheme(t: Theme) {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* ignore */
  }
  applyTheme(t);
}

/** Aplica o tema salvo na inicialização. */
export function initTheme() {
  applyTheme(getTheme());
}

export function useTheme() {
  const [theme, setT] = useState<Theme>(getTheme());
  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setT(next);
  };
  return [theme, toggle] as const;
}
