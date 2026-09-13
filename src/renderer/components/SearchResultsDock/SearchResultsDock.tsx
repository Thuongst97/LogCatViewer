import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
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

// Not a per-keystroke debounce (search only runs on explicit submit — see
// filterStore.submitSearchQuery) — this just coalesces a burst of live-capture
// batches into one re-search of an *already-submitted* query instead of
// re-running on every ~40ms batch tick while new matching lines stream in.
const DEBOUNCE_MS = 150;

/**
 * Full-buffer search results, independent of the currently applied filters —
 * mirrors DLT Viewer's persistent bottom search panel. Runs against the
 * *entire* buffer (not just the filtered view) in a Web Worker so a large
 * regex scan never blocks the table (plan §8.6 / §10). Triggered only by an
 * explicit submit, not by typing — posting a million-entry buffer to the
 * worker on every keystroke is what made typing feel laggy on a large log.
 */
export function SearchResultsDock() {
  const visible = useUiStore((s) => s.searchResultsVisible);
  const toggleVisible = useUiStore((s) => s.toggleSearchResults);
  const height = useUiStore((s) => s.searchResultsHeight);
  const setHeight = useUiStore((s) => s.setSearchResultsHeight);
  const entries = useLogStore((s) => s.entries);
  const select = useLogStore((s) => s.select);
  const goToEntry = useLogStore((s) => s.goToEntry);
  // The dock searches and reports on the *submitted* query (Enter / search
  // icon), not the raw input value — see filterStore.submitSearchQuery for
  // why re-searching a huge buffer on every keystroke is what caused the lag.
  const query = useFilterStore((s) => s.submittedSearchQuery);
  const regex = useFilterStore((s) => s.searchRegex);
  const caseSensitive = useFilterStore((s) => s.searchCaseSensitive);
  const { search } = useSearchWorker();
  const [results, setResults] = useState<LogEntry[]>([]);
  // A submitted search over a huge buffer (cloning it across to the worker,
  // then scanning it) can take a perceptible moment — shown so a submit
  // doesn't look like it did nothing until the results suddenly appear.
  const [searching, setSearching] = useState(false);
  const [dragging, setDragging] = useState(false);
  const columns = useTableSettingsStore((s) => s.columns);
  const columnWidths = useTableSettingsStore((s) => s.columnWidths);
  const rowHeight = useTableSettingsStore((s) => s.rowHeight);
  const { visibleColumns, gridTemplate } = computeTableLayout({ columns, columnWidths });
  const bodyRef = useRef<HTMLDivElement>(null);

  // A massive log can easily produce thousands of matches (a common substring
  // over a 500k-line buffer) — rendering every one as a real DOM row is what
  // made expanding this dock lag. Virtualized the same way LogTable is: only
  // the rows actually in view exist in the DOM, regardless of match count.
  const virtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => bodyRef.current,
    estimateSize: () => rowHeight,
    overscan: 20
  });

  useEffect(() => {
    if (query.length === 0) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(async () => {
      const matches = await search(entries, query, regex, caseSensitive);
      if (cancelled) return; // a newer search superseded this one
      setResults(matches);
      setSearching(false);
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
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
          {query.length === 0
            ? 'Type a query above, then press Enter to search the full buffer'
            : searching
              ? `Searching for “${query}”…`
              : `${results.length} match${results.length === 1 ? '' : 'es'} for “${query}”`}
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

          <div ref={bodyRef} className={[styles.body, 'mono'].join(' ')}>
            {results.length === 0 ? (
              <div className={styles.empty}>{query.length === 0 ? 'No search in progress.' : searching ? 'Searching…' : 'No matches.'}</div>
            ) : (
              <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const entry = results[virtualRow.index];
                  return (
                    <div
                      key={entry.id}
                      className={tableStyles.row}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: virtualRow.size,
                        transform: `translateY(${virtualRow.start}px)`,
                        gridTemplateColumns: gridTemplate
                      }}
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
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
