import { dialog, type BrowserWindow } from 'electron';
import { createReadStream } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import type { LogEntry, ProjectFile } from '@shared/types';
import { LogParser } from './LogParser';

// Reading and regex-parsing a large log file (50MB+, hundreds of thousands of
// lines) in one synchronous pass used to block the main process's single JS
// thread for seconds at a time — no IPC, no window repaint, nothing else could
// run, which is exactly what makes an Electron app look "Not Responding".
// Streaming the file in ~1MB chunks keeps every synchronous burst of parsing
// short, and yielding after each one lets the event loop breathe between them.
const STREAM_CHUNK_BYTES = 1 << 20;

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** Native open/save dialogs and disk I/O for log files and project files. */
export class FileService {
  /** Shows the native multi-select picker and returns the chosen paths — fast,
   *  no parsing — so a cancelled dialog never disturbs whatever's already loaded. */
  async showOpenLogDialog(window: BrowserWindow): Promise<string[] | null> {
    const result = await dialog.showOpenDialog(window, {
      title: 'Open Log File',
      filters: [
        { name: 'Logcat / Text', extensions: ['txt', 'log'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile', 'multiSelections']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths;
  }

  /**
   * Parses one or more log files and hands entries to `emitBatch` progressively
   * as they're ready, instead of returning one giant array once everything is
   * done. A single file streams straight into the table batch by batch, the
   * same way a live capture does, so lines start appearing immediately instead
   * of the UI going quiet for however long the whole file takes.
   *
   * Several files must still be fully read before they can be merged into one
   * chronological timeline (see the multi-file Open dialog), so those are read
   * in parallel (each one chunked and non-blocking) and the merged, renumbered
   * result is handed back in slices — not one multi-hundred-MB IPC message.
   */
  async openLogPaths(
    paths: string[],
    emitBatch: (entries: LogEntry[]) => void,
    onProgress?: (processedBytes: number, totalBytes: number) => void
  ): Promise<void> {
    const sizes = await Promise.all(paths.map((path) => stat(path).then((s) => s.size)));
    const totalBytes = sizes.reduce((a, b) => a + b, 0);

    if (paths.length === 1) {
      await this.streamFile(paths[0], emitBatch, (processed) => onProgress?.(processed, totalBytes));
      return;
    }

    // Several files must still be fully read before they can be merged into one
    // chronological timeline, so progress here tracks combined bytes read
    // across all of them (each one is still chunked and non-blocking on its own).
    const processedByFile = new Array(paths.length).fill(0);
    const reportProgress = () => onProgress?.(processedByFile.reduce((a, b) => a + b, 0), totalBytes);

    const perFile = await Promise.all(
      paths.map((path, i) =>
        this.readFileEntries(path, (processed) => {
          processedByFile[i] = processed;
          reportProgress();
        })
      )
    );
    const merged = perFile.flat().sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    merged.forEach((entry, index) => {
      entry.id = index + 1;
    });

    const SLICE = 5000;
    for (let i = 0; i < merged.length; i += SLICE) {
      emitBatch(merged.slice(i, i + SLICE));
      await yieldToEventLoop();
    }
  }

  private async readFileEntries(path: string, onProgress?: (processedBytes: number) => void): Promise<LogEntry[]> {
    const entries: LogEntry[] = [];
    await this.streamFile(path, (batch) => entries.push(...batch), onProgress);
    return entries;
  }

  private async streamFile(
    path: string,
    emitBatch: (entries: LogEntry[]) => void,
    onProgress?: (processedBytes: number) => void
  ): Promise<void> {
    const parser = new LogParser(path, 1);
    const stream = createReadStream(path, { encoding: 'utf8', highWaterMark: STREAM_CHUNK_BYTES });
    let processedBytes = 0;
    for await (const chunk of stream) {
      processedBytes += Buffer.byteLength(chunk as string, 'utf8');
      onProgress?.(processedBytes);
      parser.feed(chunk as string);
      const batch = parser.drain();
      if (batch.length > 0) emitBatch(batch);
      await yieldToEventLoop();
    }
    parser.feed('\n'); // ensure the last line is flushed even without a trailing newline
    parser.flushAll();
    const rest = parser.drain();
    if (rest.length > 0) emitBatch(rest);
  }

  async openProjectDialog(window: BrowserWindow): Promise<ProjectFile | null> {
    const result = await dialog.showOpenDialog(window, {
      title: 'Open Project',
      filters: [{ name: 'LogCat Viewer Project', extensions: ['lcv.json', 'json'] }],
      properties: ['openFile']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const content = await readFile(result.filePaths[0], 'utf8');
    return JSON.parse(content) as ProjectFile;
  }

  async saveProjectDialog(window: BrowserWindow, defaultName: string): Promise<string | null> {
    const result = await dialog.showSaveDialog(window, {
      title: 'Save Project',
      defaultPath: defaultName.endsWith('.lcv.json') ? defaultName : `${defaultName}.lcv.json`,
      filters: [{ name: 'LogCat Viewer Project', extensions: ['lcv.json'] }]
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  }

  async saveProject(path: string, project: ProjectFile): Promise<void> {
    await writeFile(path, JSON.stringify(project, null, 2), 'utf8');
  }

  async saveLogDialog(window: BrowserWindow, defaultName: string): Promise<string | null> {
    const result = await dialog.showSaveDialog(window, {
      title: 'Save Log',
      defaultPath: defaultName.endsWith('.log') ? defaultName : `${defaultName}.log`,
      filters: [{ name: 'Log File', extensions: ['log'] }]
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  }

  async saveLogFile(path: string, entries: LogEntry[]): Promise<void> {
    await writeFile(path, entries.map((e) => e.raw).join('\n') + '\n', 'utf8');
  }
}
