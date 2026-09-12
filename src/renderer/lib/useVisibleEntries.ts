import { useMemo } from 'react';
import { useLogStore } from '../state/logStore';
import { useFilterStore } from '../state/filterStore';
import { compileFilters, type CompiledFilters } from './filterEngine';
import type { LogEntry } from '@shared/types';

/** Single source of truth for "which entries are currently visible" — shared by
 *  LogTable and SearchBar (line counters) so the two never disagree about the
 *  filtered count. */
export function useVisibleEntries(): { visible: LogEntry[]; compiled: CompiledFilters } {
  const entries = useLogStore((s) => s.entries);
  const filters = useFilterStore((s) => s.filters);
  const filtersEnabled = useFilterStore((s) => s.filtersEnabled);
  const quickLevelExclusions = useFilterStore((s) => s.quickLevelExclusions);
  const compiled = useMemo(() => compileFilters(filters, filtersEnabled), [filters, filtersEnabled]);
  const visible = useMemo(
    () => entries.filter((e) => !quickLevelExclusions.has(e.level) && compiled.isVisible(e)),
    [entries, quickLevelExclusions, compiled]
  );
  return { visible, compiled };
}
