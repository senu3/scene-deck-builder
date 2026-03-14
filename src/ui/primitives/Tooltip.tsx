/**
 * Tooltip - Hover/focus tooltip for explanations
 *
 * Usage:
 * <Tooltip content="Explanation text">
 *   <button>Hover me</button>
 * </Tooltip>
 *
 * Note: For disabled state reasons, use DisabledReason instead.
 */

import {
  useState,
  useRef,
  useEffect,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { resolvePortalContainer, useAnchoredPosition, type PortalContainer } from './floating';
import styles from './Tooltip.module.css';

// ============================================
// Types
// ============================================
export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  /** Tooltip content */
  content: ReactNode;
  /** Position relative to trigger */
  position?: TooltipPosition;
  /** Delay before showing (ms) */
  delay?: number;
  /** Trigger element */
  children: ReactElement;
  /** Disable tooltip */
  disabled?: boolean;
  /** Portal target for tooltip. Defaults to document.body. */
  portalContainer?: PortalContainer;
}

// ============================================
// Tooltip Component
// ============================================
export function Tooltip({
  content,
  position = 'top',
  delay = 200,
  children,
  disabled = false,
  portalContainer,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const triggerRef = useRef<HTMLElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | null>(null);
  const coords = useAnchoredPosition({
    open: visible,
    anchorRef: triggerRef,
    floatingRef: tooltipRef,
    position,
  });
  const portalTarget = resolvePortalContainer(portalContainer);

  const show = () => {
    if (disabled) return;
    timeoutRef.current = window.setTimeout(() => {
      setVisible(true);
    }, delay);
  };

  const hide = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setVisible(false);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  if (!isValidElement(children)) {
    return children;
  }

  const child = children as ReactElement<{
    onMouseEnter?: (e: MouseEvent) => void;
    onMouseLeave?: (e: MouseEvent) => void;
    onFocus?: (e: FocusEvent) => void;
    onBlur?: (e: FocusEvent) => void;
  }>;

  const trigger = cloneElement(child, {
    ref: triggerRef,
    onMouseEnter: (e: MouseEvent) => {
      show();
      child.props.onMouseEnter?.(e);
    },
    onMouseLeave: (e: MouseEvent) => {
      hide();
      child.props.onMouseLeave?.(e);
    },
    onFocus: (e: FocusEvent) => {
      show();
      child.props.onFocus?.(e);
    },
    onBlur: (e: FocusEvent) => {
      hide();
      child.props.onBlur?.(e);
    },
  } as Record<string, unknown>);

  return (
    <>
      {trigger}
      {visible &&
        createPortal(
          <div
            ref={tooltipRef}
            className={styles.tooltip}
            data-position={position}
            style={{ left: coords.x, top: coords.y }}
            role="tooltip"
          >
            {content}
          </div>,
          portalTarget
        )}
    </>
  );
}

export default Tooltip;
