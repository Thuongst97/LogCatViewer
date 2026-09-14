import { create } from 'zustand';
import type { Filter, ThemePreference } from '@shared/types';

export type DialogKind = 'filterEditor' | 'deviceSelector' | 'settings' | 'logDetail' | null;
export type EffectiveTheme = 'light' | 'dark';

export const SEARCH_RESULTS_MIN_HEIGHT = 80;
export const SEARCH_RESULTS_MAX_HEIGHT = 480;
export const SEARCH_RESULTS_DEFAULT_HEIGHT = 150;
export const SEARCH_RESULTS_HEADER_HEIGHT = 29;

export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 560;
export const SIDEBAR_DEFAULT_WIDTH = 210;

/** A file open at least this big replaces the log table with a loading card
 *  until it finishes (see FileLoadingOverlay). Rendering a table that's being
 *  appended to ~25 times a second, while it grows into the millions of rows,
 *  is what made controls stutter and look like they'd vanished partway
 *  through a large load — and nothing readable is happening on a table
 *  scrolling past at that rate anyway. Below this size a load finishes fast
 *  enough that a card would just flash, so the table stays put. */
export const LARGE_FILE_OPEN_BYTES = 100 * 1024 * 1024;

interface UiState {
  themePreference: ThemePreference;
  effectiveTheme: EffectiveTheme;
  sidebarVisible: boolean;
  /** Drag-resized sidebar width (plan follow-up: long Explore tree names were
   *  getting truncated at the old fixed 280px). */
  sidebarWidth: number;
  searchResultsVisible: boolean;
  /** Drag-resized height of the dock's body while expanded (plan follow-up: user asked for
   *  the Search Results dock to be resizable, not just a fixed-height collapse toggle). */
  searchResultsHeight: number;
  activeDialog: DialogKind;
  editingFilterId: string | null;
  /** Initial field values for a brand-new filter (editingFilterId === null) —
   *  used by "Add Filter" on a log row's right-click menu to pre-fill Tag and
   *  Message from that line instead of opening a blank form. Ignored when
   *  editingFilterId is set (editing an existing filter uses its own values). */
  newFilterPrefill: Partial<Filter> | null;
  /** 0-100 while a file open is streaming in, null otherwise — read by the
   *  Toolbar to show a progress bar regardless of which UI triggered the open
   *  (toolbar button, File menu, or the Explore tab). */
  fileOpenProgress: number | null;
  /** Combined size of whatever's being opened, 0 when nothing is — what
   *  decides whether this load is big enough to hide the table behind a
   *  loading card (see LARGE_FILE_OPEN_BYTES). */
  fileOpenTotalBytes: number;

  setThemePreference: (theme: ThemePreference) => void;
  setEffectiveTheme: (theme: EffectiveTheme) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  toggleSearchResults: () => void;
  /** Explicit expand — used when a search is actually submitted (Enter / search
   *  button), as opposed to toggleSearchResults' collapse/expand chevron click. */
  expandSearchResults: () => void;
  setSearchResultsHeight: (height: number) => void;
  openFilterEditor: (filterId: string | null, prefill?: Partial<Filter>) => void;
  openDeviceSelector: () => void;
  openSettingsDialog: () => void;
  openLogDetailDialog: () => void;
  closeDialog: () => void;
  /** `totalBytes` is optional because the very first call happens before the
   *  main process has stat'd anything — omitting it keeps whatever size a
   *  previous progress tick already reported. */
  setFileOpenProgress: (percent: number | null, totalBytes?: number) => void;
}

export const useUiStore = create<UiState>((set) => ({
  themePreference: 'system',
  effectiveTheme: 'dark',
  sidebarVisible: true,
  sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
  // Collapsed by default — it expands on demand when a search is actually
  // submitted (plan follow-up), not just because a query is being typed.
  searchResultsVisible: false,
  searchResultsHeight: SEARCH_RESULTS_DEFAULT_HEIGHT,
  activeDialog: null,
  editingFilterId: null,
  newFilterPrefill: null,
  fileOpenProgress: null,
  fileOpenTotalBytes: 0,

  setThemePreference: (theme) => set({ themePreference: theme }),
  setEffectiveTheme: (theme) => set({ effectiveTheme: theme }),
  toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
  setSidebarWidth: (width) => set({ sidebarWidth: Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width)) }),
  toggleSearchResults: () => set((s) => ({ searchResultsVisible: !s.searchResultsVisible })),
  expandSearchResults: () => set({ searchResultsVisible: true }),
  setSearchResultsHeight: (height) =>
    set({ searchResultsHeight: Math.min(SEARCH_RESULTS_MAX_HEIGHT, Math.max(SEARCH_RESULTS_MIN_HEIGHT, height)) }),
  openFilterEditor: (filterId, prefill) => set({ activeDialog: 'filterEditor', editingFilterId: filterId, newFilterPrefill: prefill ?? null }),
  openDeviceSelector: () => set({ activeDialog: 'deviceSelector' }),
  openSettingsDialog: () => set({ activeDialog: 'settings' }),
  openLogDetailDialog: () => set({ activeDialog: 'logDetail' }),
  closeDialog: () => set({ activeDialog: null, editingFilterId: null, newFilterPrefill: null }),
  setFileOpenProgress: (percent, totalBytes) =>
    set((s) => ({
      fileOpenProgress: percent,
      fileOpenTotalBytes: percent === null ? 0 : (totalBytes ?? s.fileOpenTotalBytes)
    }))
}));

/** Applies the resolved theme to <html data-theme="...">. Call whenever effectiveTheme changes. */
export function applyThemeToDocument(theme: EffectiveTheme): void {
  document.documentElement.setAttribute('data-theme', theme);
}
