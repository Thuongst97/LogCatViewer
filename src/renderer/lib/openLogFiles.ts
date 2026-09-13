import { useUiStore } from '../state/uiStore';

/**
 * Opens the given log file path(s) and drives `uiStore.fileOpenProgress` for
 * the duration — the Toolbar reads that to show a progress bar regardless of
 * which UI triggered the open (toolbar button, File menu, or the Explore tab).
 * Entries themselves stream in separately via the existing capture.onLogBatch
 * subscription (see App.tsx) as FileService parses the file(s) in chunks.
 */
export async function openLogFilesWithProgress(paths: string[]): Promise<void> {
  const { setFileOpenProgress } = useUiStore.getState();
  setFileOpenProgress(0);
  const off = window.api.files.onOpenProgress(({ processedBytes, totalBytes }) => {
    setFileOpenProgress(totalBytes > 0 ? Math.min(100, Math.round((processedBytes / totalBytes) * 100)) : null);
  });
  try {
    await window.api.files.openLogPaths(paths);
  } finally {
    off();
    setFileOpenProgress(null);
  }
}
