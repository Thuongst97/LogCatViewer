import { useState } from 'react';
import styles from './FilterSidebar.module.css';
import { Checkbox, Chip } from '../common/ui';
import { FilterNegativeIcon, FilterPositiveIcon, PencilIcon, PlusIcon, XIcon } from '../../lib/icons';
import { useFilterStore } from '../../state/filterStore';
import { useUiStore } from '../../state/uiStore';
import type { Filter } from '@shared/types';

export function FilterSidebar() {
  const [tab, setTab] = useState<'filters' | 'sources'>('filters');
  const filters = useFilterStore((s) => s.filters);
  const filtersEnabled = useFilterStore((s) => s.filtersEnabled);
  const toggleFiltersEnabled = useFilterStore((s) => s.toggleFiltersEnabled);
  const toggleFilterActive = useFilterStore((s) => s.toggleFilterActive);
  const removeFilter = useFilterStore((s) => s.removeFilter);
  const openFilterEditor = useUiStore((s) => s.openFilterEditor);
  const [selectedId, setSelectedId] = useState<string | null>(filters[1]?.id ?? filters[0]?.id ?? null);

  const activeCount = filters.filter((f) => f.active).length;

  return (
    <div className={styles.sidebar}>
      <div className={styles.tabs}>
        <button className={[styles.tab, tab === 'filters' ? styles.tabActive : ''].join(' ')} onClick={() => setTab('filters')}>
          Filters
        </button>
        <button className={[styles.tab, tab === 'sources' ? styles.tabActive : ''].join(' ')} onClick={() => setTab('sources')}>
          Sources
        </button>
      </div>

      {tab === 'filters' ? (
        <div className={styles.listSection}>
          <Chip
            active={filtersEnabled}
            onClick={toggleFiltersEnabled}
            title={filtersEnabled ? 'Filters are applied — click to bypass them' : 'Filters are bypassed — click to apply them'}
            style={{ height: 30, width: '100%', gap: 7, fontWeight: 600, fontSize: 12, marginBottom: 10 }}
          >
            {filtersEnabled ? <FilterPositiveIcon size={13} /> : <FilterNegativeIcon size={13} />}
            {filtersEnabled ? 'Filters Applied' : 'Filters Bypassed'}
          </Chip>

          <div className={styles.listHeader}>
            <span className="mono" style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              {filters.length} filters &middot; {activeCount} active
            </span>
            <button className={styles.addBtn} onClick={() => openFilterEditor(null)}>
              <PlusIcon size={12} />
              Add
            </button>
          </div>

          <div className={styles.filterList} style={{ opacity: filtersEnabled ? 1 : 0.45 }}>
            {filters.map((filter) => (
              <FilterRow
                key={filter.id}
                filter={filter}
                selected={filter.id === selectedId}
                onSelect={() => setSelectedId(filter.id)}
                onToggle={() => toggleFilterActive(filter.id)}
                onEdit={() => openFilterEditor(filter.id)}
                onDelete={() => removeFilter(filter.id)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className={styles.listSection} style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          Connected sources will appear here once multi-device capture ships (see IMPLEMENTATION_PLAN.md §7 &mdash; out of scope for v1&apos;s single-device toolbar).
        </div>
      )}
    </div>
  );
}

function FilterRow({
  filter,
  selected,
  onSelect,
  onToggle,
  onEdit,
  onDelete
}: {
  filter: Filter;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={[styles.filterRow, selected ? styles.filterRowSelected : ''].join(' ')} onClick={onSelect} role="button" tabIndex={0}>
      <div onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={filter.active} onChange={onToggle} aria-label={`Toggle ${filter.name}`} />
      </div>
      <span className={styles.dot} style={{ background: filter.color }} />
      <span className={[styles.filterName, filter.active ? '' : styles.filterNameInactive].join(' ')}>{filter.name}</span>
      {selected && (
        <>
          <button
            className={styles.rowIcon}
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            title="Edit filter"
          >
            <PencilIcon size={13} color="var(--text-secondary)" />
          </button>
          <button
            className={styles.rowIcon}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Delete filter"
          >
            <XIcon size={13} color="var(--text-secondary)" />
          </button>
        </>
      )}
    </div>
  );
}
