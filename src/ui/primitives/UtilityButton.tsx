import { forwardRef, type ButtonHTMLAttributes } from 'react';
import styles from './UtilityButton.module.css';

export type UtilityButtonVariant =
  | 'panel'
  | 'soft'
  | 'primary'
  | 'overlay'
  | 'overlayOutline'
  | 'overlayPrimary';

export type UtilityButtonSize = 'sm' | 'md' | 'lg';

export interface UtilityButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: UtilityButtonVariant;
  size?: UtilityButtonSize;
}

export const UtilityButton = forwardRef<HTMLButtonElement, UtilityButtonProps>(
  function UtilityButton(
    { variant = 'panel', size = 'md', className = '', type = 'button', ...props },
    ref
  ) {
    return (
      <button
        {...props}
        ref={ref}
        type={type}
        className={`${styles.button} ${className}`.trim()}
        data-variant={variant}
        data-size={size}
      />
    );
  }
);

export default UtilityButton;
