/**
 * InlineSlider - Compact slider in popover (for volume, opacity, etc.)
 *
 * Usage:
 * <InlineSlider
 *   value={volume}
 *   onChange={setVolume}
 *   icon={<Volume2 size={16} />}
 * />
 *
 * <InlineSlider
 *   value={opacity}
 *   onChange={setOpacity}
 *   min={0}
 *   max={1}
 *   step={0.1}
 *   label="Opacity"
 *   formatValue={(v) => `${Math.round(v * 100)}%`}
 * />
 */

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Slider, type SliderProps } from '../primitives/Slider';
import {
  resolvePortalContainer,
  useAnchoredPosition,
  type FloatingDirection,
  type PortalContainer,
} from '../primitives/floating';
import styles from './InlineSlider.module.css';

// ============================================
// Types
// ============================================
export type PopoverPosition = FloatingDirection;

export interface InlineSliderProps extends Omit<SliderProps, 'className'> {
  /** Icon to show as trigger */
  icon?: ReactNode;
  /** Label to show as trigger (alternative to icon) */
  label?: string;
  /** Popover position */
  position?: PopoverPosition;
  /** Popover width */
  popoverWidth?: number;
  /** Close on outside click */
  closeOnOutsideClick?: boolean;
  /** Portal target for popover. Defaults to document.body. */
  portalContainer?: PortalContainer;
  /** Additional class for trigger */
  className?: string;
}

// ============================================
// InlineSlider Component
// ============================================
export function InlineSlider({
  icon,
  label,
  position = 'top',
  popoverWidth = 140,
  closeOnOutsideClick = true,
  portalContainer,
  className = '',
  disabled,
  ...sliderProps
}: InlineSliderProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const coords = useAnchoredPosition({
    open,
    anchorRef: triggerRef,
    floatingRef: popoverRef,
    position,
  });
  const portalTarget = resolvePortalContainer(portalContainer);

  // Toggle popover
  const handleTriggerClick = useCallback(() => {
    if (disabled) return;
    setOpen((prev) => !prev);
  }, [disabled]);

  // Close on outside click
  useEffect(() => {
    if (!open || !closeOnOutsideClick) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        popoverRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, closeOnOutsideClick]);

  // Close on escape
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // Format display value
  const displayValue = sliderProps.formatValue
    ? sliderProps.formatValue(sliderProps.value)
    : sliderProps.value.toString();

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${className}`}
        onClick={handleTriggerClick}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={label || displayValue}
      >
        {icon && <span className={styles.triggerIcon}>{icon}</span>}
        {label && <span className={styles.triggerLabel}>{label}</span>}
        {!icon && !label && <span className={styles.triggerValue}>{displayValue}</span>}
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            className={styles.popover}
            data-position={position}
            style={{ left: coords.x, top: coords.y, width: popoverWidth }}
            role="dialog"
            aria-label={`${label || 'Slider'}: ${displayValue}`}
          >
            <Slider {...sliderProps} disabled={disabled} />
          </div>,
          portalTarget
        )}
    </>
  );
}

export default InlineSlider;
