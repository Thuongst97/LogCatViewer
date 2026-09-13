import styles from './SearchBar.module.css';
import { Chip } from '../common/ui';
import { AutoscrollIcon, SearchIcon, XIcon } from '../../lib/icons';
import { useFilterStore, ALL_LOG_LEVELS } from '../../state/filterStore';
import { useLogStore } from '../../state/logStore';
import { useUiStore } from '../../state/uiStore';
import { useVisibleEntries } from '../../lib/useVisibleEntries';
import { levelColorVar } from '../../lib/levelColors';

export function SearchBar() {
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const setSearchQuery = useFilterStore((s) => s.setSearchQuery);
  const submitSearchQuery = useFilterStore((s) => s.submitSearchQuery);
  const searchRegex = useFilterStore((s) => s.searchRegex);
  const setSearchRegex = useFilterStore((s) => s.setSearchRegex);
  const searchCaseSensitive = useFilterStore((s) => s.searchCaseSensitive);
  const setSearchCaseSensitive = useFilterStore((s) => s.setSearchCaseSensitive);
  const quickLevelExclusions = useFilterStore((s) => s.quickLevelExclusions);
  const toggleQuickLevel = useFilterStore((s) => s.toggleQuickLevel);
  const autoscroll = useLogStore((s) => s.autoscroll);
  const setAutoscroll = useLogStore((s) => s.setAutoscroll);
  const totalLines = useLogStore((s) => s.entries.length);
  const { visible } = useVisibleEntries();
  const expandSearchResults = useUiStore((s) => s.expandSearchResults);

  // A full-buffer search can mean cloning a million entries across to the
  // search worker — running that on every keystroke is what made typing feel
  // laggy on a large log, so it only runs on an explicit submit (Enter, or
  // clicking the search icon), which is also what expands the dock.
  function submitSearch() {
    if (searchQuery.length > 0) {
      expandSearchResults();
      submitSearchQuery();
    }
  }

  return (
    <div className={styles.bar}>
      <div className={styles.searchWrap}>
        <button className={styles.searchIconBtn} onClick={submitSearch} title="Search the full buffer" aria-label="Search">
          <SearchIcon size={14} color="var(--text-muted)" />
        </button>
        <input
          className={[styles.searchInput, 'mono'].join(' ')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitSearch();
          }}
          placeholder="Search logs… (tag, message, pid)"
        />
        {searchQuery.length > 0 && (
          <button className={styles.clearBtn} onClick={() => setSearchQuery('')} title="Clear search" aria-label="Clear search">
            <XIcon size={12} color="var(--text-muted)" />
          </button>
        )}
      </div>

      <Chip active={searchRegex} onClick={() => setSearchRegex(!searchRegex)} title="Regular expression" style={{ width: 30, height: 26 }}>
        .*
      </Chip>
      <Chip active={searchCaseSensitive} onClick={() => setSearchCaseSensitive(!searchCaseSensitive)} title="Case sensitive" style={{ width: 30, height: 26 }}>
        Aa
      </Chip>

      <div className={styles.divider} />

      <span className={styles.levelsLabel}>LEVELS</span>
      <div className={styles.chipRow}>
        {ALL_LOG_LEVELS.map((level) => {
          const active = !quickLevelExclusions.has(level);
          return (
            <Chip
              key={level}
              active={active}
              dim={!active}
              onClick={() => toggleQuickLevel(level)}
              style={{ width: 26, height: 24, color: active ? levelColorVar(level) : undefined }}
              title={`Toggle ${level} visibility`}
            >
              {level}
            </Chip>
          );
        })}
      </div>

      <div className={styles.spacer} />

      <span className={[styles.lineCounters, 'mono'].join(' ')}>
        {totalLines.toLocaleString()} lines total
        <span className={styles.lineCountersDot}>&bull;</span>
        <span style={{ color: 'var(--text-secondary)' }}>{visible.length.toLocaleString()} filtered</span>
      </span>

      <Chip active={autoscroll} onClick={() => setAutoscroll(!autoscroll)} style={{ height: 26, padding: '0 10px', gap: 6, fontWeight: 500 }}>
        <AutoscrollIcon size={14} />
        Auto Scroll
      </Chip>
    </div>
  );
}
