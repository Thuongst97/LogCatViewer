import { dialog, type BrowserWindow } from 'electron';
import { createReadStream } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import type { Filter, LogEntry, LogLevel, ProjectFile } from '@shared/types';
import { compileFilters } from '@shared/filterEngine';
import { LogParser } from './LogParser';

// Reading and regex-parsing a large log file (50MB+, hundreds of thousands of
// lines) in one synchronous pass used to block the main process's single JS
// thread for seconds at a time — no IPC, no window repaint, nothing else could
// run, which is exactly what makes an Electron app look "Not Responding".
// Streaming the file in ~1MB chunks keeps every synchronous burst of parsing
// short, and yielding after each one lets the event loop breathe between them.
const STREAM_CHUNK_BYTES = 1 << 20;

// Even with chunked, non-blocking parsing, every parsed line still ends up as a
// live LogEntry object in the renderer's buffer (see openLogFiles.ts lifting
// logStore's capacity for a file load) — millions of them means real memory
// and a real per-filter-toggle rescan cost, though logStore's appends
// themselves are now O(batch) rather than O(buffer length) (see logStore.ts),
// which is what makes raising this cap to 500MB reasonable rather than just
// moving where the same slowdown used to kick in. Past this size, "Open"
// refuses and points at "Open with Filter" instead, which discards
// non-matching lines as it streams so the in-memory result stays bounded by
// match count, not file size.
const MAX_UNFILTERED_OPEN_BYTES = 500 * 1024 * 1024;

// "Open with Filter" filters lines before they reach the frontend, so file
// size alone doesn't predict frontend load the way it does for plain Open —
// but the UI still renders every *kept* entry, so a broad or disabled filter
// on a huge file can still hand the table millions of rows and reproduce the
// same unresponsiveness the filtering was meant to avoid. Two independent
// caps: a much larger raw-size ceiling (scanning the file at all takes time
// regardless of how much survives filtering) and a cap on how many lines are
// actually allowed to reach the frontend.
const MAX_FILTERED_OPEN_BYTES = 500 * 1024 * 1024;
const MAX_FILTERED_OPEN_LINES = 2_000_000;

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export interface OpenLogFilterConfig {
  filters: Filter[];
  filtersEnabled: boolean;
  quickLevelExclusions: LogLevel[];
}

/** Shared, mutable across every file in a multi-file open (see openLogPaths),
 *  since the cap is on the *combined* kept-entry count, not per file. */
