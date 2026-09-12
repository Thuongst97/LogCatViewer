import Store from 'electron-store';
import { screen, type BrowserWindow } from 'electron';

interface WindowStateShape {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized: boolean;
}

const DEFAULTS: WindowStateShape = { width: 1440, height: 900, isMaximized: false };

/** Remembers window size/position/maximized state across launches. */
export class WindowState {
  private store = new Store<WindowStateShape>({ name: 'window-state', defaults: DEFAULTS });

  getBounds(): WindowStateShape {
    const saved = this.store.store;
    const displays = screen.getAllDisplays();
    const fitsOnAScreen = displays.some((d) => {
      if (saved.x === undefined || saved.y === undefined) return false;
      const area = d.workArea;
      return saved.x >= area.x && saved.y >= area.y && saved.x < area.x + area.width && saved.y < area.y + area.height;
    });
    return fitsOnAScreen ? saved : { ...DEFAULTS };
  }

  track(window: BrowserWindow): void {
    const persist = () => {
      if (window.isDestroyed()) return;
      const isMaximized = window.isMaximized();
      const bounds = window.getNormalBounds();
      this.store.set({
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        isMaximized
      });
    };
    window.on('resize', persist);
    window.on('move', persist);
    window.on('close', persist);
  }
}
