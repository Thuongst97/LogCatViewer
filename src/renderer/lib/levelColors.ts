import type { LogLevel } from '@shared/types';

/** CSS custom property name for a given log level — keeps every component reading colors
 *  from tokens.css instead of hardcoding hex values (see the ESLint rule in .eslintrc.cjs). */
export function levelColorVar(level: LogLevel): string {
  switch (level) {
    case 'V':
      return 'var(--level-v)';
    case 'D':
      return 'var(--level-d)';
    case 'I':
      return 'var(--level-i)';
    case 'W':
      return 'var(--level-w)';
    case 'E':
      return 'var(--level-e)';
    case 'F':
    case 'S':
      return 'var(--level-f)';
  }
}
