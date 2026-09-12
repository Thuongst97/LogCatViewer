import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import styles from './FilterSidebar.module.css';
import { Checkbox, Chip } from '../common/ui';
import { FilterNegativeIcon, FilterPositiveIcon, FolderOpenIcon, PencilIcon, PlusIcon, SaveIcon, XIcon } from '../../lib/icons';
import { useFilterStore } from '../../state/filterStore';
import { useUiStore } from '../../state/uiStore';
import { FolderTree } from '../FolderTree/FolderTree';
import { openProjectFile, saveProjectFile } from '../../lib/projectFile';
import type { Filter } from '@shared/types';

export function FilterSidebar() {
  const [tab, setTab] = useState<'filters' | 'explore'>('filters');
  const filters = useFilterStore((s) => s.filters);
  const filtersEnabled = useFilterStore((s) => s.filtersEnabled);
  const toggleFiltersEnabled = useFilterStore((s) => s.toggleFiltersEnabled);
  const toggleFilterActive = useFilterStore((s) => s.toggleFilterActive);
  const removeFilter = useFilterStore((s) => s.removeFilter);
  const openFilterEditor = useUiStore((s) => s.openFilterEditor);
  const sidebarWidth = useUiStore((s) => s.sidebarWidth);
  const setSidebarWidth = useUiStore((s) => s.setSidebarWidth);
  const [selectedId, setSelectedId] = useState<string | null>(filters[1]?.id ?? filters[0]?.id ?? null);
  const [resizing, setResizing] = useState(false);
  const dragStart = useRef<{ startX: number; startWidth: number } | null>(null);

  function handleResizeStart(e: ReactMouseEvent) {
    e.preventDefault();
    dragStart.current = { startX: e.clientX, startWidth: sidebarWidth };
    setResizing(true);
  }

  useEffect(() => {
    if (!resizing) return;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMove(e: MouseEvent) {
      if (!dragStart.current) return;
      setSidebarWidth(dragStart.current.startWidth + (e.clientX - dragStart.current.startX));
    }
    function onUp() {
      dragStart.current = null;
      setResizing(false);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizing]);

  return (
    <div className={styles.sidebar} style={{ width: sidebarWidth }}>
      <div
        className={[styles.resizeHandle, resizing ? styles.resizing : ''].join(' ')}
        onMouseDown={handleResizeStart}
        title="Drag to resize sidebar"
      />
      <div className={styles.tabs}>
        <button className={[styles.tab, tab === 'filters' ? styles.tabActive : ''].join(' ')} onClick={() => setTab('filters')}>
          Filters
        </button>
        <button className={[styles.tab, tab === 'explore' ? styles.tabActive : ''].join(' ')} onClick={() => setTab('explore')}>
          Explore
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
            {filtersEnabled ? 'Filters Enabled' : 'Filters Disabled'}
          </Chip>

          <div className={styles.listHeader}>
            <button className={styles.addBtn} onClick={openProjectFile} title="Load a different filter set from a project file">
              <FolderOpenIcon size={12} />
              Load
            </button>
            <button className={styles.addBtn} onClick={saveProjectFile} title="Save the current filter set to a project file">
              <SaveIcon size={12} />
              Save Filter
            </button>
            <button className={styles.addBtn} onClick={() => openFilterEditor(null)}>
              <PlusIcon size={12} />
              Add
            </button>
          </div>

          <div className={styles.filterList}>
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
        <div className={styles.listSection} style={{ padding: 0 }}>
          <FolderTree />
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
