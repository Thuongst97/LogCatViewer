// Full-buffer search, off the main thread — see IMPLEMENTATION_PLAN.md §8.6/§10.
// The main thread posts the *entire current buffer* plus a query; a large
// regex scan here never blocks scrolling or incoming log rendering.
import { searchMatches } from '../lib/filterEngine';
import type { LogEntry } from '@shared/types';

export interface SearchWorkerRequest {
  requestId: number;
  entries: LogEntry[];
  query: string;
  regex: boolean;
  ignoreCase: boolean;
}

export interface SearchWorkerResponse {
  requestId: number;
  matches: LogEntry[];
}

self.onmessage = (event: MessageEvent<SearchWorkerRequest>) => {
  const { requestId, entries, query, regex, ignoreCase } = event.data;
  const matches: LogEntry[] = [];
  for (const entry of entries) {
    if (searchMatches(entry, query, regex, ignoreCase)) matches.push(entry);
  }
  const response: SearchWorkerResponse = { requestId, matches };
  (self as unknown as Worker).postMessage(response);
};
