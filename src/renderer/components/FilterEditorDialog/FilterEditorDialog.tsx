import { useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './FilterEditorDialog.module.css';
import { Modal, DialogHeader, DialogBody, DialogFooter } from '../common/Modal';
import { Button, Checkbox, LabelXs, TextField } from '../common/ui';
import { FilterNegativeIcon, FilterPositiveIcon, MarkerIcon, PlusIcon } from '../../lib/icons';
import { useFilterStore } from '../../state/filterStore';
import { useUiStore } from '../../state/uiStore';
import { LOG_LEVELS, createEmptyFilter, type Filter, type LogLevel } from '@shared/types';
import { levelColorVar } from '../../lib/levelColors';

const PRESET_COLORS = ['#f56c6c', '#f5b942', '#6fcf7d', '#3d8bef', '#a56bd6'];

export function FilterEditorDialog() {
  const editingFilterId = useUiStore((s) => s.editingFilterId);
  const closeDialog = useUiStore((s) => s.closeDialog);
  const filters = useFilterStore((s) => s.filters);
  const addFilter = useFilterStore((s) => s.addFilter);
  const updateFilter = useFilterStore((s) => s.updateFilter);

  const existing = editingFilterId ? filters.find((f) => f.id === editingFilterId) : null;
  const [draft, setDraft] = useState<Filter>(existing ?? createEmptyFilter());

  useEffect(() => {
    setDraft(existing ?? createEmptyFilter());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingFilterId]);

  function patch(p: Partial<Filter>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  function handleSave() {
    if (existing) updateFilter(existing.id, draft);
    else addFilter(draft);
    closeDialog();
  }

  return (
    <Modal onClose={closeDialog} width={400}>
      <DialogHeader
        icon={<FilterPositiveIcon size={16} color="var(--accent-text)" />}
        title={existing ? 'Edit Filter' : 'New Filter'}
        subtitle="Define a matching rule and its appearance"
        onClose={closeDialog}
      />
      <DialogBody>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Checkbox checked={draft.active} onChange={(v) => patch({ active: v })} aria-label="Active" />
          <span style={{ fontSize: 12.5, fontWeight: 500 }}>Active</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <LabelXs>Name</LabelXs>
          <TextField value={draft.name} onChange={(v) => patch({ name: v })} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <LabelXs>Type</LabelXs>
          <div className={styles.typeRow}>
            <TypeOption label="Positive" icon={<FilterPositiveIcon size={14} />} active={draft.type === 'positive'} onClick={() => patch({ type: 'positive' })} />
            <TypeOption label="Negative" icon={<FilterNegativeIcon size={14} />} active={draft.type === 'negative'} onClick={() => patch({ type: 'negative' })} />
            <TypeOption label="Marker" icon={<MarkerIcon size={14} />} active={draft.type === 'marker'} onClick={() => patch({ type: 'marker' })} />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <LabelXs>Highlight Color</LabelXs>
          <div className={styles.swatchRow}>
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                className={[styles.swatch, draft.color === color ? styles.swatchSelected : ''].join(' ')}
                style={{ background: color }}
                onClick={() => patch({ color })}
                aria-label={`Use color ${color}`}
              />
            ))}
            <CustomColorSwatch
              value={draft.color}
              isCustom={!PRESET_COLORS.includes(draft.color)}
              onChange={(color) => patch({ color })}
            />
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--border)' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <LabelXs>Match Criteria</LabelXs>

          <FieldRow
            label="Tag"
            enabled={draft.tag.enabled}
            onToggle={(v) => patch({ tag: { ...draft.tag, enabled: v } })}
          >
            <TextField value={draft.tag.value} onChange={(v) => patch({ tag: { ...draft.tag, value: v } })} placeholder="(any)" mono disabled={!draft.tag.enabled} />
          </FieldRow>

          <FieldRow
            label="PID"
            enabled={draft.pid.enabled}
            onToggle={(v) => patch({ pid: { ...draft.pid, enabled: v } })}
          >
            <TextField
              value={draft.pid.value === null ? '' : String(draft.pid.value)}
              onChange={(v) => patch({ pid: { ...draft.pid, value: v === '' ? null : Number(v.replace(/\D/g, '')) } })}
              placeholder="(any)"
              mono
              disabled={!draft.pid.enabled}
            />
          </FieldRow>

          <FieldRow
            label="Message"
            enabled={draft.message.enabled}
            onToggle={(v) => patch({ message: { ...draft.message, enabled: v } })}
          >
            <TextField
              value={draft.message.value}
              onChange={(v) => patch({ message: { ...draft.message, value: v } })}
              placeholder="optional keyword or regex"
              mono
              disabled={!draft.message.enabled}
              trailing={
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    className={[styles.miniChip, draft.message.regex ? styles.miniChipActive : ''].join(' ')}
                    onClick={() => patch({ message: { ...draft.message, regex: !draft.message.regex } })}
                  >
                    .*
                  </button>
                  <button
                    className={[styles.miniChip, draft.message.ignoreCase ? '' : styles.miniChipActive].join(' ')}
                    onClick={() => patch({ message: { ...draft.message, ignoreCase: !draft.message.ignoreCase } })}
                    title="Case sensitive"
                  >
                    Aa
                  </button>
                </div>
              }
            />
          </FieldRow>

          <FieldRow
            label="Min Level"
            enabled={draft.minLevel.enabled}
            onToggle={(v) => patch({ minLevel: { ...draft.minLevel, enabled: v } })}
          >
            <div className={styles.levelChipRow}>
              {LOG_LEVELS.map((level: LogLevel) => (
                <button
                  key={level}
                  className={styles.miniChip}
                  style={{
                    width: 26,
                    height: 24,
                    fontSize: 11,
                    opacity: draft.minLevel.enabled ? 1 : 0.35,
                    color: draft.minLevel.value === level ? levelColorVar(level) : undefined,
                    borderColor: draft.minLevel.value === level ? levelColorVar(level) : undefined
                  }}
                  onClick={() => patch({ minLevel: { ...draft.minLevel, value: level, enabled: true } })}
                >
                  {level}
                </button>
              ))}
            </div>
          </FieldRow>

          <FieldRow
            label="Process"
            enabled={draft.process.enabled}
            onToggle={(v) => patch({ process: { ...draft.process, enabled: v } })}
          >
            <TextField value={draft.process.value} onChange={(v) => patch({ process: { ...draft.process, value: v } })} placeholder="(any device)" mono disabled={!draft.process.enabled} />
          </FieldRow>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={closeDialog}>
          Cancel
        </Button>
        <Button variant="fill" onClick={handleSave}>
          Save Filter
        </Button>
      </DialogFooter>
    </Modal>
  );
}

