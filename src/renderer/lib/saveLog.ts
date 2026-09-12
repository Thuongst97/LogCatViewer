import type { LogEntry } from '@shared/types';

/**
 * Quick-save the full captured buffer to a .log file — a single native save
 * dialog, no format/scope choices. This is "Save" in the DLT Viewer sense
 * (save what you've captured), distinct from "Export…" (a dialog to curate
 * format/scope/columns) and from "Save Project…" (saves the filter
 * configuration, not the log data — a different file entirely).
 */
export async function saveLogAsFile(entries: LogEntry[]): Promise<void> {
  const suggestedName = `logcat_${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const destinationPath = await window.api.export.showSaveDialog(suggestedName, 'raw');
  if (!destinationPath) return;
  await window.api.export.run(
    { format: 'raw', scope: 'all', includeHeaders: false, onlyVisibleColumns: false, destinationPath },
    entries
  );
}
