/**
 * Modal primitives - Building blocks for modal dialogs
 *
 * Usage:
 * <Overlay onClick={onClose}>
 *   <Container size="md">
 *     <Header title="Title" subtitle="Optional" onClose={onClose} />
 *     <Body>Content here</Body>
 *     <Footer>
 *       <Actions>
 *         <Button variant="ghost" onClick={onClose}>Cancel</Button>
 *         <Button variant="primary" size="lg" onClick={onConfirm}>Confirm</Button>
 *       </Actions>
 *     </Footer>
 *   </Container>
 * </Overlay>
 */

import { useEffect, useCallback, type ReactNode, type MouseEvent } from 'react';
import { X } from 'lucide-react';
import styles from './Modal.module.css';

// ============================================
// Overlay
// ============================================
export interface OverlayProps {
  children: ReactNode;
  onClick?: () => void;
  blur?: boolean;
  className?: string;
}

export function Overlay({ children, onClick, blur = false, className = '' }: OverlayProps) {
  const handleClick = useCallback(
    (e: MouseEvent) => {
      if (e.target === e.currentTarget && onClick) {
        onClick();
      }
    },
    [onClick]
  );

  return (
    <div
      className={`${styles.overlay} ${className}`}
      data-blur={blur}
      onClick={handleClick}
    >
      {children}
    </div>
  );
}

// ============================================
// Container
// ============================================
export type ContainerSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export interface ContainerProps {
  children: ReactNode;
  size?: ContainerSize;
  className?: string;
}

export function Container({ children, size = 'md', className = '' }: ContainerProps) {
  return (
    <div
      className={`${styles.container} ${className}`}
      data-size={size}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

// ============================================
// Header
// ============================================
export type HeaderVariant = 'default' | 'warning' | 'danger' | 'success' | 'info';

export interface HeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  iconVariant?: HeaderVariant;
  onClose?: () => void;
  className?: string;
}

export function Header({
  title,
  subtitle,
  icon,
  iconVariant = 'default',
  onClose,
  className = '',
}: HeaderProps) {
  return (
    <div className={`${styles.header} ${className}`}>
      {icon && (
        <div className={styles.headerIcon} data-variant={iconVariant}>
          {icon}
        </div>
      )}
      <div className={styles.headerText}>
        <h2 className={styles.title}>{title}</h2>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {onClose && (
        <button className={styles.closeButton} onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
      )}
    </div>
  );
}

// ============================================
// Body
// ============================================
export type BodyPadding = 'none' | 'sm' | 'default';

export interface BodyProps {
  children: ReactNode;
  padding?: BodyPadding;
  className?: string;
}

export function Body({ children, padding = 'default', className = '' }: BodyProps) {
  return (
    <div
      className={`${styles.body} ${className}`}
      data-padding={padding === 'default' ? undefined : padding}
    >
      {children}
    </div>
  );
}

// ============================================
// Footer
// ============================================
export type FooterAlign = 'start' | 'center' | 'end' | 'between';

export interface FooterProps {
  children: ReactNode;
  align?: FooterAlign;
  className?: string;
}

export function Footer({ children, align = 'end', className = '' }: FooterProps) {
  return (
    <div
      className={`${styles.footer} ${className}`}
      data-align={align === 'end' ? undefined : align}
    >
      {children}
    </div>
  );
}

// ============================================
// Actions
// ============================================
export interface ActionsProps {
  children: ReactNode;
  className?: string;
}

export function Actions({ children, className = '' }: ActionsProps) {
  return <div className={`${styles.actions} ${className}`}>{children}</div>;
}

// ============================================
// useModalKeyboard - Hook for ESC key handling
// ============================================
export interface UseModalKeyboardOptions {
  onEscape?: () => void;
  enabled?: boolean;
}

export function useModalKeyboard({ onEscape, enabled = true }: UseModalKeyboardOptions) {
  useEffect(() => {
    if (!enabled || !onEscape) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onEscape();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onEscape]);
}
