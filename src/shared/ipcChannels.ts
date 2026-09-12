// Single source of truth for IPC channel names and their payload shapes.
// main/ipc/registerIpcHandlers.ts and preload/index.ts must both stay in
// sync with this file — that's the whole point of keeping it here instead
// of inlining string literals on both sides.
import type {
  AppSettings,
  Device,
  ExploreEntry,
  LogEntry,
  ProjectFile
} from './types';

export const IpcChannels = {
  // Renderer -> Main (invoke/handle, request-response)
  DevicesList: 'devices:list',
  DevicesRefresh: 'devices:refresh',
  CaptureStart: 'capture:start',
  CapturePause: 'capture:pause',
  CaptureResume: 'capture:resume',
  CaptureStop: 'capture:stop',
  CaptureClearDeviceBuffer: 'capture:clear-device-buffer',
  SettingsGet: 'settings:get',
  SettingsSet: 'settings:set',
  FileOpenLogDialog: 'file:open-log-dialog',
  FileOpenLogAtPath: 'file:open-log-at-path',
  FileOpenProjectDialog: 'file:open-project-dialog',
  FileSaveProjectDialog: 'file:save-project-dialog',
  FileSaveProject: 'file:save-project',
  FileSaveLogDialog: 'file:save-log-dialog',
  FileSaveLog: 'file:save-log',
  ClipboardWriteText: 'clipboard:write-text',
  FsListRoots: 'fs:list-roots',
  FsListChildren: 'fs:list-children',
  FsOpenInExplorer: 'fs:open-in-explorer',

  // Main -> Renderer (send/on, fire-and-forget events)
  DevicesChanged: 'devices:changed',
  LogBatch: 'log:batch',
  CaptureStateChanged: 'capture:state-changed',
  CaptureError: 'capture:error'
} as const;

export interface CaptureStartPayload {
  serial: string;
}

export interface SaveProjectPayload {
  path: string;
  project: ProjectFile;
}

export interface SaveLogPayload {
  path: string;
  entries: LogEntry[];
}

// Typed surface exposed on `window.api` by the preload script.
export interface RendererApi {
  devices: {
    list: () => Promise<Device[]>;
    refresh: () => Promise<void>;
    onChanged: (cb: (devices: Device[]) => void) => () => void;
  };
  capture: {
    start: (serial: string) => Promise<void>;
    pause: () => Promise<void>;
    resume: () => Promise<void>;
    stop: () => Promise<void>;
    clearDeviceBuffer: (serial: string) => Promise<void>;
    onLogBatch: (cb: (entries: LogEntry[]) => void) => () => void;
    onStateChanged: (cb: (state: string) => void) => () => void;
    onError: (cb: (message: string) => void) => () => void;
  };
  settings: {
    get: () => Promise<AppSettings>;
    set: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  };
  files: {
    /** Multi-select — the picker allows choosing several log files at once,
     *  which are merged into a single chronologically-sorted timeline. */
    openLogDialog: () => Promise<{ paths: string[]; entries: LogEntry[] } | null>;
    /** Reads and parses a log file whose path is already known (e.g. a
     *  double-click in the Explore tab) — no native picker involved. Resolves
     *  null if the file can't be read (deleted, permissions, ...). */
    openLogAtPath: (path: string) => Promise<{ path: string; entries: LogEntry[] } | null>;
    openProjectDialog: () => Promise<ProjectFile | null>;
    saveProjectDialog: (defaultName: string) => Promise<string | null>;
    saveProject: (path: string, project: ProjectFile) => Promise<void>;
    saveLogDialog: (defaultName: string) => Promise<string | null>;
    saveLogFile: (path: string, entries: LogEntry[]) => Promise<void>;
  };
  clipboard: {
    /** Uses Electron's native clipboard module (main process) rather than the
     *  renderer's web Clipboard API, which is subject to browser permission
     *  policies that don't apply the same way inside a trusted app shell. */
    writeText: (text: string) => Promise<void>;
  };
  fs: {
    listRoots: () => Promise<ExploreEntry[]>;
    listChildren: (path: string) => Promise<ExploreEntry[]>;
    openInExplorer: (path: string) => Promise<void>;
  };
}
