import { useUiStore } from '../state/uiStore';
import type { LogEntry } from '@shared/types';

// Entries per IPC round trip. The old code handed the *entire* entry array to
// the main process in one invoke, which structured-cloned millions of objects
// before a single byte hit disk — several seconds of a completely frozen
// window on a large buffer, with no sign anything was happening. Joining to
// text here and sending it a slice at a time keeps each clone small (a slice
// this size is a few MB of string, which clones far faster than the
// equivalent object graph) and gives the event loop a gap between chunks so
// the window keeps painting.
const ENTRIES_PER_CHUNK = 50_000;

/**
 * Quick-save the full captured buffer to a .log file — a single native save
 * dialog, no format/scope choices. This is "Save" in the DLT Viewer sense
 * (save what you've captured), distinct from "Save Project…" (saves the
 * filter configuration, not the log data — a different file entirely).
 */
export async function saveLogAsFile(entries: LogEntry[]): Promise<void> {
  const suggestedName = `logcat_${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const path = await window.api.files.saveLogDialog(suggestedName);
  if (!path) return;

  const { setFileSaveProgress } = useUiStore.getState();
  setFileSaveProgress(0);
  try {
    for (let i = 0; i < entries.length; i += ENTRIES_PER_CHUNK) {
      const slice = entries.slice(i, i + ENTRIES_PER_CHUNK);
      const text = slice.map((e) => e.raw).join('\n') + '\n';
      await window.api.files.saveLogFile(path, text, i > 0);
      setFileSaveProgress(Math.min(100, Math.round(((i + slice.length) / entries.length) * 100)));
    }
    // An empty buffer still produces the (empty) file the user asked for.
    if (entries.length === 0) await window.api.files.saveLogFile(path, '', false);
  } finally {
    setFileSaveProgress(null);
  }
}
