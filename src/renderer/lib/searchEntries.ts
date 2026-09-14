// Full-buffer search, chunked and yielded on the main thread — see
// IMPLEMENTATION_PLAN.md §8.6/§10 for the original "run it in a Web Worker"
// design, which this replaces.
//
// The worker approach turned out to lose to its own overhead at real scale:
// `postMessage` has to structured-clone the *entire* entries array onto the
// worker's heap before it can scan a single one, and that clone is what
// actually dominates — measured at ~2.8s for 1.75M entries, versus ~100ms for
// the scan itself (11 active filters, comparable per-entry cost to a search).
// A worker only pays for itself when the work handed off costs more than
// getting the data there; here it's the reverse, so every search — and every
// background re-search while the dock stays open during live capture or a
// large file load — was paying multiple seconds just to hand the data over,
// which is what made search look hung on anything past a million or so
// entries. Chunking directly on the main thread (mirroring
// useVisibleEntries.ts's filter recompute) does the same amount of real work
// with no clone at all, yielding between chunks so the UI stays responsive.
import { searchMatches } from '@shared/filterEngine';
import type { LogEntry } from '@shared/types';

const CHUNK_SIZE = 50_000;

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function searchEntries(entries: LogEntry[], query: string, regex: boolean, ignoreCase: boolean): Promise<LogEntry[]> {
  if (query.length === 0) return [];
  const matches: LogEntry[] = [];
  for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
    const end = Math.min(i + CHUNK_SIZE, entries.length);
    for (let j = i; j < end; j++) {
      if (searchMatches(entries[j], query, regex, ignoreCase)) matches.push(entries[j]);
    }
    if (end < entries.length) await yieldToEventLoop();
  }
  return matches;
}