interface LineBudget {
  remaining: number;
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
   *
   * Passing `filterConfig` at all (even with no active filter configured yet)
   * means the caller went through "Open with Filter", not plain "Open" — see
   * openLogFiles.ts's currentFilterConfig, only ever passed by that entry
   * point. That's what exempts the call from the plain-Open size cap below:
   * filtering happens against each parsed line here, in the main process,
   * before a match ever reaches `emitBatch`/IPC, so the frontend only ever
   * receives the bounded, already-filtered result instead of the full file —
   * unlike plain "Open", which has no such filtering step and would otherwise
   * ship the entire file to the renderer. The filtering itself mirrors both
   * layers the live view applies (see renderer's useVisibleEntries): the
   * saved Filter list (when filtersEnabled and at least one is active) and
   * the search bar's quick per-level exclusions, independently of each other.
   *
   * "Open with Filter" still has its own, much larger caps though (see
   * MAX_FILTERED_OPEN_BYTES/MAX_FILTERED_OPEN_LINES): a broad or disabled
   * filter on a huge file can still hand the table millions of rows, which
   * is exactly the unresponsiveness filtering was meant to avoid.
   */
  async openLogPaths(
    paths: string[],
    emitBatch: (entries: LogEntry[]) => void,
    onProgress?: (processedBytes: number, totalBytes: number) => void,
    filterConfig?: OpenLogFilterConfig
  ): Promise<void> {
    const sizes = await Promise.all(paths.map((path) => stat(path).then((s) => s.size)));
    const totalBytes = sizes.reduce((a, b) => a + b, 0);

    const isFilteredOpen = filterConfig !== undefined;
    if (!isFilteredOpen && totalBytes > MAX_UNFILTERED_OPEN_BYTES) {
      throw new Error(
        `This would load ${formatBytes(totalBytes)} of raw log data — over the ${formatBytes(MAX_UNFILTERED_OPEN_BYTES)} limit ` +
          "for opening a file normally, since keeping every line in memory can make the app unresponsive on files this size. " +
          'Use File > Open Log File with Filter… instead — it filters lines before they ever reach the app, so only what matches gets loaded.'
      );
    }
    if (isFilteredOpen && totalBytes > MAX_FILTERED_OPEN_BYTES) {
      throw new Error(
        `This would scan ${formatBytes(totalBytes)} of raw log data — over the ${formatBytes(MAX_FILTERED_OPEN_BYTES)} limit ` +
          'for Open with Filter as well, since reading a file that large takes a long time regardless of how much survives filtering. ' +
          'Try a smaller file or splitting it first.'
      );
    }
    const isVisible = this.buildVisibilityPredicate(filterConfig);
    // Filtering happens before entries ever reach the frontend, but the UI
    // still renders every kept line — a broad filter (or none at all) on a
    // big file can still hand the table millions of rows. Capped only for
    // "Open with Filter"; plain Open is already bounded by its byte cap above.
    const lineBudget: LineBudget | null = isFilteredOpen ? { remaining: MAX_FILTERED_OPEN_LINES } : null;

    if (paths.length === 1) {
      await this.streamFile(paths[0], emitBatch, (processed) => onProgress?.(processed, totalBytes), isVisible, lineBudget);
      return;
    }

    // Several files must still be fully read *and merged* before anything can be
    // emitted (see below) — reading is only part of the work, so it's capped at
    // READ_PHASE_SHARE of the reported progress. Without this, progress hit 100%
    // the moment the last byte was read, then sat there — visually "stuck" —
    // while the merge/sort/renumber/emit steps (which can take a real slice of
    // time for large files) still ran with no feedback at all.
    const READ_PHASE_SHARE = 0.9;
    const processedByFile = new Array(paths.length).fill(0);
    const reportReadProgress = () =>
      onProgress?.(processedByFile.reduce((a, b) => a + b, 0) * READ_PHASE_SHARE, totalBytes);

    const perFile = await Promise.all(
      paths.map((path, i) =>
        this.readFileEntries(
          path,
          (processed) => {
            processedByFile[i] = processed;
            reportReadProgress();
          },
          isVisible,
          lineBudget
        )
      )
    );

    // Sorting/renumbering the full merged set is itself a real chunk of
    // synchronous work for large files — yield first so the last read-phase
    // progress update actually paints before this runs.
    await yieldToEventLoop();
    const merged = perFile.flat().sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    merged.forEach((entry, index) => {
      entry.id = index + 1;
    });

    const SLICE = 5000;
    const totalSlices = Math.max(1, Math.ceil(merged.length / SLICE));
    for (let i = 0; i < merged.length; i += SLICE) {
      emitBatch(merged.slice(i, i + SLICE));
      const sliceIndex = i / SLICE + 1;
      onProgress?.(totalBytes * (READ_PHASE_SHARE + (1 - READ_PHASE_SHARE) * (sliceIndex / totalSlices)), totalBytes);
      await yieldToEventLoop();
    }
    onProgress?.(totalBytes, totalBytes);
  }

  /** Combines the saved Filter list and the quick per-level exclusions into a
   *  single predicate, mirroring renderer's useVisibleEntries exactly: level
   *  exclusion applies unconditionally (even with filtersEnabled off, just
   *  like the live view), while the saved filters only apply when enabled
   *  and at least one is active. Returns null when neither is in play, so
   *  the streaming loop can skip filtering work entirely. */
  private buildVisibilityPredicate(filterConfig?: OpenLogFilterConfig): ((entry: LogEntry) => boolean) | null {
    if (!filterConfig) return null;
    const hasActiveFilter = filterConfig.filtersEnabled && filterConfig.filters.some((f) => f.active);
    const compiled = hasActiveFilter ? compileFilters(filterConfig.filters, filterConfig.filtersEnabled) : null;
    const excludedLevels = new Set(filterConfig.quickLevelExclusions);
    if (!compiled && excludedLevels.size === 0) return null;
    return (entry) => !excludedLevels.has(entry.level) && (!compiled || compiled.isVisible(entry));
  }

  private async readFileEntries(
    path: string,
    onProgress?: (processedBytes: number) => void,
    isVisible?: ((entry: LogEntry) => boolean) | null,
    lineBudget?: LineBudget | null
  ): Promise<LogEntry[]> {
    const entries: LogEntry[] = [];
    await this.streamFile(path, (batch) => entries.push(...batch), onProgress, isVisible, lineBudget);
    return entries;
  }

  private async streamFile(
    path: string,
    emitBatch: (entries: LogEntry[]) => void,
    onProgress?: (processedBytes: number) => void,
    isVisible?: ((entry: LogEntry) => boolean) | null,
    lineBudget?: LineBudget | null
  ): Promise<void> {
    const parser = new LogParser(path, 1);
    const stream = createReadStream(path, { encoding: 'utf8', highWaterMark: STREAM_CHUNK_BYTES });
    let processedBytes = 0;
    for await (const chunk of stream) {
      processedBytes += Buffer.byteLength(chunk as string, 'utf8');
      onProgress?.(processedBytes);
      parser.feed(chunk as string);
      let batch = parser.drain();
      if (isVisible) batch = batch.filter(isVisible);
      if (lineBudget) batch = batch.slice(0, lineBudget.remaining);
      if (batch.length > 0) emitBatch(batch);
      if (lineBudget) {
        lineBudget.remaining -= batch.length;
        if (lineBudget.remaining <= 0) {
          throw new Error(
            `Even after filtering, this matched over ${MAX_FILTERED_OPEN_LINES.toLocaleString()} lines — loading stopped there to keep ` +
              'the app responsive. Narrow your filter (or your Levels selection) and try again.'
          );
        }
      }
      await yieldToEventLoop();
    }
    parser.feed('\n'); // ensure the last line is flushed even without a trailing newline
    parser.flushAll();
    let rest = parser.drain();
    if (isVisible) rest = rest.filter(isVisible);
    if (lineBudget) rest = rest.slice(0, lineBudget.remaining);
    if (rest.length > 0) emitBatch(rest);
    if (lineBudget) lineBudget.remaining -= rest.length;
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
