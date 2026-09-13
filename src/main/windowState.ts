import Store from 'electron-store';
import { screen, type BrowserWindow } from 'electron';

interface WindowStateShape {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized: boolean;
}


const STORE_DEFAULTS: WindowStateShape = { width: 1280, height: 800, isMaximized: false };
const DEFAULT_SIZE_RATIO = 0.75;
const MIN_DEFAULT_WIDTH = 1024;
const MIN_DEFAULT_HEIGHT = 640;

function getDefaultBounds(): WindowStateShape {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  return {
    width: Math.max(MIN_DEFAULT_WIDTH, Math.round(screenWidth * DEFAULT_SIZE_RATIO)),
    height: Math.max(MIN_DEFAULT_HEIGHT, Math.round(screenHeight * DEFAULT_SIZE_RATIO)),
    isMaximized: false
  };
}

/** Remembers window size/position/maximized state across launches. */
export class WindowState {
  private store = new Store<WindowStateShape>({ name: 'window-state', defaults: STORE_DEFAULTS });

  getBounds(): WindowStateShape {
    const saved = this.store.store;
    const displays = screen.getAllDisplays();
    const fitsOnAScreen = displays.some((d) => {
      if (saved.x === undefined || saved.y === undefined) return false;
      const area = d.workArea;
      return saved.x >= area.x && saved.y >= area.y && saved.x < area.x + area.width && saved.y < area.y + area.height;
    });
    return fitsOnAScreen ? saved : getDefaultBounds();
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
