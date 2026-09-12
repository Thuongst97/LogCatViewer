// Live log buffer. See IMPLEMENTATION_PLAN.md §8: batched appends, a capped
// buffer (trimmed with hysteresis rather than on every single batch, so a
// steady-state capture at capacity doesn't pay an O(n) slice on every tick),
// and an id->entry Map so selecting a row for the LogDetailDialog is O(1)
// instead of scanning the whole buffer.
import { create } from 'zustand';
import type { LogEntry } from '@shared/types';

const TRIM_MARGIN = 1.1;

/** A request to jump the main LogTable to a specific entry (e.g. a Search Results
 *  double-click). `nonce` guarantees the effect re-fires even for a repeat request
 *  to the same id. */
export interface ScrollRequest {
  id: number;
  nonce: number;
}

interface LogState {
  entries: LogEntry[];
  entriesById: Map<number, LogEntry>;
  capacity: number;
  selectedEntryId: number | null;
  autoscroll: boolean;
  scrollRequest: ScrollRequest | null;
  appendBatch: (batch: LogEntry[]) => void;
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
  entriesById: new Map(),
  capacity: 100_000,
  selectedEntryId: null,
  autoscroll: true,
  scrollRequest: null,

  appendBatch: (batch) => {
    if (batch.length === 0) return;
    set((state) => {
      let next = state.entries.length === 0 ? batch.slice() : state.entries.concat(batch);
      let dropped: LogEntry[] = [];
      if (next.length > state.capacity * TRIM_MARGIN) {
        dropped = next.slice(0, next.length - state.capacity);
        next = next.slice(next.length - state.capacity);
      }
      const nextById = state.entriesById;
      for (const e of dropped) nextById.delete(e.id);
      for (const e of batch) nextById.set(e.id, e);
      return { entries: next, entriesById: nextById };
    });
  },

  clear: () => set({ entries: [], entriesById: new Map(), selectedEntryId: null, scrollRequest: null }),
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
