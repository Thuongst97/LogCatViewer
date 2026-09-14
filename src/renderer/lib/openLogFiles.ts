import { useUiStore } from '../state/uiStore';
import { useFilterStore } from '../state/filterStore';
import type { OpenLogFilterConfig } from '@shared/ipcChannels';

/**
 * Opens the given log file path(s) and drives `uiStore.fileOpenProgress` for
 * the duration — the Toolbar reads that to show a progress bar regardless of
 * which UI triggered the open (toolbar button, File menu, or the Explore tab).
 * Entries themselves stream in separately via the files.onOpenBatch
 * subscription (see App.tsx), which appends through logStore's
 * appendUnboundedBatch — a dedicated, never-trimmed path kept structurally
 * separate from live-capture's capacity-bounded appendBatch, so a file open
 * can never be trimmed down to the live-capture buffer size no matter how
 * this function's IPC timing interleaves with FileService's batch delivery.
 *
 * `filterConfig`, when given a real active filter, makes this "Open with
 * Filter" (see File > Open Log File with Filter…): only lines matching the
 * current filters are parsed into memory, which is also what exempts a huge
 * file from the plain-Open size limit — see FileService.openLogPaths.
 */
export async function openLogFilesWithProgress(paths: string[], filterConfig?: OpenLogFilterConfig): Promise<void> {
  const { setFileOpenProgress } = useUiStore.getState();
  setFileOpenProgress(0);
  const off = window.api.files.onOpenProgress(({ processedBytes, totalBytes }) => {
    setFileOpenProgress(
      totalBytes > 0 ? Math.min(100, Math.round((processedBytes / totalBytes) * 100)) : null,
      totalBytes
    );
  });
  try {
    await window.api.files.openLogPaths(paths, filterConfig);
  } finally {
    off();
    setFileOpenProgress(null);
  }
}

/** The filter set currently configured — saved Filters plus the search bar's
 *  quick per-level exclusions — in the shape `openLogPaths`/FileService
 *  expect, used by the "Open with Filter" entry point so it filters by
 *  whatever the user already has set up, exactly like the live view does. */
export function currentFilterConfig(): OpenLogFilterConfig {
  const { filters, filtersEnabled, quickLevelExclusions } = useFilterStore.getState();
  return { filters, filtersEnabled, quickLevelExclusions: Array.from(quickLevelExclusions) };
}
