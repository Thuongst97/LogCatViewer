import { readdir, access } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { shell } from 'electron';
import { LOG_FILE_EXTENSIONS, type ExploreEntry } from '@shared/types';

/**
 * Powers the sidebar's Explore tab — a DLT-Viewer-style folder tree for
 * navigating the local filesystem. Lists directories always, and files only
 * when they look like a log (LOG_FILE_EXTENSIONS) — everything else would
 * just be clutter you can't do anything with here.
 */
export class FileSystemService {
  /** Drive roots on Windows (there's no cross-platform "list drives" API in
   *  Node, so this is the standard approach: probe each letter). On other
   *  platforms there's just the one root. */
  async listRoots(): Promise<ExploreEntry[]> {
    if (process.platform !== 'win32') {
      return [{ name: '/', path: '/', kind: 'directory' }];
    }
    const candidates = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => `${letter}:\\`);
    const checks = await Promise.all(
      candidates.map(async (root) => {
        try {
          await access(root);
          return root;
        } catch {
          return null;
        }
      })
    );
    return checks
      .filter((root): root is string => root !== null)
      .map((root) => ({ name: root, path: root, kind: 'directory' as const }));
  }

  /** Immediate children of `path`: subdirectories, plus files whose extension is
   *  a recognized log format. Directories first, each group alphabetical — the
   *  conventional file-explorer sort. A permission-denied or otherwise unreadable
   *  folder resolves to an empty list rather than throwing, so the tree stays
   *  usable even when it hits a folder it can't read. */
  async listChildren(path: string): Promise<ExploreEntry[]> {
    try {
      const entries = await readdir(path, { withFileTypes: true });
      const directories = entries
        .filter((entry) => entry.isDirectory())
        .map((entry): ExploreEntry => ({ name: entry.name, path: join(path, entry.name), kind: 'directory' }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      const files = entries
        .filter((entry) => entry.isFile() && LOG_FILE_EXTENSIONS.includes(extname(entry.name).toLowerCase()))
        .map((entry): ExploreEntry => ({ name: entry.name, path: join(path, entry.name), kind: 'file' }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      return [...directories, ...files];
    } catch {
      return [];
    }
  }

  async openInExplorer(path: string): Promise<void> {
    await shell.openPath(path);
  }
}
