import { ipcMain, clipboard, type BrowserWindow } from 'electron';
import { IpcChannels, type ExportRunPayload, type SaveProjectPayload } from '@shared/ipcChannels';
import type { AppSettings, Device, ProjectFile } from '@shared/types';
import { AdbService } from '../services/AdbService';
import { FileService } from '../services/FileService';
import { ExportService } from '../services/ExportService';
import { SettingsService } from '../services/SettingsService';

export interface AppServices {
  adb: AdbService;
  files: FileService;
  exportSvc: ExportService;
  settings: SettingsService;
}

/**
 * Wires every renderer-facing IPC channel declared in shared/ipcChannels.ts.
 * Request/response channels use ipcMain.handle; AdbService's events are
 * forwarded to the renderer as one-way `send` messages.
 */
export function registerIpcHandlers(getWindow: () => BrowserWindow | null, services: AppServices): void {
  const { adb, files, exportSvc, settings } = services;

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

  ipcMain.handle(IpcChannels.FileOpenLogDialog, async () => {
    const window = getWindow();
    if (!window) return null;
    return files.openLogDialog(window);
  });

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

  ipcMain.handle(IpcChannels.ExportShowSaveDialog, async (_e, suggestedName: string, format: string) => {
    const window = getWindow();
    if (!window) return null;
    return exportSvc.showSaveDialog(window, suggestedName, format as never);
  });

  ipcMain.handle(IpcChannels.ExportRun, async (_e, payload: ExportRunPayload): Promise<void> => {
    await exportSvc.run(payload.options, payload.entries);
  });

  ipcMain.handle(IpcChannels.ClipboardWriteText, async (_e, text: string): Promise<void> => {
    clipboard.writeText(text);
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
