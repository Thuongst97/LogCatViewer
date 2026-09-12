import { app, BrowserWindow, Menu, nativeTheme, shell } from 'electron';
import { join } from 'node:path';
import { AdbService } from './services/AdbService';
import { FileService } from './services/FileService';
import { ExportService } from './services/ExportService';
import { SettingsService } from './services/SettingsService';
import { registerIpcHandlers } from './ipc/registerIpcHandlers';
import { buildApplicationMenu } from './menu';
import { WindowState } from './windowState';

let mainWindow: BrowserWindow | null = null;

const settings = new SettingsService();
const windowState = new WindowState();
const fileService = new FileService();
const exportService = new ExportService();
let adbService: AdbService;

async function createWindow(): Promise<void> {
  const bounds = windowState.getBounds();
  const initialSettings = settings.get();
  nativeTheme.themeSource = initialSettings.theme;

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1d23' : '#eef0f3',
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (bounds.isMaximized) mainWindow.maximize();
  windowState.track(mainWindow);

  mainWindow.on('ready-to-show', () => mainWindow?.show());

  // Open any target="_blank"/external link in the OS browser instead of a new Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  Menu.setApplicationMenu(buildApplicationMenu(() => mainWindow));

  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function bootstrap(): Promise<void> {
  const configuredPath = settings.get().adbPath;
  const resolvedPath = configuredPath ?? (await AdbService.autoDetect());
  adbService = new AdbService(resolvedPath ?? 'adb');
  if (resolvedPath && resolvedPath !== configuredPath) {
    settings.set({ adbPath: resolvedPath });
  }
  adbService.startTrackingDevices();
  await adbService.listDevicesOnce();

  registerIpcHandlers(() => mainWindow, {
    adb: adbService,
    files: fileService,
    exportSvc: exportService,
    settings
  });
}

app.whenReady().then(async () => {
  await bootstrap();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  adbService?.dispose();
});
