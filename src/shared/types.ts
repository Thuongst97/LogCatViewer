// Shared type contracts between main, preload, and renderer.
// Kept dependency-free so it can be imported from any of the three worlds.

export type LogLevel = 'V' | 'D' | 'I' | 'W' | 'E' | 'F' | 'S';

export interface LogEntry {
  /** Monotonically increasing id assigned at capture time (not the logcat line number). */
  id: number;
  /** "MM-DD" */
  date: string;
  /** "HH:MM:SS.mmm" */
  time: string;
  pid: number;
  tid: number;
  level: LogLevel;
  tag: string;
  /** First physical line of the message. */
  message: string;
  /** Additional unheadered lines that followed (stack traces, multi-line dumps). */
  continuation: string[];
  /** The original, unmodified line(s) exactly as adb printed them. */
  raw: string;
  deviceId: string;
}

export type FilterType = 'positive' | 'negative' | 'marker';

export interface FilterFieldText {
  value: string;
  enabled: boolean;
  regex?: boolean;
  ignoreCase?: boolean;
}

export interface FilterFieldNumber {
  value: number | null;
  enabled: boolean;
}

export interface FilterFieldLevel {
  value: LogLevel;
  enabled: boolean;
}

export interface Filter {
  id: string;
  name: string;
  active: boolean;
  type: FilterType;
  /** Required when type === 'marker'; also usable as the "swatch" shown in the sidebar for any type. */
  color: string;
  tag: FilterFieldText;
  pid: FilterFieldNumber;
  message: FilterFieldText;
  minLevel: FilterFieldLevel;
  process: FilterFieldText;
}

export type DeviceState = 'device' | 'offline' | 'unauthorized' | 'connecting';

export interface Device {
  serial: string;
  model: string;
  androidVersion?: string;
  state: DeviceState;
}

export type CaptureState = 'idle' | 'starting' | 'capturing' | 'paused' | 'reconnecting' | 'error';

export interface ProjectFile {
  name: string;
  createdAt: string;
  modifiedAt: string;
  filters: Filter[];
}

/** One node in the Explore tab's filesystem tree (a DLT-Viewer-style directory
 *  browser). Directories are always listed; files are listed too, but only
 *  when their extension is a recognized log format (see LOG_FILE_EXTENSIONS)
 *  — double-clicking one of those opens it directly in the log table, the
 *  same as File > Open Log File… Any other file type is filtered out rather
 *  than shown as inert clutter. */
export interface ExploreEntry {
  name: string;
  path: string;
  kind: 'directory' | 'file';
}

/** File extensions the Explore tree will show and let you double-click open. */
export const LOG_FILE_EXTENSIONS = ['.log', '.txt'];

export type ThemePreference = 'light' | 'dark' | 'system';

/** The 7 columns the log table can show. `message` can't be hidden — it's the one
 *  column guaranteed to always carry content, so hiding everything is impossible. */
export type ColumnKey = 'index' | 'time' | 'pid' | 'tid' | 'level' | 'tag' | 'message';
/** Every column except `message` has a user-adjustable pixel width; `message` always
 *  fills whatever space is left (plan follow-up: "columns shall expand flexibly"). */
export type ResizableColumnKey = Exclude<ColumnKey, 'message'>;

export const COLUMN_ORDER: ColumnKey[] = ['index', 'time', 'pid', 'tid', 'level', 'tag', 'message'];
export const RESIZABLE_COLUMNS: ResizableColumnKey[] = ['index', 'time', 'pid', 'tid', 'level', 'tag'];

export const COLUMN_LABELS: Record<ColumnKey, string> = {
  index: 'Index',
  time: 'Time',
  pid: 'PID',
  tid: 'TID',
  level: 'Level',
  tag: 'Tag',
  message: 'Message'
};

export interface TableSettings {
  columns: Record<ColumnKey, boolean>;
  columnWidths: Record<ResizableColumnKey, number>;
  /** Table text size in px (mirrors DLT Viewer's "Table font" size — see plan follow-up;
   *  the font family itself stays IBM Plex Mono, matching the approved design). */
  fontSize: number;
  /** Row height in px (mirrors DLT Viewer's "Table section height"). */
  rowHeight: number;
}

export const DEFAULT_TABLE_SETTINGS: TableSettings = {
  columns: { index: true, time: true, pid: true, tid: true, level: true, tag: true, message: true },
  columnWidths: { index: 60, time: 96, pid: 56, tid: 56, level: 60, tag: 150 },
  fontSize: 12,
  rowHeight: 26
};

export interface AppSettings {
  theme: ThemePreference;
  adbPath: string | null;
  bufferCapacity: number;
  recentDeviceSerials: string[];
  recentProjectPaths: string[];
  autoscroll: boolean;
  table: TableSettings;
  /** The working filter set, persisted so it survives an app restart. `null` means
   *  "never customized yet" — the app falls back to its built-in starter filters
   *  instead of hydrating an empty list (see filterStore.ts). */
  filters: Filter[] | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  adbPath: null,
  bufferCapacity: 100_000,
  recentDeviceSerials: [],
  recentProjectPaths: [],
  autoscroll: true,
  table: DEFAULT_TABLE_SETTINGS,
  filters: null
};

export const LOG_LEVELS: LogLevel[] = ['V', 'D', 'I', 'W', 'E', 'F'];

export const LOG_LEVEL_RANK: Record<LogLevel, number> = {
  V: 0,
  D: 1,
  I: 2,
  W: 3,
  E: 4,
  F: 5,
  S: 6
};

export function createEmptyFilter(overrides?: Partial<Filter>): Filter {
  return {
    id: `filter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: 'New Filter',
    active: true,
    type: 'positive',
    color: '#3d8bef',
    tag: { value: '', enabled: false },
    pid: { value: null, enabled: false },
    message: { value: '', enabled: false, regex: false, ignoreCase: true },
    minLevel: { value: 'V', enabled: false },
    process: { value: '', enabled: false },
    ...overrides
  };
}
