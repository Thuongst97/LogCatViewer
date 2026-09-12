import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannels } from '@shared/ipcChannels';
import type { RendererApi } from '@shared/ipcChannels';
import type { AppSettings, Device, ExploreEntry, LogEntry, ProjectFile } from '@shared/types';

/** Subscribes to a main->renderer event channel and returns an unsubscribe function. */
function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: RendererApi = {
  devices: {
    list: () => ipcRenderer.invoke(IpcChannels.DevicesList),
    refresh: () => ipcRenderer.invoke(IpcChannels.DevicesRefresh),
    onChanged: (cb: (devices: Device[]) => void) => subscribe(IpcChannels.DevicesChanged, cb)
  },
  capture: {
    start: (serial: string) => ipcRenderer.invoke(IpcChannels.CaptureStart, serial),
    pause: () => ipcRenderer.invoke(IpcChannels.CapturePause),
    resume: () => ipcRenderer.invoke(IpcChannels.CaptureResume),
    stop: () => ipcRenderer.invoke(IpcChannels.CaptureStop),
    clearDeviceBuffer: (serial: string) => ipcRenderer.invoke(IpcChannels.CaptureClearDeviceBuffer, serial),
    onLogBatch: (cb: (entries: LogEntry[]) => void) => subscribe(IpcChannels.LogBatch, cb),
    onStateChanged: (cb: (state: string) => void) => subscribe(IpcChannels.CaptureStateChanged, cb),
    onError: (cb: (message: string) => void) => subscribe(IpcChannels.CaptureError, cb)
  },
  settings: {
    get: () => ipcRenderer.invoke(IpcChannels.SettingsGet),
    set: (patch: Partial<AppSettings>) => ipcRenderer.invoke(IpcChannels.SettingsSet, patch)
  },
  files: {
    openLogDialog: () => ipcRenderer.invoke(IpcChannels.FileOpenLogDialog),
    openLogAtPath: (path: string) => ipcRenderer.invoke(IpcChannels.FileOpenLogAtPath, path),
    openProjectDialog: () => ipcRenderer.invoke(IpcChannels.FileOpenProjectDialog),
    saveProjectDialog: (defaultName: string) => ipcRenderer.invoke(IpcChannels.FileSaveProjectDialog, defaultName),
    saveProject: (path: string, project: ProjectFile) =>
      ipcRenderer.invoke(IpcChannels.FileSaveProject, { path, project }),
    saveLogDialog: (defaultName: string) => ipcRenderer.invoke(IpcChannels.FileSaveLogDialog, defaultName),
    saveLogFile: (path: string, entries: LogEntry[]) => ipcRenderer.invoke(IpcChannels.FileSaveLog, { path, entries })
  },
  clipboard: {
    writeText: (text: string) => ipcRenderer.invoke(IpcChannels.ClipboardWriteText, text)
  },
  fs: {
    listRoots: (): Promise<ExploreEntry[]> => ipcRenderer.invoke(IpcChannels.FsListRoots),
    listChildren: (path: string): Promise<ExploreEntry[]> => ipcRenderer.invoke(IpcChannels.FsListChildren, path),
    openInExplorer: (path: string) => ipcRenderer.invoke(IpcChannels.FsOpenInExplorer, path)
  }
};

/** Menu-triggered commands (see main/menu.ts) forwarded as a simple string event. */
function onMenuCommand(cb: (command: string) => void): () => void {
  return subscribe('menu:command', cb);
}

contextBridge.exposeInMainWorld('api', api);
contextBridge.exposeInMainWorld('menuEvents', { onCommand: onMenuCommand });
