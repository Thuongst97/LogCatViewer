import { useState } from 'react';
import styles from './SettingsDialog.module.css';
import { Modal, DialogHeader, DialogBody, DialogFooter } from '../common/Modal';
import { Button, Checkbox, LabelXs, Pill } from '../common/ui';
import { GearIcon } from '../../lib/icons';
import { useUiStore, applyThemeToDocument, type EffectiveTheme } from '../../state/uiStore';
import { useTableSettingsStore, MIN_FONT_SIZE, MAX_FONT_SIZE, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT } from '../../state/tableSettingsStore';
import { getSystemTheme } from '../../lib/theme';
import { COLUMN_LABELS, type ColumnKey, type ThemePreference } from '@shared/types';

const TOGGLEABLE_COLUMNS: ColumnKey[] = ['index', 'time', 'pid', 'tid', 'level', 'tag'];

type Tab = 'general' | 'table';

export function SettingsDialog() {
  const closeDialog = useUiStore((s) => s.closeDialog);
  const [tab, setTab] = useState<Tab>('table');

  return (
    <Modal onClose={closeDialog} width={440}>
      <DialogHeader icon={<GearIcon size={16} color="var(--accent-text)" />} title="Settings" subtitle="Preferences and log table display" onClose={closeDialog} />

      <div className={styles.tabs}>
        <button className={[styles.tab, tab === 'general' ? styles.tabActive : ''].join(' ')} onClick={() => setTab('general')}>
          General
        </button>
        <button className={[styles.tab, tab === 'table' ? styles.tabActive : ''].join(' ')} onClick={() => setTab('table')}>
          Table
        </button>
      </div>

      <DialogBody>{tab === 'general' ? <GeneralTab /> : <TableTab />}</DialogBody>

      <DialogFooter>
        <Button variant="fill" onClick={closeDialog}>
          Done
        </Button>
      </DialogFooter>
    </Modal>
  );
}

function GeneralTab() {
  const themePreference = useUiStore((s) => s.themePreference);
  const setThemePreference = useUiStore((s) => s.setThemePreference);
  const setEffectiveTheme = useUiStore((s) => s.setEffectiveTheme);

  async function handleThemeChange(pref: ThemePreference) {
    setThemePreference(pref);
    await window.api.settings.set({ theme: pref });
    const resolved: EffectiveTheme = pref === 'system' ? getSystemTheme() : pref;
    setEffectiveTheme(resolved);
    applyThemeToDocument(resolved);
  }

  return (
    <div className={styles.section}>
      <LabelXs>Theme</LabelXs>
      <div className={styles.pillRow}>
        <Pill active={themePreference === 'light'} onClick={() => handleThemeChange('light')}>
          Light
        </Pill>
        <Pill active={themePreference === 'dark'} onClick={() => handleThemeChange('dark')}>
          Dark
        </Pill>
        <Pill active={themePreference === 'system'} onClick={() => handleThemeChange('system')}>
          System
        </Pill>
      </div>
    </div>
  );
}

function TableTab() {
  const columns = useTableSettingsStore((s) => s.columns);
  const columnWidths = useTableSettingsStore((s) => s.columnWidths);
  const fontSize = useTableSettingsStore((s) => s.fontSize);
  const rowHeight = useTableSettingsStore((s) => s.rowHeight);
  const setColumnVisible = useTableSettingsStore((s) => s.setColumnVisible);
  const setFontSize = useTableSettingsStore((s) => s.setFontSize);
  const setRowHeight = useTableSettingsStore((s) => s.setRowHeight);
  const resetToDefaults = useTableSettingsStore((s) => s.resetToDefaults);

  const visibleCount = TOGGLEABLE_COLUMNS.filter((c) => columns[c]).length + 1; // +1 for message, always on

  return (
    <>
      <div className={styles.section}>
        <LabelXs>Row height ({rowHeight}px)</LabelXs>
        <div className={styles.sliderRow}>
          <input
            type="range"
            min={MIN_ROW_HEIGHT}
            max={MAX_ROW_HEIGHT}
            value={rowHeight}
            onChange={(e) => setRowHeight(Number(e.target.value))}
          />
          <span className={[styles.sliderValue, 'mono'].join(' ')}>{rowHeight}px</span>
        </div>
      </div>

      <div className={styles.section}>
        <LabelXs>Text size ({fontSize}px)</LabelXs>
        <div className={styles.sliderRow}>
          <input
            type="range"
            min={MIN_FONT_SIZE}
            max={MAX_FONT_SIZE}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
          />
          <span className={[styles.sliderValue, 'mono'].join(' ')}>{fontSize}px</span>
        </div>
      </div>

      <div className={styles.section}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <LabelXs>Columns to show ({visibleCount}/7)</LabelXs>
          <button
            onClick={resetToDefaults}
            style={{ background: 'none', border: 'none', color: 'var(--accent-text)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
          >
            Reset to defaults
          </button>
        </div>
        <div className={styles.columnGrid}>
          {TOGGLEABLE_COLUMNS.map((column) => (
            <div key={column} className={styles.columnCheck}>
              <Checkbox checked={columns[column]} onChange={(v) => setColumnVisible(column, v)} aria-label={`Show ${COLUMN_LABELS[column]}`} />
              <span className={styles.columnCheckLabel}>
                Show {COLUMN_LABELS[column]}
                <span style={{ color: 'var(--text-muted)' }} className="mono">
                  {' '}
                  ({columnWidths[column]}px)
                </span>
              </span>
            </div>
          ))}
          <div className={styles.columnCheck}>
            <Checkbox checked disabled onChange={() => {}} aria-label="Show Message (always shown)" />
            <span className={[styles.columnCheckLabel, styles.columnCheckLabelLocked].join(' ')} title="Message always shows — hiding every column isn't useful">
              Show Message
              <span style={{ color: 'var(--text-muted)' }} className="mono">
                {' '}
                ({columnWidths.message}px)
              </span>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
