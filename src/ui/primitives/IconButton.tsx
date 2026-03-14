import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import styles from './IconButton.module.css';

export type IconButtonVariant = 'subtle' | 'contrast' | 'overlay';
export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  children: ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  'aria-label': string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      children,
      variant = 'subtle',
      size = 'md',
      className = '',
      type = 'button',
      ...props
    },
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
      >
        {children}
      </button>
    );
  }
);

export default IconButton;
