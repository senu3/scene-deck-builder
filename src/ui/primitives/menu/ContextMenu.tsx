/**
 * ContextMenu
 *
 * Renders a menu at a specific position using Portal.
 * Handles click-outside and escape key to close.
 */
import { useRef, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Menu } from './Menu';

export interface ContextMenuPosition {
  x: number;
  y: number;
}

export interface ContextMenuProps {
  children: ReactNode;
  position: ContextMenuPosition;
  onClose: () => void;
  className?: string;
}

/**
 * ContextMenu component that renders children at a fixed position.
 * Use with Menu primitives (MenuItem, MenuSeparator, etc.)
 *
 * @example
 * ```tsx
 * const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
 *
 * const handleContextMenu = (e: React.MouseEvent) => {
 *   e.preventDefault();
 *   setMenu({ x: e.clientX, y: e.clientY });
 * };
 *
 * {menu && (
 *   <ContextMenu position={menu} onClose={() => setMenu(null)}>
 *     <MenuHeader>Options</MenuHeader>
 *     <MenuItem icon={<Copy size={14} />} onClick={handleCopy}>Copy</MenuItem>
 *     <MenuSeparator />
 *     <MenuItem icon={<Trash2 size={14} />} variant="danger" onClick={handleDelete}>Delete</MenuItem>
 *   </ContextMenu>
 * )}
 * ```
 */
export function ContextMenu({
  children,
  position,
  onClose,
  className,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  // Adjust position after menu renders to keep within viewport
  useEffect(() => {
    if (!menuRef.current) {
      setAdjustedPosition(position);
      return;
    }

    const menuWidth = menuRef.current.offsetWidth;
    const menuHeight = menuRef.current.offsetHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 8;

    let adjustedX = position.x;
    let adjustedY = position.y;

    // Adjust X if menu overflows right edge
    if (position.x + menuWidth + padding > viewportWidth) {
      adjustedX = Math.max(padding, viewportWidth - menuWidth - padding);
    }

    // Adjust Y if menu overflows bottom edge
    if (position.y + menuHeight + padding > viewportHeight) {
      adjustedY = Math.max(padding, viewportHeight - menuHeight - padding);
    }

    setAdjustedPosition({ x: adjustedX, y: adjustedY });
  }, [position]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Use mousedown for faster response
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Close on scroll (optional - prevents stale menu position)
  useEffect(() => {
    const handleScroll = () => {
      onClose();
    };

    window.addEventListener('scroll', handleScroll, { capture: true });
    return () => window.removeEventListener('scroll', handleScroll, { capture: true });
  }, [onClose]);

  return createPortal(
    <Menu
      ref={menuRef}
      onClose={onClose}
      className={className}
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
      }}
    >
      {children}
    </Menu>,
    document.body
  );
}
