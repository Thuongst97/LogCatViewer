import { useEffect, useRef } from 'react';
import type { LogEntry } from '@shared/types';
import type { SearchWorkerRequest, SearchWorkerResponse } from '../workers/searchWorker';

/** Spins up the search worker once per component lifetime and exposes a promise-based search(). */
export function useSearchWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pending = useRef(new Map<number, (matches: LogEntry[]) => void>());
  const nextRequestId = useRef(1);

  useEffect(() => {
    const worker = new Worker(new URL('../workers/searchWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<SearchWorkerResponse>) => {
      const resolve = pending.current.get(event.data.requestId);
      if (resolve) {
        resolve(event.data.matches);
        pending.current.delete(event.data.requestId);
      }
    };
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  function search(entries: LogEntry[], query: string, regex: boolean, ignoreCase: boolean): Promise<LogEntry[]> {
    return new Promise((resolve) => {
      const worker = workerRef.current;
      if (!worker || query.length === 0) {
        resolve([]);
        return;
      }
      const requestId = nextRequestId.current++;
      pending.current.set(requestId, resolve);
      const payload: SearchWorkerRequest = { requestId, entries, query, regex, ignoreCase };
      worker.postMessage(payload);
    });
  }

  return { search };
}
