import { useEffect, useRef, useState } from 'react';
import styles from './LogDetailDialog.module.css';
import { Modal, DialogHeader, DialogBody, DialogFooter } from '../common/Modal';
import { Button } from '../common/ui';
import { CopyIcon, TerminalMarkIcon } from '../../lib/icons';
import { useSelectedEntry } from '../../state/logStore';
import { useUiStore } from '../../state/uiStore';
import { levelColorVar } from '../../lib/levelColors';
import { copyToClipboard } from '../../lib/clipboard';

type Tab = 'message' | 'raw' | 'stack';

/**
 * Full detail for one log line, opened by double-clicking a row in the main table
 * (mirrors DLT Viewer's message-detail popup). Replaces the old always-on sidebar
 * inspector — plan follow-up: the user wanted that screen space back and an easy
 * way to copy a line out of the app, which a modal with an explicit Copy button
 * serves better than a passive side panel ever did.
 */
export function LogDetailDialog() {
  const closeDialog = useUiStore((s) => s.closeDialog);
  const entry = useSelectedEntry();
  const [tab, setTab] = useState<Tab>('message');
  const [copied, setCopied] = useState(false);
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // If the buffer gets cleared (or the entry otherwise disappears) while this is
  // open, there's nothing left to show — close rather than render a blank dialog.
  useEffect(() => {
    if (!entry) closeDialog();
  }, [entry, closeDialog]);

  useEffect(() => () => {
    if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
  }, []);

  if (!entry) return null;

  const copyTarget =
    tab === 'message' ? entry.message : tab === 'raw' ? entry.raw : entry.continuation.join('\n');
  const copyLabel = tab === 'message' ? 'Copy Message' : tab === 'raw' ? 'Copy Raw Line' : 'Copy Stack Trace';

  async function handleCopy() {
    const ok = await copyToClipboard(copyTarget);
    if (!ok) return;
    setCopied(true);
    if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    copyResetTimer.current = setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Modal onClose={closeDialog} width={680}>
      <DialogHeader
        icon={<TerminalMarkIcon size={16} color="var(--accent-text)" />}
        title={`Log Line #${entry.id}`}
        subtitle={`${entry.date} ${entry.time} · ${entry.deviceId}`}
        onClose={closeDialog}
      />

      <div className={styles.tabs}>
        <button className={[styles.tab, tab === 'message' ? styles.tabActive : ''].join(' ')} onClick={() => setTab('message')}>
          Message
        </button>
        <button className={[styles.tab, tab === 'raw' ? styles.tabActive : ''].join(' ')} onClick={() => setTab('raw')}>
          Raw
        </button>
        <button className={[styles.tab, tab === 'stack' ? styles.tabActive : ''].join(' ')} onClick={() => setTab('stack')}>
          Stack Trace
        </button>
      </div>

      <DialogBody>
        {tab === 'message' ? (
          <>
            <div className={[styles.fieldGrid, 'mono'].join(' ')}>
              <span className={styles.fieldLabel}>Index</span>
              <span className={styles.fieldValue}>{entry.id}</span>
              <span className={styles.fieldLabel}>Time</span>
              <span className={styles.fieldValue}>{entry.time}</span>
              <span className={styles.fieldLabel}>PID / TID</span>
              <span className={styles.fieldValue}>
                {entry.pid} / {entry.tid}
              </span>
              <span className={styles.fieldLabel}>Level</span>
              <span>
                <span className={[styles.levelBadge, 'mono'].join(' ')} style={{ color: levelColorVar(entry.level) }}>
                  {entry.level}
                </span>
              </span>
              <span className={styles.fieldLabel}>Tag</span>
              <span className={styles.fieldValue} style={{ color: 'var(--accent-text)' }}>
                {entry.tag}
              </span>
              <span className={styles.fieldLabel}>Device</span>
              <span className={styles.fieldValue} style={{ wordBreak: 'break-all' }}>
                {entry.deviceId}
              </span>
            </div>
            <div className={styles.divider} style={{ margin: '14px 0' }} />
            <div className={styles.messageBlock}>
              <span
                className="mono"
                style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}
              >
                Message
              </span>
              <span className={[styles.messageText, 'mono'].join(' ')} style={{ color: levelColorVar(entry.level) }}>
                {entry.message}
              </span>
            </div>
          </>
        ) : tab === 'raw' ? (
          <pre className={[styles.rawText, 'mono'].join(' ')}>{entry.raw}</pre>
        ) : entry.continuation.length === 0 ? (
          <div className={styles.empty}>
            No additional lines were folded into this entry.
            <br />
            <br />
            Note: repeated-header crash dumps (e.g. FATAL EXCEPTION) show as separate rows in the
            table — this tab only covers a single log call whose message contained embedded
            newlines.
          </div>
        ) : (
          <pre className={[styles.rawText, 'mono'].join(' ')}>{entry.continuation.join('\n')}</pre>
        )}
      </DialogBody>

      <DialogFooter>
        {copied && <span className={[styles.copyFeedback, 'mono'].join(' ')} style={{ fontSize: 11.5, marginRight: 'auto' }}>Copied</span>}
        <Button variant="ghost" onClick={closeDialog}>
          Close
        </Button>
        <Button variant="fill" onClick={handleCopy} disabled={copyTarget.length === 0}>
          <CopyIcon size={13} />
          {copyLabel}
        </Button>
      </DialogFooter>
    </Modal>
  );
}
