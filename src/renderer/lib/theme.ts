import type { EffectiveTheme } from '../state/uiStore';

/** Resolves the OS-level light/dark preference — used when ThemePreference is 'system'. */
export function getSystemTheme(): EffectiveTheme {
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light';
  return 'dark';
}
