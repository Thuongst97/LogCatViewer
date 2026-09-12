// Filter combination logic — see IMPLEMENTATION_PLAN.md §9.
// A positive filter includes; a negative filter excludes; a marker filter
// never hides anything. Any non-negative filter that matches also lends its
// configured color to the row — a positive filter isn't just an include
// rule, it's also how you tell the table "and paint matches like *this*".
import { LOG_LEVEL_RANK, type Filter, type LogEntry } from '@shared/types';

export interface CompiledFilters {
  /** true if `entry` should be visible given the current active filter set. */
  isVisible(entry: LogEntry): boolean;
  /** highlight color for `entry` from the first matching active positive/marker filter, or null. */
  rowColor(entry: LogEntry): string | null;
}

const PASSTHROUGH: CompiledFilters = { isVisible: () => true, rowColor: () => null };

/**
 * `enabled` is the master "Filters Applied" toggle (plan follow-up, mirrors DLT Viewer's
 * "Filters Enabled" checkbox): when off, every saved filter is bypassed entirely — every
 * line shows, unfiltered and uncolored — regardless of each filter's own active state.
 */
export function compileFilters(filters: Filter[], enabled = true): CompiledFilters {
  if (!enabled) return PASSTHROUGH;

  const active = filters.filter((f) => f.active);
  const positives = active.filter((f) => f.type === 'positive');
  const negatives = active.filter((f) => f.type === 'negative');
  const colorable = active.filter((f) => f.type !== 'negative');

  return {
    isVisible(entry: LogEntry): boolean {
      if (negatives.some((f) => matchesFilter(f, entry))) return false;
      if (positives.length === 0) return true;
      return positives.some((f) => matchesFilter(f, entry));
    },
    rowColor(entry: LogEntry): string | null {
      const hit = colorable.find((f) => matchesFilter(f, entry));
      return hit ? hit.color : null;
    }
  };
}

export function matchesFilter(filter: Filter, entry: LogEntry): boolean {
  if (filter.tag.enabled && !fieldEquals(filter.tag.value, entry.tag)) return false;
  if (filter.pid.enabled && filter.pid.value !== null && filter.pid.value !== entry.pid) return false;
  if (filter.process.enabled && !fieldEquals(filter.process.value, entry.deviceId)) return false;
  if (filter.minLevel.enabled && LOG_LEVEL_RANK[entry.level] < LOG_LEVEL_RANK[filter.minLevel.value]) return false;
  if (filter.message.enabled && !messageMatches(filter.message, entry)) return false;
  return true;
}

function fieldEquals(needle: string, haystack: string): boolean {
  if (needle.length === 0) return true;
  return haystack.toLowerCase() === needle.toLowerCase();
}

function messageMatches(field: Filter['message'], entry: LogEntry): boolean {
  if (field.value.length === 0) return true;
  const haystack = [entry.message, ...entry.continuation].join('\n');
  if (field.regex) {
    try {
      const re = new RegExp(field.value, field.ignoreCase ? 'i' : undefined);
      return re.test(haystack);
    } catch {
      return false; // invalid regex-in-progress while typing — treat as no match, not a crash
    }
  }
  return field.ignoreCase
    ? haystack.toLowerCase().includes(field.value.toLowerCase())
    : haystack.includes(field.value);
}

/** Plain text/regex search used by the search bar and the full-buffer search worker. */
export function searchMatches(entry: LogEntry, query: string, regex: boolean, ignoreCase: boolean): boolean {
  if (query.length === 0) return false;
  const haystack = `${entry.tag} ${entry.message} ${entry.continuation.join(' ')}`;
  if (regex) {
    try {
      const re = new RegExp(query, ignoreCase ? 'i' : undefined);
      return re.test(haystack);
    } catch {
      return false;
    }
  }
  return ignoreCase ? haystack.toLowerCase().includes(query.toLowerCase()) : haystack.includes(query);
}
