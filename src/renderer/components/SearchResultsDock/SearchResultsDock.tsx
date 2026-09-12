import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import styles from './SearchResultsDock.module.css';
import tableStyles from '../LogTable/LogTable.module.css';
import { ChevronDownIcon, ChevronUpIcon, SearchIcon } from '../../lib/icons';
import { useLogStore } from '../../state/logStore';
import { useFilterStore } from '../../state/filterStore';
import { useUiStore, SEARCH_RESULTS_HEADER_HEIGHT } from '../../state/uiStore';
import { useTableSettingsStore } from '../../state/tableSettingsStore';
import { useSearchWorker } from '../../lib/useSearchWorker';
import { computeTableLayout } from '../../lib/tableLayout';
import { renderLogCell } from '../../lib/renderLogCell';
import { COLUMN_LABELS, type LogEntry } from '@shared/types';

const DEBOUNCE_MS = 150;

/**
 * Full-buffer search results, independent of the currently applied filters —
 * mirrors DLT Viewer's persistent bottom search panel. Runs against the
 * *entire* buffer (not just the filtered view) in a Web Worker so a large
 * regex scan never blocks the table (plan §8.6 / §10).
 */
export function SearchResultsDock() {
  const visible = useUiStore((s) => s.searchResultsVisible);
  const toggleVisible = useUiStore((s) => s.toggleSearchResults);
  const height = useUiStore((s) => s.searchResultsHeight);
  const setHeight = useUiStore((s) => s.setSearchResultsHeight);
  const entries = useLogStore((s) => s.entries);
  const select = useLogStore((s) => s.select);
  const goToEntry = useLogStore((s) => s.goToEntry);
  const query = useFilterStore((s) => s.searchQuery);
  const regex = useFilterStore((s) => s.searchRegex);
  const caseSensitive = useFilterStore((s) => s.searchCaseSensitive);
  const { search } = useSearchWorker();
  const [results, setResults] = useState<LogEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const columns = useTableSettingsStore((s) => s.columns);
  const columnWidths = useTableSettingsStore((s) => s.columnWidths);
  const { visibleColumns, gridTemplate } = computeTableLayout({ columns, columnWidths });

  useEffect(() => {
    const handle = setTimeout(async () => {
      if (query.length === 0) {
        setResults([]);
        return;
      }
      const matches = await search(entries, query, regex, caseSensitive);
      setResults(matches);
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, query, regex, caseSensitive]);

  const dragStart = useRef<{ startY: number; startHeight: number } | null>(null);

  function handleResizeStart(e: ReactMouseEvent) {
    e.preventDefault();
    dragStart.current = { startY: e.clientY, startHeight: height };
    setDragging(true);
  }

  useEffect(() => {
    if (!dragging) return;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    function onMove(e: MouseEvent) {
      if (!dragStart.current) return;
      // Dragging the top edge up should grow the dock, so the delta is inverted.
      const delta = dragStart.current.startY - e.clientY;
      setHeight(dragStart.current.startHeight + delta);
    }
    function onUp() {
      dragStart.current = null;
      setDragging(false);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [dragging, setHeight]);

  return (
    <div className={styles.dock} style={{ height: visible ? height : SEARCH_RESULTS_HEADER_HEIGHT }}>
      {visible && (
        <div
          className={[styles.resizeHandle, dragging ? styles.resizing : ''].join(' ')}
          onMouseDown={handleResizeStart}
          title="Drag to resize"
        />
      )}
      <button className={styles.header} onClick={toggleVisible}>
        <SearchIcon size={13} color="var(--text-secondary)" />
        <span className={styles.title}>Search Results</span>
        <span className={styles.count}>
          {query.length === 0 ? 'Type a query above to search the full buffer' : `${results.length} match${results.length === 1 ? '' : 'es'} for “${query}”`}
        </span>
        <div className={styles.spacer} />
        {visible ? <ChevronDownIcon size={13} color="var(--text-muted)" /> : <ChevronUpIcon size={13} color="var(--text-muted)" />}
      </button>

      {visible && (
        <>
          <div className={[tableStyles.headerRow, 'mono'].join(' ')} style={{ gridTemplateColumns: gridTemplate }}>
            {visibleColumns.map((column) => (
              <div key={column} className={tableStyles.cell}>
                {COLUMN_LABELS[column].toUpperCase()}
              </div>
            ))}
          </div>

          <div className={[styles.body, 'mono'].join(' ')}>
            {results.length === 0 ? (
              <div className={styles.empty}>{query.length === 0 ? 'No search in progress.' : 'No matches.'}</div>
            ) : (
              results.map((entry) => (
                <div
                  key={entry.id}
                  className={tableStyles.row}
                  style={{ gridTemplateColumns: gridTemplate }}
                  onClick={() => select(entry.id)}
                  onDoubleClick={() => goToEntry(entry.id)}
                  title="Double-click to jump to this line in the main view"
                >
                  {visibleColumns.map((column) => (
                    <div key={column} className={tableStyles.cell}>
                      {renderLogCell(column, entry)}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
