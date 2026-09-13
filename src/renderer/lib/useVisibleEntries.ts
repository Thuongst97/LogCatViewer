import { useMemo, useRef } from 'react';
import { useLogStore } from '../state/logStore';
import { useFilterStore } from '../state/filterStore';
import { compileFilters, PASSTHROUGH_FILTERS, type CompiledFilters } from '@shared/filterEngine';
import type { LogEntry, LogLevel } from '@shared/types';

interface VisibleCache {
  sourceLength: number;
  firstEntry: LogEntry | undefined;
  compiled: CompiledFilters;
  quickLevelExclusions: Set<LogLevel>;
  visible: LogEntry[];
}

/** Single source of truth for "which entries are currently visible" — shared by
 *  LogTable and SearchBar (line counters) so the two never disagree about the
 *  filtered count.
 *
 * Live capture appends a new batch (and a new `entries` reference) roughly
 * every 40ms — re-scanning the *entire* buffer from scratch on every one of
 * those ticks is the dominant cost of a large buffer (benchmarked at ~24ms
 * for a 1M-entry buffer with an active filter, over half the tick budget, on
 * the renderer's main thread with nothing to yield to). Two optimizations:
 *
 * 1. When nothing is actually filtering (Filters Disabled / no active filter,
 *    and no Levels excluded — the default state), skip scanning entirely and
 *    hand back `entries` as-is instead of copying it through a no-op filter.
 * 2. Otherwise, if `entries` only grew since last time (append, no trim/clear
 *    — checked cheaply via length + first-element identity) and the filter
 *    criteria didn't change, only the *new* slice needs filtering; it's
 *    concatenated onto the previously-computed visible list rather than
 *    re-deriving the whole thing. A trim, a clear, or a filter/search change
 *    still falls back to a full re-filter, same as before.
 */
export function useVisibleEntries(): { visible: LogEntry[]; compiled: CompiledFilters } {
  const entries = useLogStore((s) => s.entries);
  const filters = useFilterStore((s) => s.filters);
  const filtersEnabled = useFilterStore((s) => s.filtersEnabled);
  const quickLevelExclusions = useFilterStore((s) => s.quickLevelExclusions);
  const compiled = useMemo(() => compileFilters(filters, filtersEnabled), [filters, filtersEnabled]);
  const cacheRef = useRef<VisibleCache | null>(null);

  const visible = useMemo(() => {
    if (compiled === PASSTHROUGH_FILTERS && quickLevelExclusions.size === 0) {
      cacheRef.current = null;
      return entries;
    }

    const isVisible = (e: LogEntry) => !quickLevelExclusions.has(e.level) && compiled.isVisible(e);
    const cache = cacheRef.current;
    const canAppend =
      !!cache &&
      cache.compiled === compiled &&
      cache.quickLevelExclusions === quickLevelExclusions &&
      entries.length >= cache.sourceLength &&
      entries[0] === cache.firstEntry;

    const next = canAppend
      ? appendFiltered(cache!.visible, entries, cache!.sourceLength, isVisible)
      : entries.filter(isVisible);

    cacheRef.current = { sourceLength: entries.length, firstEntry: entries[0], compiled, quickLevelExclusions, visible: next };
    return next;
  }, [entries, quickLevelExclusions, compiled]);

  return { visible, compiled };
}

function appendFiltered(
  previousVisible: LogEntry[],
  entries: LogEntry[],
  previousLength: number,
  isVisible: (e: LogEntry) => boolean
): LogEntry[] {
  if (entries.length === previousLength) return previousVisible;
  const added: LogEntry[] = [];
  for (let i = previousLength; i < entries.length; i++) {
    if (isVisible(entries[i])) added.push(entries[i]);
  }
  return added.length > 0 ? previousVisible.concat(added) : previousVisible;
}