/**
 * Opens the OS's native color picker via a visually-hidden `<input type="color">` —
 * no extra picker UI to build or maintain, and it matches how every other native app
 * lets you pick an arbitrary color. When the current filter color isn't one of the
 * presets, this swatch itself shows that custom color (with the same selected-ring
 * treatment as a preset) instead of the neutral "+" glyph.
 */
function CustomColorSwatch({
  value,
  isCustom,
  onChange
}: {
  value: string;
  isCustom: boolean;
  onChange: (color: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div style={{ position: 'relative', width: 20, height: 20, flexShrink: 0 }}>
      <button
        type="button"
        className={[styles.swatch, styles.swatchCustom, isCustom ? styles.swatchSelected : ''].join(' ')}
        style={isCustom ? { background: value, border: 'none' } : undefined}
        onClick={() => inputRef.current?.click()}
        aria-label="Choose a custom color"
        title="Choose a custom color"
      >
        {!isCustom && <PlusIcon size={10} color="var(--text-muted)" />}
      </button>
      <input
        ref={inputRef}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={styles.hiddenColorInput}
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  );
}

function TypeOption({ label, icon, active, onClick }: { label: string; icon: ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button className={[styles.typeOption, active ? styles.typeOptionActive : ''].join(' ')} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function FieldRow({
  label,
  enabled,
  onToggle,
  children
}: {
  label: string;
  enabled: boolean;
  onToggle: (value: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className={styles.fieldRow}>
      <Checkbox checked={enabled} onChange={onToggle} aria-label={`Enable ${label} match`} />
      <span className={[styles.fieldLabel, enabled ? styles.fieldLabelEnabled : styles.fieldLabelDisabled].join(' ')}>{label}</span>
      <div className={styles.fieldGrow}>{children}</div>
    </div>
  );
}
