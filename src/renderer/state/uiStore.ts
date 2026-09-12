import { create } from 'zustand';
import type { ThemePreference } from '@shared/types';

export type DialogKind = 'filterEditor' | 'export' | 'deviceSelector' | 'settings' | 'logDetail' | null;
export type EffectiveTheme = 'light' | 'dark';

export const SEARCH_RESULTS_MIN_HEIGHT = 80;
export const SEARCH_RESULTS_MAX_HEIGHT = 480;
export const SEARCH_RESULTS_DEFAULT_HEIGHT = 150;
export const SEARCH_RESULTS_HEADER_HEIGHT = 29;

export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 560;
export const SIDEBAR_DEFAULT_WIDTH = 280;

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

  setThemePreference: (theme: ThemePreference) => void;
  setEffectiveTheme: (theme: EffectiveTheme) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  toggleSearchResults: () => void;
  /** Explicit expand — used when a search is actually submitted (Enter / search
   *  button), as opposed to toggleSearchResults' collapse/expand chevron click. */
  expandSearchResults: () => void;
  setSearchResultsHeight: (height: number) => void;
  openFilterEditor: (filterId: string | null) => void;
  openExportDialog: () => void;
  openDeviceSelector: () => void;
  openSettingsDialog: () => void;
  openLogDetailDialog: () => void;
  closeDialog: () => void;
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

  setThemePreference: (theme) => set({ themePreference: theme }),
  setEffectiveTheme: (theme) => set({ effectiveTheme: theme }),
  toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
  setSidebarWidth: (width) => set({ sidebarWidth: Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width)) }),
  toggleSearchResults: () => set((s) => ({ searchResultsVisible: !s.searchResultsVisible })),
  expandSearchResults: () => set({ searchResultsVisible: true }),
  setSearchResultsHeight: (height) =>
    set({ searchResultsHeight: Math.min(SEARCH_RESULTS_MAX_HEIGHT, Math.max(SEARCH_RESULTS_MIN_HEIGHT, height)) }),
  openFilterEditor: (filterId) => set({ activeDialog: 'filterEditor', editingFilterId: filterId }),
  openExportDialog: () => set({ activeDialog: 'export' }),
  openDeviceSelector: () => set({ activeDialog: 'deviceSelector' }),
  openSettingsDialog: () => set({ activeDialog: 'settings' }),
  openLogDetailDialog: () => set({ activeDialog: 'logDetail' }),
  closeDialog: () => set({ activeDialog: null, editingFilterId: null })
}));

/** Applies the resolved theme to <html data-theme="...">. Call whenever effectiveTheme changes. */
export function applyThemeToDocument(theme: EffectiveTheme): void {
  document.documentElement.setAttribute('data-theme', theme);
}
