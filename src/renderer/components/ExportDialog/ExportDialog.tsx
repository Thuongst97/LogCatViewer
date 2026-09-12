import { useMemo, useState } from 'react';
import styles from './ExportDialog.module.css';
import { Modal, DialogHeader, DialogBody, DialogFooter } from '../common/Modal';
import { Button, Checkbox, LabelXs, Pill } from '../common/ui';
import { ExportIcon } from '../../lib/icons';
import { useUiStore } from '../../state/uiStore';
import { useLogStore } from '../../state/logStore';
import { useFilterStore } from '../../state/filterStore';
import { useVisibleEntries } from '../../lib/useVisibleEntries';
import { matchesFilter } from '../../lib/filterEngine';
import type { ExportFormat, ExportScope } from '@shared/types';

const FORMATS: { value: ExportFormat; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'json', label: 'JSON' },
  { value: 'csv', label: 'CSV' },
  { value: 'raw', label: 'Raw' },
  { value: 'html', label: 'HTML' }
];

const SCOPES: { value: ExportScope; label: string }[] = [
  { value: 'all', label: 'All Lines' },
  { value: 'filtered', label: 'Filtered View' },
  { value: 'marked', label: 'Marked Only' }
];

export function ExportDialog() {
  const closeDialog = useUiStore((s) => s.closeDialog);
  const entries = useLogStore((s) => s.entries);
  const filters = useFilterStore((s) => s.filters);
  const { visible } = useVisibleEntries();

  const [format, setFormat] = useState<ExportFormat>('csv');
  const [scope, setScope] = useState<ExportScope>('filtered');
  const [includeHeaders, setIncludeHeaders] = useState(true);
  const [onlyVisibleColumns, setOnlyVisibleColumns] = useState(false);
  const [destinationPath, setDestinationPath] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // "Marked Only" is deliberately independent of the live "Filters Applied" toggle and
  // of positive/negative filters — it's specifically "lines any active Marker-type
  // filter matched", which is an explicit export query, not a view-state snapshot.
  const markerFilters = useMemo(() => filters.filter((f) => f.active && f.type === 'marker'), [filters]);
  const marked = useMemo(
    () => entries.filter((e) => markerFilters.some((f) => matchesFilter(f, e))),
    [entries, markerFilters]
  );
  const scopedEntries = scope === 'all' ? entries : scope === 'filtered' ? visible : marked;

  async function handleBrowse() {
    const path = await window.api.export.showSaveDialog('logcat-export', format);
    if (path) setDestinationPath(path);
  }

  async function handleExport() {
    if (!destinationPath) return;
    setExporting(true);
    try {
      await window.api.export.run({ format, scope, includeHeaders, onlyVisibleColumns, destinationPath }, scopedEntries);
      closeDialog();
    } finally {
      setExporting(false);
    }
  }

  return (
    <Modal onClose={closeDialog} width={400}>
      <DialogHeader icon={<ExportIcon size={16} color="var(--accent-text)" />} title="Export Log" subtitle="Save the current buffer to a file" onClose={closeDialog} />
      <DialogBody>
        <div className={styles.section}>
          <LabelXs>Format</LabelXs>
          <div className={styles.pillRow}>
            {FORMATS.map((f) => (
              <Pill key={f.value} active={format === f.value} onClick={() => setFormat(f.value)}>
                {f.label}
              </Pill>
            ))}
          </div>
        </div>

        <div className={styles.section}>
          <LabelXs>Scope</LabelXs>
          <div className={styles.pillRow}>
            {SCOPES.map((s) => (
              <Pill key={s.value} active={scope === s.value} onClick={() => setScope(s.value)}>
                {s.label}
              </Pill>
            ))}
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.checkRow}>
            <Checkbox checked={includeHeaders} onChange={setIncludeHeaders} aria-label="Include column headers" />
            <span style={{ fontSize: 12 }}>Include column headers</span>
          </div>
          <div className={styles.checkRow}>
            <Checkbox checked={onlyVisibleColumns} onChange={setOnlyVisibleColumns} aria-label="Only visible columns" />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Only visible columns</span>
          </div>
        </div>

        <div className={styles.section}>
          <LabelXs>Destination</LabelXs>
          <div className={styles.pathRow}>
            <div className={[styles.pathText, 'mono'].join(' ')}>{destinationPath ?? 'Choose a destination…'}</div>
            <Button variant="ghost" onClick={handleBrowse}>
              Browse&hellip;
            </Button>
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <span className={styles.summary}>{scopedEntries.length.toLocaleString()} lines will be exported</span>
        <Button variant="ghost" onClick={closeDialog}>
          Cancel
        </Button>
        <Button variant="fill" onClick={handleExport} disabled={!destinationPath || exporting}>
          {exporting ? 'Exporting…' : 'Export'}
        </Button>
      </DialogFooter>
    </Modal>
  );
}
