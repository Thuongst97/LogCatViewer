import styles from './FileLoadingOverlay.module.css';

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

/**
 * Stands in for the log table while a large file streams in (see
 * LARGE_FILE_OPEN_BYTES). The table isn't just covered — App doesn't render it
 * at all until the load finishes, which is the whole point: a virtualized
 * table being appended to ~25 times a second, growing into the millions of
 * rows, re-runs its row measuring and autoscroll on every one of those
 * batches. That churn is what made the toolbar and scrollbars stutter and
 * look like they'd disappeared partway through a big load, and none of the
 * work it was doing was useful — the rows were flying past far too fast to
 * read. Skipping it entirely until there's a final, settled buffer to show
 * costs nothing and keeps the rest of the window responsive throughout.
 */
export function FileLoadingOverlay({ percent, totalBytes }: { percent: number; totalBytes: number }) {
  const processedBytes = Math.round((percent / 100) * totalBytes);
  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <div className={styles.titleRow}>
          <span className={styles.spinner} />
          <span className={styles.title}>Loading log file…</span>
        </div>

        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${percent}%` }} />
        </div>

        <div className={styles.statusRow}>
          <span>{percent}%</span>
          <span className="mono">
            {formatBytes(processedBytes)} of {formatBytes(totalBytes)}
          </span>
        </div>

        <div className={styles.hint}>
          The log view opens as soon as this finishes — reading it while lines are still streaming in would only slow the load down.
        </div>
      </div>
    </div>
  );
}
