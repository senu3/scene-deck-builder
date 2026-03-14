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
import styles from './InlineSlider.module.css';

// ============================================
// Types
// ============================================
export type PopoverPosition = 'top' | 'bottom' | 'left' | 'right';

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
  portalContainer?: Element | DocumentFragment | null;
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
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Toggle popover
  const handleTriggerClick = useCallback(() => {
    if (disabled) return;
    setOpen((prev) => !prev);
  }, [disabled]);

  // Calculate popover position
  useEffect(() => {
    if (!open || !triggerRef.current || !popoverRef.current) return;

    const trigger = triggerRef.current.getBoundingClientRect();
    const popover = popoverRef.current.getBoundingClientRect();
    const gap = 8;

    let x = 0;
    let y = 0;

    switch (position) {
      case 'top':
        x = trigger.left + trigger.width / 2 - popover.width / 2;
        y = trigger.top - popover.height - gap;
        break;
      case 'bottom':
        x = trigger.left + trigger.width / 2 - popover.width / 2;
        y = trigger.bottom + gap;
        break;
      case 'left':
        x = trigger.left - popover.width - gap;
        y = trigger.top + trigger.height / 2 - popover.height / 2;
        break;
      case 'right':
        x = trigger.right + gap;
        y = trigger.top + trigger.height / 2 - popover.height / 2;
        break;
    }

    // Keep within viewport
    x = Math.max(8, Math.min(x, window.innerWidth - popover.width - 8));
    y = Math.max(8, Math.min(y, window.innerHeight - popover.height - 8));

    setCoords({ x, y });
  }, [open, position]);

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
  const portalTarget = portalContainer ?? document.body;

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
