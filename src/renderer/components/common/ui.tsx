// Small shared primitives so the Filter Editor / Export / Toolbar don't each
// reimplement button/chip/checkbox markup. Deliberately thin — this is not a
// general design-system, just the handful of controls the mockups repeat.
import type { ButtonHTMLAttributes, PropsWithChildren, ReactNode } from 'react';
import styles from './ui.module.css';
import { CheckIcon } from '../../lib/icons';

type ButtonVariant = 'ghost' | 'fill' | 'plain' | 'active';

export function Button({
  variant = 'plain',
  disabled,
  children,
  ...rest
}: PropsWithChildren<{ variant?: ButtonVariant } & ButtonHTMLAttributes<HTMLButtonElement>>) {
  const variantClass =
    variant === 'ghost' ? styles.btnGhost : variant === 'fill' ? styles.btnFill : variant === 'active' ? styles.btnActive : '';
  const className = [styles.btn, variantClass, disabled ? styles.btnDisabled : ''].filter(Boolean).join(' ');
  return (
    <button className={className} disabled={disabled} {...rest}>
      {children}
    </button>
  );
}

export function Chip({
  active,
  dim,
  children,
  ...rest
}: PropsWithChildren<{ active?: boolean; dim?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>>) {
  const className = [styles.chip, active ? styles.chipActive : '', dim ? styles.chipDim : ''].filter(Boolean).join(' ');
  return (
    <button className={className} type="button" {...rest}>
      {children}
    </button>
  );
}

export function Pill({
  active,
  children,
  ...rest
}: PropsWithChildren<{ active?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>>) {
  const className = [styles.pill, active ? styles.pillActive : ''].join(' ');
  return (
    <button className={className} type="button" {...rest}>
      {children}
    </button>
  );
}

export function Checkbox({
  checked,
  onChange,
  disabled,
  'aria-label': ariaLabel
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  'aria-label'?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className={[styles.checkbox, checked ? styles.checkboxOn : '', disabled ? styles.checkboxDisabled : ''].join(' ')}
      onClick={() => !disabled && onChange(!checked)}
    >
      {checked && <CheckIcon size={11} color={disabled ? 'var(--text-muted)' : 'var(--accent)'} />}
    </button>
  );
}

export function LabelXs({ children }: PropsWithChildren) {
  return <span className={styles.labelXs}>{children}</span>;
}

export function TextField({
  value,
  onChange,
  placeholder,
  mono,
  trailing,
  disabled
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
  trailing?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className={styles.fieldInput} style={{ justifyContent: trailing ? 'space-between' : undefined, opacity: disabled ? 0.5 : 1 }}>
      <input
        className={styles.fieldInputEl}
        style={mono ? { fontFamily: 'var(--font-mono)' } : undefined}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      {trailing}
    </div>
  );
}
