import { dialog, type BrowserWindow } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import type { LogEntry, ProjectFile } from '@shared/types';
import { LogParser } from './LogParser';

/** Native open/save dialogs and disk I/O for log files and project files. */
export class FileService {
  async openLogDialog(window: BrowserWindow): Promise<{ paths: string[]; entries: LogEntry[] } | null> {
    const result = await dialog.showOpenDialog(window, {
      title: 'Open Log File',
      filters: [
        { name: 'Logcat / Text', extensions: ['txt', 'log'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile', 'multiSelections']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return this.openLogsAtPaths(result.filePaths);
  }

  /** Same read-and-parse as openLogDialog, but for a path already known (e.g. a
   *  double-click in the Explore tab) — no picker involved. */
  async openLogAtPath(path: string): Promise<{ path: string; entries: LogEntry[] }> {
    return { path, entries: await this.parseLogFile(path) };
  }

  /** Reads and parses several log files at once (the Open dialog's multi-select —
   *  e.g. a set of rotated logcat_*.log captures) and merges them into a single
   *  chronologically-ordered timeline. Each file starts its own id sequence while
   *  parsing, so ids are reassigned sequentially after the merge to stay unique. */
  async openLogsAtPaths(paths: string[]): Promise<{ paths: string[]; entries: LogEntry[] }> {
    const perFile = await Promise.all(paths.map((path) => this.parseLogFile(path)));
    const merged = perFile.flat().sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    merged.forEach((entry, index) => {
      entry.id = index + 1;
    });
    return { paths, entries: merged };
  }

  private async parseLogFile(path: string): Promise<LogEntry[]> {
    const content = await readFile(path, 'utf8');
    const parser = new LogParser(path, 1);
    parser.feed(content);
    parser.feed('\n'); // ensure the last line is flushed even without a trailing newline
    parser.flushAll();
    return parser.drain();
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
