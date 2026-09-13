import { create } from 'zustand';
import { useLogStore } from '../state/logStore';
import { useFilterStore } from '../state/filterStore';
import { compileFilters, PASSTHROUGH_FILTERS, type CompiledFilters } from '@shared/filterEngine';
import type { LogEntry, LogLevel } from '@shared/types';

interface VisibleEntriesState {
  visible: LogEntry[];
  compiled: CompiledFilters;
}

/** Single shared result, computed once and read by both LogTable and
 *  SearchBar — see `initVisibleEntries` for why this isn't just a per-component
 *  hook (a plain hook would redo the same expensive pass once per consumer). */
const useVisibleEntriesStore = create<VisibleEntriesState>(() => ({
  visible: [],
  compiled: PASSTHROUGH_FILTERS
}));

// A full re-filter over a 1M-entry buffer with several active filters
// benchmarked at ~130ms in one continuous synchronous pass — well past a
// frame budget, which is what made toggling a filter checkbox feel like the
// whole UI had frozen. 50k entries/slice keeps each chunk comfortably under
// that, so the main thread yields back to the browser between chunks instead
// of blocking for the full pass in one go.
const CHUNK_SIZE = 50_000;

interface VisibleCache {
  sourceLength: number;
  firstEntry: LogEntry | undefined;
  compiled: CompiledFilters;
  quickLevelExclusions: Set<LogLevel>;
  visible: LogEntry[];
}

let cache: VisibleCache | null = null;
let generation = 0;

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function recompute(): Promise<void> {
  const myGeneration = ++generation;
  const entries = useLogStore.getState().entries;
  const { filters, filtersEnabled, quickLevelExclusions } = useFilterStore.getState();
  const compiled = compileFilters(filters, filtersEnabled);

  // Nothing to filter at all — the common default state (Filters Disabled,
  // no Levels excluded) — skip scanning the buffer entirely.
  if (compiled === PASSTHROUGH_FILTERS && quickLevelExclusions.size === 0) {
    cache = null;
    useVisibleEntriesStore.setState({ visible: entries, compiled });
    return;
  }

  const isVisible = (e: LogEntry) => !quickLevelExclusions.has(e.level) && compiled.isVisible(e);
  const canAppend =
    !!cache &&
    cache.compiled === compiled &&
    cache.quickLevelExclusions === quickLevelExclusions &&
    entries.length >= cache.sourceLength &&
    entries[0] === cache.firstEntry;

  if (canAppend) {
    // Only new entries since last time (no trim/clear, same filter criteria)
    // — bounded by batch size, not buffer size, so no need to chunk this path.
    const added: LogEntry[] = [];
    for (let i = cache!.sourceLength; i < entries.length; i++) {
      if (isVisible(entries[i])) added.push(entries[i]);
    }
    const visible = added.length > 0 ? cache!.visible.concat(added) : cache!.visible;
    cache = { sourceLength: entries.length, firstEntry: entries[0], compiled, quickLevelExclusions, visible };
    useVisibleEntriesStore.setState({ visible, compiled });
    return;
  }

  // Full recompute (a filter/level change, a trim, or a clear) — the
  // expensive path, chunked and yielded. The previous `visible` stays on
  // screen and the UI stays responsive while this runs in the background.
  const result: LogEntry[] = [];
  for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
    if (myGeneration !== generation) return; // superseded by a newer change
    const end = Math.min(i + CHUNK_SIZE, entries.length);
    for (let j = i; j < end; j++) {
      if (isVisible(entries[j])) result.push(entries[j]);
    }
    if (end < entries.length) await yieldToEventLoop();
  }
  if (myGeneration !== generation) return;
  cache = { sourceLength: entries.length, firstEntry: entries[0], compiled, quickLevelExclusions, visible: result };
  useVisibleEntriesStore.setState({ visible: result, compiled });
}

let initialized = false;

/** Wires the shared visible-entries computation to logStore/filterStore
 *  changes — call once at startup (see App.tsx). Centralizing this in one
 *  subscription means a filter toggle re-filters the buffer exactly once,
 *  not once per component that reads the filtered view. */
export function initVisibleEntries(): void {
  if (initialized) return;
  initialized = true;
  recompute();
  useLogStore.subscribe((state, prev) => {
    if (state.entries !== prev.entries) recompute();
  });
  useFilterStore.subscribe((state, prev) => {
    if (
      state.filters !== prev.filters ||
      state.filtersEnabled !== prev.filtersEnabled ||
      state.quickLevelExclusions !== prev.quickLevelExclusions
    ) {
      recompute();
    }
  });
}

/** Single source of truth for "which entries are currently visible" — shared by
 *  LogTable and SearchBar (line counters) so the two never disagree about the
 *  filtered count. The actual computation lives in `recompute` above, run once
 *  per relevant change and shared via `useVisibleEntriesStore`, not redone per
 *  call site. */
export function useVisibleEntries(): { visible: LogEntry[]; compiled: CompiledFilters } {
  const visible = useVisibleEntriesStore((s) => s.visible);
  const compiled = useVisibleEntriesStore((s) => s.compiled);
  return { visible, compiled };
}
