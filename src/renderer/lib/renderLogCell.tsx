import type { ReactNode } from 'react';
import { levelColorVar } from './levelColors';
import type { ColumnKey, LogEntry } from '@shared/types';

/**
 * Renders one log-table cell's content and color — shared by the main LogTable
 * and the Search Results dock so the two stay visually identical (every column
 * colored by the entry's LEVEL) without the logic living in two places that
 * can drift apart.
 */
export function renderLogCell(column: ColumnKey, entry: LogEntry): ReactNode {
  const color = levelColorVar(entry.level);
  switch (column) {
    case 'index':
      return <span style={{ color }}>{entry.id}</span>;
    case 'time':
      return <span style={{ color }}>{entry.time}</span>;
    case 'pid':
      return <span style={{ color }}>{entry.pid}</span>;
    case 'tid':
      return <span style={{ color }}>{entry.tid}</span>;
    case 'level':
      return <span style={{ color, fontWeight: 700 }}>{entry.level}</span>;
    case 'tag':
      return <span style={{ color }}>{entry.tag}</span>;
    case 'message':
      return <span style={{ color }}>{entry.message}</span>;
  }
}
