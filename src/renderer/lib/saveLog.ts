import type { LogEntry } from '@shared/types';

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
  await window.api.files.saveLogFile(path, entries);
}
