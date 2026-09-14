// Live log buffer. See IMPLEMENTATION_PLAN.md §8: batched appends, a capped
// buffer (trimmed with hysteresis rather than on every single batch, so a
// steady-state capture at capacity doesn't pay an O(n) slice on every tick),
// and an id->entry Map so selecting a row for the LogDetailDialog is O(1)
// instead of scanning the whole buffer.
//
// `entries` is mutated in place (push/splice) instead of rebuilt via
// concat/slice on every batch. At capacity (up to ~1.1M entries with the
// trim margin below), `entries.concat(batch)` copies the *entire* buffer on
// every single ~40ms tick — that's the dominant cost that made capture lag
// badly past ~1M lines, dwarfing everything else in the render pipeline.
// Mutating in place makes a batch O(batch.length) instead of O(buffer
// length). The trade-off: consumers can no longer tell "did the data change"
// by comparing `entries` to its previous reference (it's the same array
// object across most ticks now) — `version` is the explicit signal for that;
// see useVisibleEntries.ts, which is the one place that used to rely on the
// old reference-equality check.
import { create } from 'zustand';
import type { LogEntry } from '@shared/types';

const TRIM_MARGIN = 1.1;

/** Bounds the live-capture buffer so an indefinitely-running capture can't grow
 *  memory forever. A file open is a known, finite source, not an open-ended
 *  stream, so it goes through appendUnboundedBatch below instead of this cap —
 *  file-open batches arrive on their own IPC channel (see files.onOpenBatch)
 *  specifically so they never touch this capacity-trim path at all. (An
 *  earlier version toggled `capacity` up/down around a file load instead, but
 *  that relied on every LogBatch IPC message finishing before the invoke()
 *  promise resolved — a timing assumption that didn't always hold, and would
 *  silently trim a freshly-loaded file down to this size right after "done".) */
export const DEFAULT_LOG_CAPACITY = 1_000_000;

/** A request to jump the main LogTable to a specific entry (e.g. a Search Results
 *  double-click). `nonce` guarantees the effect re-fires even for a repeat request
 *  to the same id. */
export interface ScrollRequest {
  id: number;
  nonce: number;
}

interface LogState {
  entries: LogEntry[];
  /** Bumped on every mutation to `entries` (append, trim, clear) — the signal
   *  consumers must use to detect a change, since `entries` itself keeps the
   *  same array reference across most ticks now (see the file-level comment
   *  above). */
  version: number;
  entriesById: Map<number, LogEntry>;
  capacity: number;
  selectedEntryId: number | null;
  autoscroll: boolean;
  scrollRequest: ScrollRequest | null;
  appendBatch: (batch: LogEntry[]) => void;
  /** Same as appendBatch but never trims — used exclusively for file-open
   *  batches (see files.onOpenBatch in App.tsx), which are a finite, known
   *  source the user explicitly asked to see in full, not an open-ended
   *  stream that needs a memory-bounding cap. */
  appendUnboundedBatch: (batch: LogEntry[]) => void;
  clear: () => void;
  select: (id: number | null) => void;
  /** Selects `id` and asks LogTable to scroll it into view — also turns off
   *  autoscroll, since jumping to inspect a specific past line implies the
   *  user doesn't want the view immediately yanked back to the live tail. */
  goToEntry: (id: number) => void;
  clearScrollRequest: () => void;
  setCapacity: (capacity: number) => void;
  setAutoscroll: (value: boolean) => void;
}

export const useLogStore = create<LogState>((set) => ({
  entries: [],
  version: 0,
  entriesById: new Map(),
  capacity: DEFAULT_LOG_CAPACITY,
  selectedEntryId: null,
  autoscroll: true,
  scrollRequest: null,

  appendBatch: (batch) => {
    if (batch.length === 0) return;
    set((state) => {
      // Mutate in place — see the file-level comment for why this can't be a
      // fresh array via concat/slice at this scale.
      const entries = state.entries;
      for (const e of batch) entries.push(e);
      const nextById = state.entriesById;
      for (const e of batch) nextById.set(e.id, e);
      if (entries.length > state.capacity * TRIM_MARGIN) {
        const dropCount = entries.length - state.capacity;
        const dropped = entries.splice(0, dropCount);
        for (const e of dropped) nextById.delete(e.id);
      }
      return { entries, entriesById: nextById, version: state.version + 1 };
    });
  },

  appendUnboundedBatch: (batch) => {
    if (batch.length === 0) return;
    set((state) => {
      const entries = state.entries;
      for (const e of batch) entries.push(e);
      const nextById = state.entriesById;
      for (const e of batch) nextById.set(e.id, e);
      return { entries, entriesById: nextById, version: state.version + 1 };
    });
  },

  clear: () =>
    set((state) => ({ entries: [], entriesById: new Map(), selectedEntryId: null, scrollRequest: null, version: state.version + 1 })),
  select: (id) => set({ selectedEntryId: id }),
  goToEntry: (id) =>
    set((state) => ({
      selectedEntryId: id,
      autoscroll: false,
      scrollRequest: { id, nonce: (state.scrollRequest?.nonce ?? 0) + 1 }
    })),
  clearScrollRequest: () => set({ scrollRequest: null }),
  setCapacity: (capacity) => set({ capacity }),
  setAutoscroll: (value) => set({ autoscroll: value })
}));

export function useSelectedEntry(): LogEntry | null {
  const id = useLogStore((s) => s.selectedEntryId);
  const byId = useLogStore((s) => s.entriesById);
  return id === null ? null : (byId.get(id) ?? null);
}
