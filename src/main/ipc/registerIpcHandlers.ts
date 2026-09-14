import { ipcMain, clipboard, type BrowserWindow } from 'electron';
import { IpcChannels, type OpenLogFilterConfig, type SaveLogPayload, type SaveProjectPayload } from '@shared/ipcChannels';
import type { AppSettings, Device, ExploreEntry, ProjectFile } from '@shared/types';
import { AdbService } from '../services/AdbService';
import { FileService } from '../services/FileService';
import { SettingsService } from '../services/SettingsService';
import { FileSystemService } from '../services/FileSystemService';

export interface AppServices {
  adb: AdbService;
  files: FileService;
  settings: SettingsService;
  fs: FileSystemService;
}

/**
 * Wires every renderer-facing IPC channel declared in shared/ipcChannels.ts.
 * Request/response channels use ipcMain.handle; AdbService's events are
 * forwarded to the renderer as one-way `send` messages.
 */
export function registerIpcHandlers(getWindow: () => BrowserWindow | null, services: AppServices): void {
  const { adb, files, settings, fs } = services;

  ipcMain.handle(IpcChannels.DevicesList, async (): Promise<Device[]> => {
    const cached = adb.getCachedDevices();
    return cached.length > 0 ? cached : adb.listDevicesOnce();
  });

  ipcMain.handle(IpcChannels.DevicesRefresh, async (): Promise<void> => {
    await adb.listDevicesOnce();
  });

  ipcMain.handle(IpcChannels.CaptureStart, async (_e, serial: string): Promise<void> => {
    settings.rememberDevice(serial);
    await adb.startCapture(serial);
  });

  ipcMain.handle(IpcChannels.CapturePause, async (): Promise<void> => {
    adb.pause();
  });

  ipcMain.handle(IpcChannels.CaptureResume, async (): Promise<void> => {
    adb.resume();
  });

  ipcMain.handle(IpcChannels.CaptureStop, async (): Promise<void> => {
    adb.stop();
  });

  ipcMain.handle(IpcChannels.CaptureClearDeviceBuffer, async (_e, serial: string): Promise<void> => {
    await adb.clearDeviceBuffer(serial);
  });

  ipcMain.handle(IpcChannels.SettingsGet, async (): Promise<AppSettings> => settings.get());

  ipcMain.handle(IpcChannels.SettingsSet, async (_e, patch: Partial<AppSettings>): Promise<AppSettings> => {
    const updated = settings.set(patch);
    if (patch.adbPath) adb.setAdbPath(patch.adbPath);
    return updated;
  });

  ipcMain.handle(IpcChannels.FileShowOpenLogDialog, async (): Promise<string[] | null> => {
    const window = getWindow();
    if (!window) return null;
    return files.showOpenLogDialog(window);
  });

  ipcMain.handle(
    IpcChannels.FileOpenLogPaths,
    async (_e, paths: string[], filterConfig?: OpenLogFilterConfig): Promise<void> => {
      await files.openLogPaths(
        paths,
        (batch) => {
          getWindow()?.webContents.send(IpcChannels.FileOpenBatch, batch);
        },
        (processedBytes, totalBytes) => {
          getWindow()?.webContents.send(IpcChannels.FileOpenProgress, { processedBytes, totalBytes });
        },
        filterConfig
      );
    }
  );

  ipcMain.handle(IpcChannels.FileOpenProjectDialog, async (): Promise<ProjectFile | null> => {
    const window = getWindow();
    if (!window) return null;
    return files.openProjectDialog(window);
  });

  ipcMain.handle(IpcChannels.FileSaveProjectDialog, async (_e, defaultName: string): Promise<string | null> => {
    const window = getWindow();
    if (!window) return null;
    const path = await files.saveProjectDialog(window, defaultName);
    if (path) settings.rememberProjectPath(path);
    return path;
  });

  ipcMain.handle(IpcChannels.FileSaveProject, async (_e, payload: SaveProjectPayload): Promise<void> => {
    await files.saveProject(payload.path, payload.project);
  });

  ipcMain.handle(IpcChannels.FileSaveLogDialog, async (_e, defaultName: string): Promise<string | null> => {
    const window = getWindow();
    if (!window) return null;
    return files.saveLogDialog(window, defaultName);
  });

  ipcMain.handle(IpcChannels.FileSaveLog, async (_e, payload: SaveLogPayload): Promise<void> => {
    await files.saveLogFile(payload.path, payload.text, payload.append);
  });

  ipcMain.handle(IpcChannels.ClipboardWriteText, async (_e, text: string): Promise<void> => {
    clipboard.writeText(text);
  });

  ipcMain.handle(IpcChannels.FsListRoots, async (): Promise<ExploreEntry[]> => fs.listRoots());

  ipcMain.handle(IpcChannels.FsListChildren, async (_e, path: string): Promise<ExploreEntry[]> => fs.listChildren(path));

  ipcMain.handle(IpcChannels.FsOpenInExplorer, async (_e, path: string): Promise<void> => {
    await fs.openInExplorer(path);
  });

  // ---- Forward AdbService events to the renderer ----
  adb.on('devices', (devices: Device[]) => {
    getWindow()?.webContents.send(IpcChannels.DevicesChanged, devices);
  });
  adb.on('logBatch', (entries) => {
    getWindow()?.webContents.send(IpcChannels.LogBatch, entries);
  });
  adb.on('captureState', (state: string) => {
    getWindow()?.webContents.send(IpcChannels.CaptureStateChanged, state);
  });
  adb.on('captureError', (message: string) => {
    getWindow()?.webContents.send(IpcChannels.CaptureError, message);
  });
}
