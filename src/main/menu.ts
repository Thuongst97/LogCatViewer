import { Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';

/** Sends a lightweight command to the renderer, which owns the actual behavior (see App.tsx). */
function send(window: BrowserWindow, command: string) {
  window.webContents.send('menu:command', command);
}

export function buildApplicationMenu(getWindow: () => BrowserWindow | null): Menu {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open Log File…', accelerator: 'CmdOrCtrl+O', click: () => withWindow(getWindow, (w) => send(w, 'file:open-log')) },
        { label: 'Save Log…', accelerator: 'CmdOrCtrl+S', click: () => withWindow(getWindow, (w) => send(w, 'file:save-log')) },
        { type: 'separator' },
        { label: 'Open Project…', click: () => withWindow(getWindow, (w) => send(w, 'file:open-project')) },
        { label: 'Save Project…', accelerator: 'CmdOrCtrl+Shift+S', click: () => withWindow(getWindow, (w) => send(w, 'file:save-project')) },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => withWindow(getWindow, (w) => send(w, 'file:settings')) },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [{ label: 'Find', accelerator: 'CmdOrCtrl+F', click: () => withWindow(getWindow, (w) => send(w, 'edit:find')) }]
    },
    {
      label: 'Capture',
      submenu: [
        { label: 'Start', click: () => withWindow(getWindow, (w) => send(w, 'capture:start')) },
        { label: 'Pause / Resume', click: () => withWindow(getWindow, (w) => send(w, 'capture:toggle-pause')) },
        { label: 'Stop', click: () => withWindow(getWindow, (w) => send(w, 'capture:stop')) },
        { label: 'Clear View', accelerator: 'CmdOrCtrl+K', click: () => withWindow(getWindow, (w) => send(w, 'capture:clear')) }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Theme', accelerator: 'CmdOrCtrl+Shift+D', click: () => withWindow(getWindow, (w) => send(w, 'view:toggle-theme')) },
        { label: 'Toggle Sidebar', click: () => withWindow(getWindow, (w) => send(w, 'view:toggle-sidebar')) },
        { label: 'Toggle Search Results', click: () => withWindow(getWindow, (w) => send(w, 'view:toggle-search-results')) },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: () => shell.openExternal('https://github.com/')
        },
        { label: 'About LogCat Viewer', click: () => withWindow(getWindow, (w) => send(w, 'help:about')) }
      ]
    }
  ];

  return Menu.buildFromTemplate(template);
}

function withWindow(getWindow: () => BrowserWindow | null, fn: (w: BrowserWindow) => void): void {
  const window = getWindow();
  if (window) fn(window);
}
