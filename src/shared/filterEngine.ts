// Filter combination logic — see IMPLEMENTATION_PLAN.md §9.
// A positive filter includes; a negative filter excludes; a marker filter
// never hides anything. Any non-negative filter that matches also lends its
// configured color to the row — a positive filter isn't just an include
// rule, it's also how you tell the table "and paint matches like *this*".
//
// Lives in shared/ (not renderer/lib/) because the main process needs it too:
// "Open with Filter" applies these same rules while streaming a huge log file,
// discarding non-matching lines before they ever reach the renderer, so a
// massive file's memory footprint is bounded by match count instead of file
// size (see main/services/FileService.ts).
import { LOG_LEVEL_RANK, type Filter, type LogEntry } from './types';

export interface CompiledFilters {
  /** true if `entry` should be visible given the current active filter set. */
  isVisible(entry: LogEntry): boolean;
  /** highlight color for `entry` from the first matching active positive/marker filter, or null. */
  rowColor(entry: LogEntry): string | null;
}

/** Exported so callers (see renderer's useVisibleEntries) can cheaply check
 *  "is anything actually being filtered?" via reference equality instead of
 *  running isVisible over every entry just to find out it always returns true. */
export const PASSTHROUGH_FILTERS: CompiledFilters = { isVisible: () => true, rowColor: () => null };

/** A filter with its message regex (if any) pre-compiled once at `compileFilters()`
 *  time, instead of re-compiling the same pattern on every entry it's tested
 *  against — the difference between one RegExp construction and millions of them
 *  when scanning a huge file. `messageRegex` is null for a non-regex filter, or
 *  when the pattern is invalid (fails closed — see messageMatchesCompiled). */
interface CompiledFilter {
  filter: Filter;
  messageRegex: RegExp | null;
}

function compileFilter(filter: Filter): CompiledFilter {
  let messageRegex: RegExp | null = null;
  if (filter.message.enabled && filter.message.regex && filter.message.value.length > 0) {
    try {
      messageRegex = new RegExp(filter.message.value, filter.message.ignoreCase ? 'i' : undefined);
    } catch {
      messageRegex = null; // invalid regex-in-progress while typing — treat as no match, not a crash
    }
  }
  return { filter, messageRegex };
}

/**
 * `enabled` is the master "Filters Applied" toggle (plan follow-up, mirrors DLT Viewer's
 * "Filters Enabled" checkbox): when off, every saved filter is bypassed entirely — every
 * line shows, unfiltered and uncolored — regardless of each filter's own active state.
 */
export function compileFilters(filters: Filter[], enabled = true): CompiledFilters {
  if (!enabled) return PASSTHROUGH_FILTERS;

  const active = filters.filter((f) => f.active).map(compileFilter);
  // No active filter is exactly as much a no-op as `enabled: false` — same
  // singleton, so callers checking "is anything filtering?" by reference
  // don't have to special-case this too.
  if (active.length === 0) return PASSTHROUGH_FILTERS;
  const positives = active.filter((f) => f.filter.type === 'positive');
  const negatives = active.filter((f) => f.filter.type === 'negative');
  const colorable = active.filter((f) => f.filter.type !== 'negative');

  return {
    isVisible(entry: LogEntry): boolean {
      if (negatives.some((f) => matchesCompiledFilter(f, entry))) return false;
      if (positives.length === 0) return true;
      return positives.some((f) => matchesCompiledFilter(f, entry));
    },
    rowColor(entry: LogEntry): string | null {
      const hit = colorable.find((f) => matchesCompiledFilter(f, entry));
      return hit ? hit.filter.color : null;
    }
  };
}

function matchesCompiledFilter(compiled: CompiledFilter, entry: LogEntry): boolean {
  const { filter } = compiled;
  if (filter.tag.enabled && !fieldEquals(filter.tag.value, entry.tag)) return false;
  if (filter.pid.enabled && filter.pid.value !== null && filter.pid.value !== entry.pid) return false;
  if (filter.process.enabled && !fieldEquals(filter.process.value, entry.deviceId)) return false;
  if (filter.minLevel.enabled && LOG_LEVEL_RANK[entry.level] < LOG_LEVEL_RANK[filter.minLevel.value]) return false;
  if (filter.message.enabled && !messageMatchesCompiled(compiled, entry)) return false;
  return true;
}

/** Standalone single-filter check for one-off callers — compiles its regex (if
 *  any) fresh on every call, so prefer compileFilters() for anything checking
 *  more than a handful of entries against the same filter. */
export function matchesFilter(filter: Filter, entry: LogEntry): boolean {
  return matchesCompiledFilter(compileFilter(filter), entry);
}

function fieldEquals(needle: string, haystack: string): boolean {
  if (needle.length === 0) return true;
  return haystack.toLowerCase() === needle.toLowerCase();
}

function messageMatchesCompiled(compiled: CompiledFilter, entry: LogEntry): boolean {
  const { filter } = compiled;
  if (filter.message.value.length === 0) return true;
  const haystack = [entry.message, ...entry.continuation].join('\n');
  if (filter.message.regex) {
    return compiled.messageRegex ? compiled.messageRegex.test(haystack) : false;
  }
  return filter.message.ignoreCase
    ? haystack.toLowerCase().includes(filter.message.value.toLowerCase())
    : haystack.includes(filter.message.value);
}

/**
 * Plain text/regex search used by the search bar and the full-buffer search worker.
 * In regex mode `|` already means alternation, same as any regex engine. In plain-text
 * mode it's treated the same way as a convenience — `"WifiHAL|HDMI"` matches a line
 * containing *either* keyword — a common log-tool convention (DLT Viewer and others)
 * that saves switching into regex mode just for simple OR searches.
 */
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
  const compareHaystack = ignoreCase ? haystack.toLowerCase() : haystack;
  const terms = query
    .split('|')
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
  if (terms.length === 0) return false;
  return terms.some((term) => compareHaystack.includes(ignoreCase ? term.toLowerCase() : term));
}
