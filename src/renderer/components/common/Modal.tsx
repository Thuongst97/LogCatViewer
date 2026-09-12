import { useEffect, type PropsWithChildren, type ReactNode } from 'react';
import styles from './Modal.module.css';
import { XIcon } from '../../lib/icons';

export function Modal({ onClose, width = 460, children }: PropsWithChildren<{ onClose: () => void; width?: number }>) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className={styles.backdrop} onMouseDown={onClose} role="presentation">
      <div className={styles.card} style={{ width }} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({
  icon,
  title,
  subtitle,
  onClose
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  onClose: () => void;
}) {
  return (
    <div className={styles.header}>
      <div className={styles.iconWrap}>{icon}</div>
      <div className={styles.headerText}>
        <div className={styles.headerTitle}>{title}</div>
        <div className={styles.headerSubtitle}>{subtitle}</div>
      </div>
      <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
        <XIcon size={15} color="var(--text-muted)" />
      </button>
    </div>
  );
}

export function DialogBody({ children }: PropsWithChildren) {
  return <div className={styles.body}>{children}</div>;
}

export function DialogFooter({ children }: PropsWithChildren) {
  return <div className={styles.footer}>{children}</div>;
}
