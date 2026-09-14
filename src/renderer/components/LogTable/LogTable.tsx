import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import styles from './LogTable.module.css';
import { useLogStore } from '../../state/logStore';
import { useDeviceStore } from '../../state/deviceStore';
import { useUiStore } from '../../state/uiStore';
import { useTableSettingsStore } from '../../state/tableSettingsStore';
import { useVisibleEntries } from '../../lib/useVisibleEntries';
import { computeTableLayout } from '../../lib/tableLayout';
import { renderLogCell } from '../../lib/renderLogCell';
import { measureTextWidth } from '../../lib/measureTextWidth';
import { useScaledVirtualizerScroll } from '../../lib/scaledVirtualizerScroll';
import { copyToClipboard } from '../../lib/clipboard';
import { CopyIcon, ExpandIcon, FilterPositiveIcon } from '../../lib/icons';
import { COLUMN_LABELS, type ColumnKey, type LogEntry } from '@shared/types';

interface ContextMenuState {
  x: number;
  y: number;
  entry: LogEntry;
}

const AUTOSCROLL_SLOP_MULTIPLIER = 2;

/** The dense, virtualized log table — only visible rows exist in the DOM regardless of
 *  buffer size (plan §8.3), which is what keeps a 100k-line buffer scrolling smoothly.
 *  Columns, their widths, row height, and text size all come from tableSettingsStore
 *  (Settings > Table), and every column — Message included — is drag-resizable from
 *  its header cell's right edge. The Message column's configured width is only a
 *  *minimum*: it still fills spare room on a wide window, but the widest message
 *  actually on screen is measured (canvas.measureText, see measureTextWidth) and
 *  used as a floor too, so a long line always forces real horizontal overflow
 *  instead of silently ellipsis-truncating with no way to read the rest. The
 *  header scrolls in lockstep via a synced scrollLeft (handleScroll) so columns
 *  stay aligned with their headers. */
