import type { ReactNode } from 'react';

/** Wraps query matches in a themed <mark> for the search bar's live in-view highlighting (plan §10). */
export function highlightText(text: string, query: string, regex: boolean, caseSensitive: boolean): ReactNode {
  if (!query) return text;
  let pattern: RegExp;
  try {
    pattern = new RegExp(`(${regex ? query : escapeRegExp(query)})`, caseSensitive ? 'g' : 'gi');
  } catch {
    return text; // invalid regex-in-progress while typing
  }
  const parts = text.split(pattern);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)', borderRadius: 2, padding: '0 1px' }}>
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
