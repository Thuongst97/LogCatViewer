import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import styles from './SearchResultsDock.module.css';
import tableStyles from '../LogTable/LogTable.module.css';
import { ChevronDownIcon, ChevronUpIcon, SearchIcon } from '../../lib/icons';
import { useLogStore } from '../../state/logStore';
import { useFilterStore } from '../../state/filterStore';
import { useUiStore, SEARCH_RESULTS_HEADER_HEIGHT, LARGE_FILE_OPEN_BYTES } from '../../state/uiStore';
import { useTableSettingsStore } from '../../state/tableSettingsStore';
import { searchEntries } from '../../lib/searchEntries';
import { useScaledVirtualizerScroll } from '../../lib/scaledVirtualizerScroll';
import { useVisibleEntries } from '../../lib/useVisibleEntries';
import { computeTableLayout } from '../../lib/tableLayout';
import { renderLogCell } from '../../lib/renderLogCell';
import { measureTextWidth } from '../../lib/measureTextWidth';
import { COLUMN_LABELS, type LogEntry } from '@shared/types';

// Not a per-keystroke debounce (search only runs on explicit submit — see
// filterStore.submitSearchQuery) — this just coalesces a burst of live-capture
// batches into one re-search of an *already-submitted* query instead of
// re-running on every ~40ms batch tick while new matching lines stream in.
const DEBOUNCE_MS = 150;

/**
 * Search results scoped to whatever's currently filtered into view — same set
 * of lines the main table shows (saved Filters + quick Level toggles), mirrors
 * DLT Viewer's persistent bottom search panel otherwise. Chunked and yielded
 * (see searchEntries.ts) so a large scan never blocks the table — a plain Web
 * Worker was tried first, but its postMessage clone of the whole buffer
 * turned out to cost far more than the scan itself at real scale (~2.8s to
 * hand off 1.75M entries versus ~100ms to actually search them), which is
 * what made search look hung on a large log. When no filters/levels are
 * narrowing anything, this is the same as searching the whole buffer —
 * searching a smaller, already-filtered set when they are is both the more
 * expected result (a hidden line isn't a "match" you can act on) and faster,
 * since there's less to scan. Triggered only by an explicit submit, not by
 * typing — re-searching a million-entry buffer on every keystroke is what
 * made typing feel laggy on a large log.
 */
