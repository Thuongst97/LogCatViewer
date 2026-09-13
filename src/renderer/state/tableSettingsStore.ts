// Log table display preferences — which columns show, their widths, text size,
// and row height. Mirrors DLT Viewer's Settings > Project Table tab. Persisted
// via SettingsService (main process), hydrated once at boot and thereafter
// mutated (and persisted) through this store's actions from wherever the user
// changes them — the Settings dialog's Table tab, or a header column drag.
import { create } from 'zustand';
import {
  DEFAULT_TABLE_SETTINGS,
  type ColumnKey,
  type ResizableColumnKey,
  type TableSettings
} from '@shared/types';

export const MIN_COLUMN_WIDTH = 32;
// Raised from 500 so Message — now a fixed, resizable column instead of an
// auto-filling one (see ResizableColumnKey) — has room to widen well past a
// short fixed-width column's range; the table scrolls horizontally past
// whatever this is set to (see LogTable/SearchResultsDock).
export const MAX_COLUMN_WIDTH = 1200;
export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 18;
export const MIN_ROW_HEIGHT = 20;
export const MAX_ROW_HEIGHT = 40;

interface TableSettingsState extends TableSettings {
  hydrate: (settings: TableSettings) => void;
  setColumnVisible: (key: ColumnKey, visible: boolean) => void;
  setColumnWidth: (key: ResizableColumnKey, width: number) => void;
  setFontSize: (size: number) => void;
  setRowHeight: (height: number) => void;
  resetToDefaults: () => void;
}

function persist(settings: TableSettings): void {
  window.api.settings.set({ table: settings });
}

/** Pulls just the plain-data TableSettings fields out of the store — never spread
 *  `get()` directly into an IPC payload, it also carries these action functions. */
function snapshot(state: TableSettingsState): TableSettings {
  return { columns: state.columns, columnWidths: state.columnWidths, fontSize: state.fontSize, rowHeight: state.rowHeight };
}

export const useTableSettingsStore = create<TableSettingsState>((set, get) => ({
  ...DEFAULT_TABLE_SETTINGS,

  // A settings file saved before `message` became a resizable column has no
  // width for it — fall back to the default rather than hydrating `undefined`
  // into columnWidths.message (every other saved field still wins as-is).
  hydrate: (settings) =>
    set({ ...settings, columnWidths: { ...DEFAULT_TABLE_SETTINGS.columnWidths, ...settings.columnWidths } }),

  setColumnVisible: (key, visible) => {
    // `message` is intentionally not exposed as toggleable in the UI, but guard here
    // too so a stray call can never leave the table with nothing to show.
    if (key === 'message' && !visible) return;
    const columns = { ...get().columns, [key]: visible };
    set({ columns });
    persist({ ...snapshot(get()), columns });
  },

  setColumnWidth: (key, width) => {
    const clamped = Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(width)));
    const columnWidths = { ...get().columnWidths, [key]: clamped };
    set({ columnWidths });
    persist({ ...snapshot(get()), columnWidths });
  },

  setFontSize: (size) => {
    const clamped = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size)));
    set({ fontSize: clamped });
    persist({ ...snapshot(get()), fontSize: clamped });
  },

  setRowHeight: (height) => {
    const clamped = Math.min(MAX_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, Math.round(height)));
    set({ rowHeight: clamped });
    persist({ ...snapshot(get()), rowHeight: clamped });
  },

  resetToDefaults: () => {
    set(DEFAULT_TABLE_SETTINGS);
    persist(DEFAULT_TABLE_SETTINGS);
  }
}));
