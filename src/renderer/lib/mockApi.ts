// Fallback implementation of `window.api` used only when the app runs as a
// plain browser tab (via `npm run dev:renderer`) instead of inside Electron —
// i.e. purely for fast visual QA of the UI against the approved mockups
// without spawning a real adb process. Never bundled into the packaged app:
// electron's preload script always provides the real `window.api` first.
import { DEFAULT_SETTINGS, type AppSettings, type Device, type LogEntry } from '@shared/types';
import type { RendererApi } from '@shared/ipcChannels';

const SAMPLE_DEVICES: Device[] = [
  { serial: 'emulator-5554', model: 'Pixel 7 Pro', androidVersion: '14', state: 'device' },
  { serial: 'R5CT10ABCDE', model: 'Galaxy S23', androidVersion: '15', state: 'device' },
  { serial: 'emulator-5556', model: 'Pixel 6', androidVersion: '13', state: 'offline' }
];

type SampleLine = [tag: string, level: LogEntry['level'], message: string, pid: number, tid: number];

const SAMPLE_LINES: SampleLine[] = [
  ['ActivityManager', 'I', 'Displayed com.example.myapp/.MainActivity: +312ms', 512, 512],
  ['MyApp', 'D', 'onCreate() lifecycle started', 8421, 8421],
  ['MyApp/UI', 'D', 'Inflating layout activity_main.xml', 8421, 8455],
  ['WindowManager', 'I', 'setInsetsController for window MainActivity', 733, 733],
  ['MyApp/Network', 'V', 'Preparing request headers for /api/v2/sync', 8421, 8501],
  ['OkHttp', 'D', '--> POST https://api.example.com/v2/sync', 8421, 8501],
  ['Choreographer', 'W', 'Skipped 4 frames! The application may be doing too much work on its main thread.', 1204, 1204],
  ['MyApp/UI', 'D', 'RecyclerView adapter attached, 42 items', 8421, 8455],
  ['OkHttp', 'W', 'Slow network call: 407ms (threshold 300ms)', 8421, 8501],
  ['OkHttp', 'E', 'HTTP FAILED: java.net.SocketTimeoutException: timeout', 8421, 8501],
  ['MyApp', 'W', 'Retrying sync request, attempt 2 of 3', 8421, 8421],
  ['OkHttp', 'D', '<-- 200 OK https://api.example.com/v2/sync (429ms)', 8421, 8501],
  ['MyApp', 'I', 'Sync completed successfully, 18 records updated', 8421, 8421],
  ['MyApp', 'F', 'Fatal signal 11 (SIGSEGV), code 1, fault addr 0x0 in tid 8455', 8421, 8455],
  ['AndroidRuntime', 'E', 'FATAL EXCEPTION: main', 8421, 8421],
  ['AndroidRuntime', 'E', 'Process: com.example.myapp, PID: 8421', 8421, 8421]
];

let nextId = 15201;
let captureTimer: ReturnType<typeof setInterval> | null = null;
let paused = false;
const logBatchListeners = new Set<(entries: LogEntry[]) => void>();
const stateListeners = new Set<(state: string) => void>();
let settings: AppSettings = { ...DEFAULT_SETTINGS, theme: 'dark' };

function makeEntry(): LogEntry {
  const [tag, level, message, pid, tid] = SAMPLE_LINES[Math.floor(Math.random() * SAMPLE_LINES.length)];
  const now = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return {
    id: nextId++,
    date: `${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`,
    pid,
    tid,
    level,
    tag,
    message,
    continuation: [],
    raw: `${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${pid} ${tid} ${level} ${tag}: ${message}`,
    deviceId: 'emulator-5554'
  };
}

export const mockApi: RendererApi = {
  devices: {
    list: async () => SAMPLE_DEVICES,
    refresh: async () => {},
    onChanged: () => () => {}
  },
  capture: {
    start: async () => {
      paused = false;
      if (captureTimer) clearInterval(captureTimer);
      stateListeners.forEach((cb) => cb('capturing'));
      captureTimer = setInterval(() => {
        if (paused) return;
        const batch = [makeEntry()];
        logBatchListeners.forEach((cb) => cb(batch));
      }, 400);
    },
    pause: async () => {
      paused = true;
      stateListeners.forEach((cb) => cb('paused'));
    },
    resume: async () => {
      paused = false;
      stateListeners.forEach((cb) => cb('capturing'));
    },
    stop: async () => {
      if (captureTimer) clearInterval(captureTimer);
      captureTimer = null;
      stateListeners.forEach((cb) => cb('idle'));
    },
    clearDeviceBuffer: async () => {},
    onLogBatch: (cb) => {
      logBatchListeners.add(cb);
      return () => logBatchListeners.delete(cb);
    },
    onStateChanged: (cb) => {
      stateListeners.add(cb);
      return () => stateListeners.delete(cb);
    },
    onError: () => () => {}
  },
  settings: {
    get: async () => settings,
    set: async (patch) => {
      settings = { ...settings, ...patch };
      return settings;
    }
  },
  files: {
    openLogDialog: async () => null,
    openProjectDialog: async () => null,
    saveProjectDialog: async () => null,
    saveProject: async () => {}
  },
  export: {
    showSaveDialog: async () => null,
    run: async () => {}
  },
  clipboard: {
    // Best-effort in plain-browser preview mode — the real app routes this through
    // Electron's native clipboard module instead (see lib/clipboard.ts).
    writeText: async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Swallowed — this mock only exists for visual QA outside Electron.
      }
    }
  }
};

export function installMockApiIfNeeded(): void {
  if (typeof window !== 'undefined' && !window.api) {
    (window as unknown as { api: RendererApi }).api = mockApi;
  }
  if (typeof window !== 'undefined' && !window.menuEvents) {
    (window as unknown as { menuEvents: Window['menuEvents'] }).menuEvents = { onCommand: () => () => {} };
  }
}