export function LogTable() {
  const entries = useLogStore((s) => s.entries);
  const selectedEntryId = useLogStore((s) => s.selectedEntryId);
  const select = useLogStore((s) => s.select);
  const autoscroll = useLogStore((s) => s.autoscroll);
  const scrollRequest = useLogStore((s) => s.scrollRequest);
  const clearScrollRequest = useLogStore((s) => s.clearScrollRequest);
  const captureState = useDeviceStore((s) => s.captureState);
  const openLogDetailDialog = useUiStore((s) => s.openLogDetailDialog);
  const openFilterEditor = useUiStore((s) => s.openFilterEditor);
  const { visible, compiled } = useVisibleEntries();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const columns = useTableSettingsStore((s) => s.columns);
  const columnWidths = useTableSettingsStore((s) => s.columnWidths);
  const fontSize = useTableSettingsStore((s) => s.fontSize);
  const rowHeight = useTableSettingsStore((s) => s.rowHeight);
  const setColumnWidth = useTableSettingsStore((s) => s.setColumnWidth);

  const parentRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);
  // The body has a vertical scrollbar carving into its content width; the
  // header doesn't, so without compensating for that gap the two drift out of
  // alignment by a scrollbar's width at the far right edge of a horizontal
  // scroll. Re-measured on any resize (window, sidebar toggle, row count
  // crossing the point where the vertical scrollbar appears/disappears, …).
  const [scrollbarWidth, setScrollbarWidth] = useState(0);

  // Past ~1.4M rows the total row height exceeds what a single element can
  // be, and without this every row beyond that point is unreachable by
  // scrolling — see scaledVirtualizerScroll.ts. Exact no-op below that size.
  const scaledScroll = useScaledVirtualizerScroll(visible.length * rowHeight);

  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 20,
    scrollToFn: scaledScroll.scrollToFn,
    observeElementOffset: scaledScroll.observeElementOffset
  });
  scaledScroll.patchMaxScrollOffset(virtualizer);

  const font = `${fontSize}px 'IBM Plex Mono', ui-monospace, 'Cascadia Code', Consolas, monospace`;
  const MESSAGE_CELL_PADDING = 28; // .cell's 4px+10px horizontal padding, plus a small safety margin
  let widestMessage = 0;
  if (columns.message) {
    for (const virtualRow of virtualizer.getVirtualItems()) {
      const entry = visible[virtualRow.index];
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
    const el = parentRef.current;
    if (!el) return;
    const measure = () => setScrollbarWidth(el.offsetWidth - el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible.length, rowHeight]);

  useEffect(() => {
    virtualizer.measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowHeight]);

  // Turning Autoscroll ON (the toolbar button) is a deliberate "take me to the
  // bottom" action — it must win even if the user had scrolled up earlier, so
  // this clears that flag before scrolling. Split out from the effect below:
  // that one is gated on the flag on purpose (new data shouldn't yank the view
  // back down while the user is mid-scroll reading old lines), this one isn't.
  useEffect(() => {
    if (!autoscroll || visible.length === 0) return;
    userScrolledUp.current = false;
    virtualizer.scrollToIndex(visible.length - 1, { align: 'end' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoscroll]);

  useEffect(() => {
    if (!autoscroll || userScrolledUp.current || visible.length === 0) return;
    virtualizer.scrollToIndex(visible.length - 1, { align: 'end' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.length]);

  useEffect(() => {
    if (!scrollRequest) return;
    const index = visible.findIndex((e) => e.id === scrollRequest.id);
    if (index !== -1) virtualizer.scrollToIndex(index, { align: 'center' });
    clearScrollRequest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRequest]);

  function handleScroll() {
    const el = parentRef.current;
    if (!el) return;
    // headerScrollRef wraps the header row at viewport width with overflow-x:
    // hidden (see .headerScroll) — its own content (the header row, sized to
    // totalWidth) is what actually overflows, so *this* wrapper is what needs
    // scrollLeft set to stay in lockstep; it never scrolls on its own.
    if (headerScrollRef.current) headerScrollRef.current.scrollLeft = el.scrollLeft;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    userScrolledUp.current = distanceFromBottom > rowHeight * AUTOSCROLL_SLOP_MULTIPLIER;
  }

  // Double-click opens the full detail dialog (plan follow-up: replaces the old
  // always-on sidebar inspector — mirrors DLT Viewer's message-detail popup).
  function handleOpenDetail(entry: LogEntry) {
    select(entry.id);
    openLogDetailDialog();
  }

  function handleAddFilter(entry: LogEntry) {
    openFilterEditor(null, {
      name: entry.tag || undefined,
      tag: { value: entry.tag, enabled: true },
      message: { value: entry.message, enabled: false, regex: false, ignoreCase: true }
    });
  }

  const ESTIMATED_MENU_WIDTH = 200;
  const ESTIMATED_MENU_HEIGHT = 190;

  function handleContextMenu(e: ReactMouseEvent, entry: LogEntry) {
    e.preventDefault();
    select(entry.id);
    setContextMenu({
      x: Math.min(e.clientX, window.innerWidth - ESTIMATED_MENU_WIDTH),
      y: Math.min(e.clientY, window.innerHeight - ESTIMATED_MENU_HEIGHT),
      entry
    });
  }

  useEffect(() => {
    if (!contextMenu) return;
    const dismiss = () => setContextMenu(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    document.addEventListener('click', dismiss);
    // Capture phase, and *before* React's row handler runs: right-clicking a
    // different row while a menu is open should move the menu there, not have
    // this dismiss immediately race the new menu closed right after it opens.
    document.addEventListener('contextmenu', dismiss, true);
    document.addEventListener('scroll', dismiss, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', dismiss);
      document.removeEventListener('contextmenu', dismiss, true);
      document.removeEventListener('scroll', dismiss, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [contextMenu]);

  return (
    <div className={styles.tableArea}>
      {/* headerBar paints the header's background across the *whole* row, including the
          strip marginRight carves out below (see headerScroll) — a margin is never
          painted, so without this wrapper that strip shows the page background through
          the gap instead of matching the header, unlike the body where a real scrollbar
          fills the equivalent space. */}
      <div className={styles.headerBar}>
        <div ref={headerScrollRef} className={styles.headerScroll} style={{ marginRight: scrollbarWidth }}>
          <div
            className={[styles.headerRow, 'mono'].join(' ')}
            style={{ gridTemplateColumns: gridTemplate, width: '100%', minWidth: totalWidth }}
          >
            {visibleColumns.map((column) => (
              <HeaderCell
                key={column}
                column={column}
                width={columnWidths[column]}
                onResize={(width) => setColumnWidth(column, width)}
              />
            ))}
          </div>
        </div>
      </div>

      <div ref={parentRef} className={styles.scrollArea} style={{ fontSize }} onScroll={handleScroll}>
        {visible.length === 0 && (
          <div className={styles.empty}>
            {entries.length === 0
              ? captureState === 'idle'
                ? 'No device is capturing yet. Pick a device and press Start.'
                : 'Waiting for log output…'
              : 'No lines match the current filters.'}
          </div>
        )}
        <div style={{ height: scaledScroll.safeTotalSize, width: '100%', minWidth: totalWidth, position: 'relative' }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const entry = visible[virtualRow.index];
            // Rows are deliberately flat by default — no automatic per-level tint, no
            // zebra striping (user feedback: too noisy at density). The one background
            // color a row gets is the *configured* color of whichever active filter it
            // matched — i.e. what you set up in the Filter Editor, applied on purpose,
            // not an automatic rule the table invents.
            const filterColor = compiled.rowColor(entry);
            const tint = filterColor ? hexToRgba(filterColor, 0.16) : undefined;
            const selected = entry.id === selectedEntryId;

            return (
              <div
                key={entry.id}
                className={[styles.row, 'mono'].join(' ')}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start - scaledScroll.rowOffsetShift}px)`,
                  gridTemplateColumns: gridTemplate,
                  background: tint,
                  outline: selected ? '1px solid var(--accent)' : undefined,
                  outlineOffset: -1
                }}
                onClick={() => select(entry.id)}
                onDoubleClick={() => handleOpenDetail(entry)}
                onContextMenu={(e) => handleContextMenu(e, entry)}
                title="Double-click for full detail — right-click to copy"
              >
                {visibleColumns.map((column) => (
                  <div key={column} className={styles.cell}>
                    {renderLogCell(column, entry)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {contextMenu && (
        <RowContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          entry={contextMenu.entry}
          onClose={() => setContextMenu(null)}
          onViewDetails={() => handleOpenDetail(contextMenu.entry)}
          onAddFilter={() => handleAddFilter(contextMenu.entry)}
        />
      )}
    </div>
  );
}

function RowContextMenu({
  x,
  y,
  entry,
  onClose,
  onViewDetails,
  onAddFilter
}: {
  x: number;
  y: number;
  entry: LogEntry;
  onClose: () => void;
  onViewDetails: () => void;
  onAddFilter: () => void;
}) {
  async function copy(text: string) {
    await copyToClipboard(text);
    onClose();
  }

  return (
    <div
      className={styles.contextMenu}
      style={{ left: x, top: y }}
      // The document-level dismiss listeners are click/contextmenu/scroll/Escape —
      // stop this menu's own clicks from also being seen as an "outside click".
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <button className={styles.contextMenuItem} onClick={() => copy(entry.raw)}>
        <CopyIcon size={13} />
        Copy Line
      </button>
      <button className={styles.contextMenuItem} onClick={() => copy(entry.message)}>
        <CopyIcon size={13} />
        Copy Message
      </button>
      <div className={styles.contextMenuDivider} />
      <button
        className={styles.contextMenuItem}
        onClick={() => {
          onViewDetails();
          onClose();
        }}
      >
        <ExpandIcon size={13} />
        View Full Detail&hellip;
      </button>
      <div className={styles.contextMenuDivider} />
      <button
        className={styles.contextMenuItem}
        onClick={() => {
          onAddFilter();
          onClose();
        }}
      >
        <FilterPositiveIcon size={13} />
        Add Filter&hellip;
      </button>
    </div>
  );
}

function HeaderCell({
  column,
  width,
  onResize
}: {
  column: ColumnKey;
  width: number;
  onResize: (width: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ startX: number; startWidth: number } | null>(null);

  function handleMouseDown(e: ReactMouseEvent) {
    e.preventDefault();
    dragStart.current = { startX: e.clientX, startWidth: width };
    setDragging(true);
  }

  useEffect(() => {
    if (!dragging) return;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMove(e: MouseEvent) {
      if (!dragStart.current) return;
      onResize(dragStart.current.startWidth + (e.clientX - dragStart.current.startX));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  return (
    <div className={styles.cell} style={{ position: 'relative' }}>
      {COLUMN_LABELS[column].toUpperCase()}
      <div
        className={[styles.columnResizeHandle, dragging ? styles.columnResizing : ''].join(' ')}
        onMouseDown={handleMouseDown}
        title="Drag to resize column"
      />
    </div>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const normalized =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const value = parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
