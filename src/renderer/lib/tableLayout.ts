import { COLUMN_ORDER, type ColumnKey, type TableSettings } from '@shared/types';

/** Visible columns in fixed left-to-right order, the CSS grid-template-columns
 *  string for them, and their summed *minimum* pixel width. `message` — now a
 *  resizable column instead of a plain auto-filling `1fr` (see
 *  ResizableColumnKey) — still gets `minmax(width, 1fr)`, not a bare px track:
 *  on a window with room to spare it still absorbs the extra space exactly
 *  like before (no dead strip of background past a fixed-width column on a
 *  wide screen), but it won't shrink below `width`, so when the columns'
 *  combined *minimum* exceeds the viewport (a narrow window, or Message
 *  resized wide), the row overflows and the table scrolls to the rest instead
 *  of ellipsis-truncating with no way to read it. `totalWidth` is that summed
 *  minimum, used as a `min-width` floor by the table/dock (see LogTable.tsx) —
 *  not a `width`, which would defeat the "still fills spare room" half of this.
 *  Hidden columns are omitted entirely, not collapsed to 0 width, so they
 *  don't leave a stray border behind. */
export function computeTableLayout(table: Pick<TableSettings, 'columns' | 'columnWidths'>): {
  visibleColumns: ColumnKey[];
  gridTemplate: string;
  totalWidth: number;
} {
  const visibleColumns = COLUMN_ORDER.filter((key) => table.columns[key]);
  const widths = visibleColumns.map((key) => table.columnWidths[key]);
  const gridTemplate = widths
    .map((w, i) => (i === widths.length - 1 ? `minmax(${w}px, 1fr)` : `${w}px`))
    .join(' ');
  const totalWidth = widths.reduce((a, b) => a + b, 0);
  return { visibleColumns, gridTemplate, totalWidth };
}
