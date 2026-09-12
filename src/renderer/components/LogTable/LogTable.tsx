import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import styles from './LogTable.module.css';
import { useLogStore } from '../../state/logStore';
import { useFilterStore } from '../../state/filterStore';
import { useDeviceStore } from '../../state/deviceStore';
import { useUiStore } from '../../state/uiStore';
import { useTableSettingsStore } from '../../state/tableSettingsStore';
import { useVisibleEntries } from '../../lib/useVisibleEntries';
import { computeTableLayout } from '../../lib/tableLayout';
import { levelColorVar } from '../../lib/levelColors';
import { highlightText } from '../../lib/highlight';
import { copyToClipboard } from '../../lib/clipboard';
import { CopyIcon, ExpandIcon } from '../../lib/icons';
import { COLUMN_LABELS, type ColumnKey, type LogEntry, type ResizableColumnKey } from '@shared/types';

interface ContextMenuState {
  x: number;
  y: number;
  entry: LogEntry;
}

const AUTOSCROLL_SLOP_MULTIPLIER = 2;

/** The dense, virtualized log table — only visible rows exist in the DOM regardless of
 *  buffer size (plan §8.3), which is what keeps a 100k-line buffer scrolling smoothly.
 *  Columns, their widths, row height, and text size all come from tableSettingsStore
 *  (Settings > Table), and every fixed-width column is drag-resizable from its header
 *  cell's right edge — `message` always fills whatever space is left. */
export function LogTable() {
  const entries = useLogStore((s) => s.entries);
  const selectedEntryId = useLogStore((s) => s.selectedEntryId);
  const select = useLogStore((s) => s.select);
  const autoscroll = useLogStore((s) => s.autoscroll);
  const scrollRequest = useLogStore((s) => s.scrollRequest);
  const clearScrollRequest = useLogStore((s) => s.clearScrollRequest);
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const searchRegex = useFilterStore((s) => s.searchRegex);
  const searchCaseSensitive = useFilterStore((s) => s.searchCaseSensitive);
  const captureState = useDeviceStore((s) => s.captureState);
  const openLogDetailDialog = useUiStore((s) => s.openLogDetailDialog);
  const { visible, compiled } = useVisibleEntries();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const columns = useTableSettingsStore((s) => s.columns);
  const columnWidths = useTableSettingsStore((s) => s.columnWidths);
  const fontSize = useTableSettingsStore((s) => s.fontSize);
  const rowHeight = useTableSettingsStore((s) => s.rowHeight);
  const setColumnWidth = useTableSettingsStore((s) => s.setColumnWidth);

  const { visibleColumns, gridTemplate } = useMemo(
    () => computeTableLayout({ columns, columnWidths }),
    [columns, columnWidths]
  );

  const parentRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);

  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 20
  });

  useEffect(() => {
    virtualizer.measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowHeight]);

  useEffect(() => {
    if (!autoscroll || userScrolledUp.current || visible.length === 0) return;
    virtualizer.scrollToIndex(visible.length - 1, { align: 'end' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.length, autoscroll]);

  // Jump to a specific entry on request (e.g. a Search Results double-click — plan
  // follow-up, mirrors DLT Viewer). Only takes effect if the entry is currently
  // visible under the active filters; if it's filtered out there's nothing to
  // scroll to, but it stays selected so opening the detail dialog still shows it.
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
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    userScrolledUp.current = distanceFromBottom > rowHeight * AUTOSCROLL_SLOP_MULTIPLIER;
  }

  // Double-click opens the full detail dialog (plan follow-up: replaces the old
  // always-on sidebar inspector — mirrors DLT Viewer's message-detail popup).
  function handleOpenDetail(entry: LogEntry) {
    select(entry.id);
    openLogDetailDialog();
  }

  const ESTIMATED_MENU_WIDTH = 200;
  const ESTIMATED_MENU_HEIGHT = 150;

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

  function renderCell(column: ColumnKey, entry: LogEntry): ReactNode {
    switch (column) {
      case 'index':
        return <span style={{ color: 'var(--text-muted)' }}>{entry.id}</span>;
      case 'time':
        return <span style={{ color: 'var(--text-muted)' }}>{entry.time}</span>;
      case 'pid':
        return <span style={{ color: 'var(--text-secondary)' }}>{entry.pid}</span>;
      case 'tid':
        return <span style={{ color: 'var(--text-secondary)' }}>{entry.tid}</span>;
      case 'level':
        return <span style={{ color: levelColorVar(entry.level), fontWeight: 700 }}>{entry.level}</span>;
      case 'tag':
        return <span style={{ color: 'var(--text-secondary)' }}>{highlightText(entry.tag, searchQuery, searchRegex, searchCaseSensitive)}</span>;
      case 'message': {
        const emphasized = entry.level === 'E' || entry.level === 'F';
        return (
          <span style={{ color: emphasized ? levelColorVar(entry.level) : 'var(--text-primary)' }}>
            {highlightText(entry.message, searchQuery, searchRegex, searchCaseSensitive)}
          </span>
        );
      }
    }
  }

  return (
    <div className={styles.tableArea}>
      <div className={[styles.headerRow, 'mono'].join(' ')} style={{ gridTemplateColumns: gridTemplate }}>
        {visibleColumns.map((column) => (
          <HeaderCell
            key={column}
            column={column}
            width={column === 'message' ? null : columnWidths[column as ResizableColumnKey]}
            onResize={(width) => setColumnWidth(column as ResizableColumnKey, width)}
          />
        ))}
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
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
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
                  transform: `translateY(${virtualRow.start}px)`,
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
                    {renderCell(column, entry)}
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
  onViewDetails
}: {
  x: number;
  y: number;
  entry: LogEntry;
  onClose: () => void;
  onViewDetails: () => void;
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
    </div>
  );
}

function HeaderCell({
  column,
  width,
  onResize
}: {
  column: ColumnKey;
  /** null for the flexible `message` column, which has no drag handle. */
  width: number | null;
  onResize: (width: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ startX: number; startWidth: number } | null>(null);

  function handleMouseDown(e: ReactMouseEvent) {
    if (width === null) return;
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
      {width !== null && (
        <div
          className={[styles.columnResizeHandle, dragging ? styles.columnResizing : ''].join(' ')}
          onMouseDown={handleMouseDown}
          title="Drag to resize column"
        />
      )}
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
