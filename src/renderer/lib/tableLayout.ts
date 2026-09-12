import { COLUMN_ORDER, type ColumnKey, type ResizableColumnKey, type TableSettings } from '@shared/types';

/** Visible columns in fixed left-to-right order, and the CSS grid-template-columns
 *  string for them — `message` always renders last as `1fr` so it absorbs whatever
 *  space the fixed-width columns don't use (plan follow-up: "columns shall expand
 *  flexibly"). Hidden columns are omitted entirely, not collapsed to 0 width, so
 *  they don't leave a stray border behind. */
export function computeTableLayout(table: Pick<TableSettings, 'columns' | 'columnWidths'>): {
  visibleColumns: ColumnKey[];
  gridTemplate: string;
} {
  const visibleColumns = COLUMN_ORDER.filter((key) => table.columns[key]);
  const gridTemplate = visibleColumns
    .map((key) => (key === 'message' ? '1fr' : `${table.columnWidths[key as ResizableColumnKey]}px`))
    .join(' ');
  return { visibleColumns, gridTemplate };
}
