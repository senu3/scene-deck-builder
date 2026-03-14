/**
 * DisabledReason - Wrapper that shows reason balloon on disabled elements
 *
 * Usage:
 * <DisabledReason reason="Select a clip first" disabled={!hasSelection}>
 *   <button disabled={!hasSelection}>Export</button>
 * </DisabledReason>
 *
 * Note: Wraps disabled elements because they don't receive hover events.
 * Use for important actions like Export where users need to understand why disabled.
 */

import {
  useState,
  useRef,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  resolvePortalContainer,
  useAnchoredPosition,
  type FloatingDirection,
  type PortalContainer,
} from '../primitives/floating';
import styles from './DisabledReason.module.css';

// ============================================
// Types
// ============================================
export type BalloonPosition = FloatingDirection;

export interface DisabledReasonProps {
  /** Reason why the element is disabled */
  reason: string;
  /** Whether the wrapped element is disabled */
  disabled: boolean;
  /** Position of the balloon */
  position?: BalloonPosition;
  /** Wrapped element */
  children: ReactNode;
  /** Additional class name */
  className?: string;
  /** Portal target for balloon. Defaults to document.body. */
  portalContainer?: PortalContainer;
}

// ============================================
// DisabledReason Component
// ============================================
export function DisabledReason({
  reason,
  disabled,
  position = 'top',
  children,
  className = '',
  portalContainer,
}: DisabledReasonProps) {
  const [visible, setVisible] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const balloonRef = useRef<HTMLDivElement>(null);
  const coords = useAnchoredPosition({
    open: visible,
    anchorRef: wrapperRef,
    floatingRef: balloonRef,
    position,
  });
  const portalTarget = resolvePortalContainer(portalContainer);

  const show = () => {
    if (disabled) {
      setVisible(true);
    }
  };

  const hide = () => {
    setVisible(false);
  };

  // If not disabled, just render children
  if (!disabled) {
    return <>{children}</>;
  }

  return (
    <>
      <div
        ref={wrapperRef}
        className={`${styles.wrapper} ${className}`}
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        {children}
      </div>
      {visible &&
        createPortal(
          <div
            ref={balloonRef}
            className={styles.balloon}
            data-position={position}
            style={{ left: coords.x, top: coords.y }}
            role="tooltip"
          >
            {reason}
          </div>,
          portalTarget
        )}
    </>
  );
}

export default DisabledReason;
