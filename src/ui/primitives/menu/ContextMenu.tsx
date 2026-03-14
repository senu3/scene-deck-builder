/**
 * ContextMenu
 *
 * Renders a menu at a specific position using Portal.
 * Handles click-outside and escape key to close.
 */
import { useRef, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { resolvePortalContainer, useFixedPointPosition, type PortalContainer } from '../floating';
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
  /** Portal target for the menu. Defaults to document.body. */
  portalContainer?: PortalContainer;
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
  portalContainer,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const adjustedPosition = useFixedPointPosition({
    open: true,
    floatingRef: menuRef,
    position,
  });
  const portalTarget = resolvePortalContainer(portalContainer);

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
    portalTarget
  );
}
