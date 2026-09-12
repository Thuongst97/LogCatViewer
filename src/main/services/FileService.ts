import { dialog, type BrowserWindow } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import type { LogEntry, ProjectFile } from '@shared/types';
import { LogParser } from './LogParser';

/** Native open/save dialogs and disk I/O for log files and project files. */
export class FileService {
  async openLogDialog(window: BrowserWindow): Promise<{ path: string; entries: LogEntry[] } | null> {
    const result = await dialog.showOpenDialog(window, {
      title: 'Open Log File',
      filters: [
        { name: 'Logcat / Text', extensions: ['txt', 'log'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const path = result.filePaths[0];
    const content = await readFile(path, 'utf8');
    const parser = new LogParser(path, 1);
    parser.feed(content);
    parser.feed('\n'); // ensure the last line is flushed even without a trailing newline
    parser.flushAll();
    const entries = parser.drain();
    return { path, entries };
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
}
