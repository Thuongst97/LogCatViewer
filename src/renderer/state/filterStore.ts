import { create } from 'zustand';
import { createEmptyFilter, LOG_LEVELS, type Filter, type LogLevel } from '@shared/types';

interface FilterState {
  filters: Filter[];
  /** Master "apply filters" switch (mirrors DLT Viewer's "Filters Enabled" checkbox):
   *  off bypasses the whole saved filter list — every line shows, unfiltered and
   *  uncolored — regardless of each filter's own active state. */
  filtersEnabled: boolean;
  /** Levels the user has toggled OFF via the search bar's quick V/D/I/W/E/F chips.
   *  This is a view-level filter layered on top of saved Filters (plan §11) — it is
   *  never persisted as part of a Filter or a project file. */
  quickLevelExclusions: Set<LogLevel>;
  /** Bound to the search input as the user types — never itself triggers a
   *  search. See `submittedSearchQuery` for what actually drives one. */
  searchQuery: string;
  /** The query the Search Results dock actually searches for — a full-buffer
   *  scan can mean cloning a million entries across to the search worker, so
   *  it only updates on an explicit submit (Enter / the search icon), not on
   *  every keystroke — see `submitSearchQuery`. */
  submittedSearchQuery: string;
  searchRegex: boolean;
  searchCaseSensitive: boolean;

  addFilter: (overrides?: Partial<Filter>) => Filter;
  updateFilter: (id: string, patch: Partial<Filter>) => void;
  removeFilter: (id: string) => void;
  toggleFilterActive: (id: string) => void;
  setAllFiltersActive: (active: boolean) => void;
  toggleFiltersEnabled: () => void;
  toggleQuickLevel: (level: LogLevel) => void;
  setSearchQuery: (query: string) => void;
  /** Commits the current `searchQuery` as `submittedSearchQuery`, actually
   *  running the search — call on Enter or the search icon. */
  submitSearchQuery: () => void;
  setSearchRegex: (value: boolean) => void;
  setSearchCaseSensitive: (value: boolean) => void;
  loadFilters: (filters: Filter[]) => void;
}

const STARTER_FILTERS: Filter[] = [
  createEmptyFilter({
    id: 'starter-errors',
    name: 'Errors & Fatal',
    color: '#f56c6c',
    minLevel: { value: 'W', enabled: true }
  }),
  createEmptyFilter({
    id: 'starter-myapp',
    name: 'MyApp (tag)',
    color: '#3d8bef',
    tag: { value: 'MyApp', enabled: true }
  })
];

/** Persists the working filter set so it survives an app restart (Settings > main
 *  process, see shared/types.ts AppSettings.filters) — mirrors tableSettingsStore's
 *  persist-on-every-mutation pattern. */
function persist(filters: Filter[]): void {
  window.api.settings.set({ filters });
}

export const useFilterStore = create<FilterState>((set) => ({
  filters: STARTER_FILTERS,
  filtersEnabled: false,
  quickLevelExclusions: new Set<LogLevel>(),
  searchQuery: '',
  submittedSearchQuery: '',
  searchRegex: false,
  searchCaseSensitive: false,

  addFilter: (overrides) => {
    const filter = createEmptyFilter(overrides);
    set((state) => {
      const filters = [...state.filters, filter];
      persist(filters);
      return { filters };
    });
    return filter;
  },
  updateFilter: (id, patch) =>
    set((state) => {
      const filters = state.filters.map((f) => (f.id === id ? { ...f, ...patch } : f));
      persist(filters);
      return { filters };
    }),
  removeFilter: (id) =>
    set((state) => {
      const filters = state.filters.filter((f) => f.id !== id);
      persist(filters);
      return { filters };
    }),
  toggleFilterActive: (id) =>
    set((state) => {
      const filters = state.filters.map((f) => (f.id === id ? { ...f, active: !f.active } : f));
      persist(filters);
      return { filters };
    }),
  setAllFiltersActive: (active) =>
    set((state) => {
      const filters = state.filters.map((f) => ({ ...f, active }));
      persist(filters);
      return { filters };
    }),
  toggleFiltersEnabled: () => set((state) => ({ filtersEnabled: !state.filtersEnabled })),
  toggleQuickLevel: (level) =>
    set((state) => {
      const next = new Set(state.quickLevelExclusions);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return { quickLevelExclusions: next };
    }),
  // Clearing the box back to empty is a reset, not a "still composing a query"
  // state — drop the active search immediately rather than leaving stale
  // results up until the next submit.
  setSearchQuery: (query) => set({ searchQuery: query, ...(query.length === 0 ? { submittedSearchQuery: '' } : null) }),
  submitSearchQuery: () => set((state) => ({ submittedSearchQuery: state.searchQuery })),
  setSearchRegex: (value) => set({ searchRegex: value }),
  setSearchCaseSensitive: (value) => set({ searchCaseSensitive: value }),
  loadFilters: (filters) => {
    persist(filters);
    set({ filters });
  }
}));

export const ALL_LOG_LEVELS = LOG_LEVELS;
