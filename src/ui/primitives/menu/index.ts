/**
 * Menu Primitives
 *
 * Building blocks for context menus and dropdown menus.
 *
 * @example
 * ```tsx
 * import { ContextMenu, MenuItem, MenuSeparator, MenuHeader } from './ui';
 *
 * // Basic context menu
 * const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
 *
 * <div onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }}>
 *   Right click me
 * </div>
 *
 * {menu && (
 *   <ContextMenu position={menu} onClose={() => setMenu(null)}>
 *     <MenuHeader>Options</MenuHeader>
 *     <MenuItem icon={<Copy size={14} />} onClick={handleCopy}>Copy</MenuItem>
 *     <MenuItem icon={<Clipboard size={14} />} onClick={handlePaste} disabled={!canPaste}>Paste</MenuItem>
 *     <MenuSeparator />
 *     <MenuSubmenu label="Move to" icon={<ArrowRightLeft size={14} />}>
 *       <MenuItem onClick={() => handleMove('scene1')}>Scene 1</MenuItem>
 *       <MenuItem onClick={() => handleMove('scene2')}>Scene 2</MenuItem>
 *     </MenuSubmenu>
 *     <MenuSeparator />
 *     <MenuItem icon={<Trash2 size={14} />} variant="danger" onClick={handleDelete}>Delete</MenuItem>
 *   </ContextMenu>
 * )}
 * ```
 */

// Core components
export {
  Menu,
  MenuHeader,
  MenuItem,
  MenuSeparator,
  type MenuProps,
  type MenuHeaderProps,
  type MenuItemProps,
  type MenuItemVariant,
  type MenuSeparatorProps,
} from './Menu';

// Context menu (positioned via Portal)
export {
  ContextMenu,
  type ContextMenuProps,
  type ContextMenuPosition,
} from './ContextMenu';

// Submenu
export {
  MenuSubmenu,
  type MenuSubmenuProps,
} from './MenuSubmenu';
