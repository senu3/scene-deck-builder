import type { ReactNode } from 'react';
import styles from './PathField.module.css';

export type PathFieldSize = 'sm' | 'md';

export interface PathFieldProps {
  value: string;
  placeholder?: string;
  onBrowse?: () => void;
  browseLabel?: string;
  browseIcon?: ReactNode;
  size?: PathFieldSize;
  className?: string;
  valueClassName?: string;
  buttonClassName?: string;
}

export function PathField({
  value,
  placeholder = '',
  onBrowse,
  browseLabel = 'Browse',
  browseIcon,
  size = 'md',
  className = '',
  valueClassName = '',
  buttonClassName = '',
}: PathFieldProps) {
  const displayValue = value || placeholder;
  const isEmpty = value.trim().length === 0;

  return (
    <div className={`${styles.pathField} ${className}`.trim()} data-size={size}>
      <span
        className={`${styles.pathValue} ${valueClassName}`.trim()}
        data-empty={isEmpty || undefined}
        title={value || undefined}
      >
        {displayValue}
      </span>
      {onBrowse && (
        <button
          type="button"
          className={`${styles.pathButton} ${buttonClassName}`.trim()}
          data-size={size}
          onClick={onBrowse}
        >
          {browseIcon && <span className={styles.pathButtonIcon}>{browseIcon}</span>}
          <span>{browseLabel}</span>
        </button>
      )}
    </div>
  );
}

export default PathField;