export function SearchResultsDock() {
  const dockVisible = useUiStore((s) => s.searchResultsVisible);
  const toggleVisible = useUiStore((s) => s.toggleSearchResults);
  const height = useUiStore((s) => s.searchResultsHeight);
  const setHeight = useUiStore((s) => s.setSearchResultsHeight);
  const { visible: visibleEntries } = useVisibleEntries();
  const select = useLogStore((s) => s.select);
  const goToEntry = useLogStore((s) => s.goToEntry);
  // The dock searches and reports on the *submitted* query (Enter / search
  // icon), not the raw input value — see filterStore.submitSearchQuery for
  // why re-searching a huge buffer on every keystroke is what caused the lag.
  const query = useFilterStore((s) => s.submittedSearchQuery);
  const regex = useFilterStore((s) => s.searchRegex);
  const caseSensitive = useFilterStore((s) => s.searchCaseSensitive);
  const loadingLargeFile = useUiStore((s) => s.fileOpenProgress !== null && s.fileOpenTotalBytes >= LARGE_FILE_OPEN_BYTES);
  const [results, setResults] = useState<LogEntry[]>([]);
  // A submitted search over a huge buffer can take a perceptible moment even
  // chunked — shown so a submit doesn't look like it did nothing until the
  // results suddenly appear.
  const [searching, setSearching] = useState(false);
  const [dragging, setDragging] = useState(false);
  const columns = useTableSettingsStore((s) => s.columns);
  const columnWidths = useTableSettingsStore((s) => s.columnWidths);
  const rowHeight = useTableSettingsStore((s) => s.rowHeight);
  const fontSize = useTableSettingsStore((s) => s.fontSize);
  const bodyRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);

  // Mirrors LogTable's header/body horizontal scroll sync. headerScrollRef
  // wraps the header row at viewport width with overflow-x: hidden — its own
  // content (the header row, sized to totalWidth) is what actually overflows,
  // so *this* wrapper is what needs scrollLeft set to stay aligned; an element
  // exactly as wide as its own content has nothing to scroll, so the wrapper
  // can't just be the header row itself.
  function handleBodyScroll() {
    if (headerScrollRef.current && bodyRef.current) headerScrollRef.current.scrollLeft = bodyRef.current.scrollLeft;
  }

  // The body has a vertical scrollbar carving into its content width; the
  // header doesn't, so without compensating for that gap the two drift out of
  // alignment by a scrollbar's width at the far right edge of a horizontal
  // scroll (see the matching fix in LogTable.tsx).
  const [scrollbarWidth, setScrollbarWidth] = useState(0);

  // A massive log can easily produce thousands of matches (a common substring
  // over a 500k-line buffer) — rendering every one as a real DOM row is what
  // made expanding this dock lag. Virtualized the same way LogTable is: only
  // the rows actually in view exist in the DOM, regardless of match count.
  // A search over a multi-million-line buffer can return enough matches to hit
  // the same element-height ceiling the main table does.
  const scaledScroll = useScaledVirtualizerScroll(results.length * rowHeight);
  const virtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => bodyRef.current,
    estimateSize: () => rowHeight,
    overscan: 20,
    scrollToFn: scaledScroll.scrollToFn,
    observeElementOffset: scaledScroll.observeElementOffset
  });
  scaledScroll.patchMaxScrollOffset(virtualizer);

  // Mirrors LogTable's content-aware Message width (see its longer comment):
  // `minmax(width, 1fr)` alone never grows past the available viewport, so a
  // long match would just get ellipsis-truncated with no way to scroll to the
  // rest. Measuring the widest message among the currently-rendered rows and
  // folding that into the effective column width forces real overflow (and so
  // a usable horizontal scrollbar) whenever a result line needs more room.
  const font = `${fontSize}px 'IBM Plex Mono', ui-monospace, 'Cascadia Code', Consolas, monospace`;
  const MESSAGE_CELL_PADDING = 28;
  let widestMessage = 0;
  if (columns.message) {
    for (const virtualRow of virtualizer.getVirtualItems()) {
      const entry = results[virtualRow.index];
      if (!entry) continue;
      const width = measureTextWidth(entry.message, font);
      if (width > widestMessage) widestMessage = width;
    }
  }
  const effectiveColumnWidths =
    widestMessage > 0
      ? { ...columnWidths, message: Math.max(columnWidths.message, Math.ceil(widestMessage) + MESSAGE_CELL_PADDING) }
      : columnWidths;
  const { visibleColumns, gridTemplate, totalWidth } = computeTableLayout({ columns, columnWidths: effectiveColumnWidths });

  useEffect(() => {
    // bodyRef.current is null until the dock is actually expanded (it starts
    // collapsed, and its body isn't rendered at all while collapsed) — this
    // must re-attempt whenever dockVisible flips, not just once on mount, or
    // it permanently measures nothing if the dock was closed at mount time.
    // ResizeObserver alone isn't enough either: the vertical scrollbar can
    // appear/disappear purely because `results.length` crossed the overflow
    // threshold, with the container's own box (what ResizeObserver tracks)
    // never changing size — so re-measure directly on that too, not just on
    // an actual container resize.
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => setScrollbarWidth(el.offsetWidth - el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [dockVisible, results.length, rowHeight]);

  // Row height (Settings > Table) is a fixed estimate, not a per-row DOM
  // measurement — changing it doesn't retroactively invalidate rows the
  // virtualizer already sized, so already-rendered results would keep their
  // old height until this forces a re-measure (mirrors LogTable's own fix).
  useEffect(() => {
    virtualizer.measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowHeight]);

  // Distinguishes "the user just asked a different question" (new query text,
  // or toggling regex/case-sensitivity) from "same question, buffer changed
  // underneath it" (live capture growth, a filter/level toggle). Only the
  // former clears `results` immediately — otherwise an already-showing set of
  // matches would flash empty on every live-capture tick while a search stays
  // active, which isn't the stale-results problem this is fixing.
  const searchKeyRef = useRef<string>('');

  // A pending debounced run reads through this ref instead of closing over
  // whatever `visibleEntries` was current when it got scheduled — see below
  // for why the run itself is never rescheduled once queued.
  const latestRef = useRef({ visibleEntries, query, regex, caseSensitive });
  latestRef.current = { visibleEntries, query, regex, caseSensitive };
  const pendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // An in-flight large file load appends to the buffer ~25 times a second,
    // and each of those would otherwise queue another full re-scan of a set
    // that's still growing — throwing away the previous scan's work every
    // time, for results nobody can act on until the load settles anyway. The
    // load finishing flips this back and re-runs the search once, against
    // the final buffer.
    if (loadingLargeFile) return;

    const searchKey = `${query} ${String(regex)} ${String(caseSensitive)}`;
    const isNewSearch = searchKey !== searchKeyRef.current;
    searchKeyRef.current = searchKey;

    if (query.length === 0) {
      if (pendingTimeoutRef.current) {
        clearTimeout(pendingTimeoutRef.current);
        pendingTimeoutRef.current = null;
      }
      setResults([]);
      setSearching(false);
      return;
    }

    // A background refresh (live capture still streaming, a filter/level
    // toggle) while a run is already queued — let that queued run fire on
    // schedule instead of pushing its deadline out again. Live capture can
    // post a new batch every ~40ms, well under DEBOUNCE_MS; resetting the
    // timer on every single one — as a plain "clear + reschedule" debounce
    // does — means it would never survive long enough to actually fire,
    // leaving `searching` stuck true and the dock reading "Searching…"
    // indefinitely for as long as logs keep streaming in. Not rescheduling
    // costs nothing: the queued run reads `latestRef` at fire time, so it
    // always searches the freshest buffer regardless of when it was queued.
    if (!isNewSearch && pendingTimeoutRef.current) return;

    if (isNewSearch) {
      if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
      setResults([]); // drop the previous query's matches right away, don't leave them showing
      setSearching(true);
    }
    // A background refresh doesn't touch `searching` at all — it's already
    // false from the initial search having resolved. Under continuous live
    // streaming this effect can re-run every ~40ms; flipping `searching` true
    // on each one (as before) meant the label spent nearly all its time
    // reading "Searching…" again immediately after every quiet re-scan
    // resolved, which looked just as stuck as the original bug even once the
    // underlying search itself was completing fine.
    pendingTimeoutRef.current = setTimeout(async () => {
      pendingTimeoutRef.current = null;
      const current = latestRef.current;
      const matches = await searchEntries(current.visibleEntries, current.query, current.regex, current.caseSensitive);
      setResults(matches);
      setSearching(false);
    }, DEBOUNCE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleEntries, query, regex, caseSensitive, loadingLargeFile]);

  // Only cleaned up on unmount — a queued run deliberately outlives any single
  // render's effect cleanup (see above), so it can't be cancelled the usual
  // per-render way without reintroducing the never-fires bug.
  useEffect(() => {
    return () => {
      if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
    };
  }, []);

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
    <div className={styles.dock} style={{ height: dockVisible ? height : SEARCH_RESULTS_HEADER_HEIGHT }}>
      {dockVisible && (
        <div
          className={[styles.resizeHandle, dragging ? styles.resizing : ''].join(' ')}
          onMouseDown={handleResizeStart}
          title="Drag to resize"
        />
      )}
      <button className={styles.header} onClick={toggleVisible}>
        <SearchIcon size={13} color="var(--text-secondary)" />
        <span className={styles.title}>Search Results</span>
        {searching && <span className={styles.spinnerSmall} />}
        <span className={styles.count}>
          {query.length === 0
            ? 'Type a query above, then press Enter to search what’s currently filtered into view'
            : searching
              ? `Searching for “${query}”…`
              : `${results.length} match${results.length === 1 ? '' : 'es'} for “${query}”`}
        </span>
        <div className={styles.spacer} />
        {dockVisible ? <ChevronDownIcon size={13} color="var(--text-muted)" /> : <ChevronUpIcon size={13} color="var(--text-muted)" />}
      </button>

      {dockVisible && (
        <>
          <div className={tableStyles.headerBar}>
            <div ref={headerScrollRef} className={tableStyles.headerScroll} style={{ marginRight: scrollbarWidth }}>
              <div
                className={[tableStyles.headerRow, 'mono'].join(' ')}
                style={{ gridTemplateColumns: gridTemplate, width: '100%', minWidth: totalWidth }}
              >
                {visibleColumns.map((column) => (
                  <div key={column} className={tableStyles.cell}>
                    {COLUMN_LABELS[column].toUpperCase()}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div ref={bodyRef} className={[styles.body, 'mono'].join(' ')} style={{ fontSize }} onScroll={handleBodyScroll}>
            {results.length === 0 ? (
              <div className={[styles.empty, searching ? styles.emptySearching : ''].join(' ')}>
                {searching && <span className={styles.spinner} />}
                {query.length === 0 ? 'No search in progress.' : searching ? 'Searching…' : 'No matches.'}
              </div>
            ) : (
              <div style={{ height: scaledScroll.safeTotalSize, width: '100%', minWidth: totalWidth, position: 'relative' }}>
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
                        transform: `translateY(${virtualRow.start - scaledScroll.rowOffsetShift}px)`,
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
