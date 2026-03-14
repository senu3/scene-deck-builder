/**
 * Menu Primitives
 *
 * Basic building blocks for context menus and dropdown menus.
 * Supports keyboard navigation, disabled/danger states, and submenus.
 */
import {
  createContext,
  useContext,
  useRef,
  useEffect,
  useCallback,
  useState,
  forwardRef,
  type CSSProperties,
  type ForwardedRef,
  type MutableRefObject,
  type ReactNode,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import styles from './Menu.module.css';

// ============================================================================
// Context for keyboard navigation
// ============================================================================

interface MenuContextValue {
  focusedIndex: number;
  setFocusedIndex: (index: number) => void;
  itemCount: number;
  registerItem: () => number;
  unregisterItem: (index: number) => void;
  closeMenu: () => void;
}

const MenuContext = createContext<MenuContextValue | null>(null);

function useMenuContext() {
  const context = useContext(MenuContext);
  if (!context) {
    throw new Error('Menu components must be used within a Menu');
  }
  return context;
}

// ============================================================================
// Menu (Root container)
// ============================================================================

export interface MenuProps {
  children: ReactNode;
  onClose: () => void;
  className?: string;
  style?: CSSProperties;
}

export const Menu = forwardRef(function Menu(
  { children, onClose, className, style }: MenuProps,
  forwardedRef: ForwardedRef<HTMLDivElement>
) {
  const internalRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const itemCountRef = useRef(0);
  const [, forceUpdate] = useState({});

  // Merge refs: forward ref + internal ref for focus management
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      // Set internal ref
      (internalRef as MutableRefObject<HTMLDivElement | null>).current = node;
      // Forward ref
      if (typeof forwardedRef === 'function') {
        forwardedRef(node);
      } else if (forwardedRef) {
        (forwardedRef as MutableRefObject<HTMLDivElement | null>).current = node;
      }
    },
    [forwardedRef]
  );

  const registerItem = useCallback(() => {
    const index = itemCountRef.current;
    itemCountRef.current += 1;
    forceUpdate({});
    return index;
  }, []);

  const unregisterItem = useCallback(() => {
    itemCountRef.current -= 1;
    forceUpdate({});
  }, []);

  const itemCount = itemCountRef.current;

  // Focus first item on mount
  useEffect(() => {
    if (internalRef.current) {
      internalRef.current.focus();
    }
    // Reset count on mount
    itemCountRef.current = 0;
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex((prev) =>
            prev < itemCount - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex((prev) =>
            prev > 0 ? prev - 1 : itemCount - 1
          );
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'Tab':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [itemCount, onClose]
  );

  const contextValue: MenuContextValue = {
    focusedIndex,
    setFocusedIndex,
    itemCount,
    registerItem,
    unregisterItem,
    closeMenu: onClose,
  };

  return (
    <MenuContext.Provider value={contextValue}>
      <div
        ref={setRefs}
        className={`${styles.menu} ${className || ''}`}
        style={style}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        role="menu"
      >
        {children}
      </div>
    </MenuContext.Provider>
  );
});

// ============================================================================
// MenuHeader
// ============================================================================

export interface MenuHeaderProps {
  children: ReactNode;
  className?: string;
}

export function MenuHeader({ children, className }: MenuHeaderProps) {
  return (
    <div className={`${styles.menuHeader} ${className || ''}`} role="presentation">
      {children}
    </div>
  );
}

// ============================================================================
// MenuItem
// ============================================================================

export type MenuItemVariant = 'default' | 'danger' | 'action' | 'success';

export interface MenuItemProps {
  children: ReactNode;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  variant?: MenuItemVariant;
  icon?: ReactNode;
  shortcut?: string;
  className?: string;
}

export function MenuItem({
  children,
  onClick,
  disabled = false,
  variant = 'default',
  icon,
  shortcut,
  className,
}: MenuItemProps) {
  const { focusedIndex, setFocusedIndex, registerItem, unregisterItem, closeMenu } =
    useMenuContext();
  const indexRef = useRef<number>(-1);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Register on mount
  useEffect(() => {
    if (!disabled) {
      indexRef.current = registerItem();
      return () => unregisterItem(indexRef.current);
    }
  }, [disabled, registerItem, unregisterItem]);

  const isFocused = !disabled && focusedIndex === indexRef.current;

  // Scroll into view when focused
  useEffect(() => {
    if (isFocused && buttonRef.current) {
      buttonRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [isFocused]);

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    onClick?.(e);
    closeMenu();
  };

  const handleMouseEnter = () => {
    if (!disabled) {
      setFocusedIndex(indexRef.current);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick(e as unknown as MouseEvent<HTMLButtonElement>);
    }
  };

  const variantClass = variant !== 'default' ? styles[variant] : '';
  const focusedClass = isFocused ? styles.focused : '';

  return (
    <button
      ref={buttonRef}
      className={`${styles.menuItem} ${variantClass} ${focusedClass} ${className || ''}`}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      role="menuitem"
      tabIndex={isFocused ? 0 : -1}
    >
      {icon && <span className={styles.menuItemIcon}>{icon}</span>}
      <span className={styles.menuItemLabel}>{children}</span>
      {shortcut && <span className={styles.menuItemShortcut}>{shortcut}</span>}
    </button>
  );
}

// ============================================================================
// MenuSeparator
// ============================================================================

export interface MenuSeparatorProps {
  className?: string;
}

export function MenuSeparator({ className }: MenuSeparatorProps) {
  return (
    <div
      className={`${styles.menuSeparator} ${className || ''}`}
      role="separator"
    />
  );
}
