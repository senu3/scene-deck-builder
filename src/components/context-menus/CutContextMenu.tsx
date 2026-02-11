/**
 * CutContextMenu Pattern
 *
 * Pre-built context menu for cut operations in the storyline.
 * Uses Menu primitives for consistent styling and keyboard navigation.
 */
import {
  Copy,
  Clipboard,
  ArrowRightLeft,
  Trash2,
  Download,
  RotateCcw,
  Layers,
  FolderMinus,
  Crop,
} from 'lucide-react';
import {
  ContextMenu,
  MenuHeader,
  MenuItem,
  MenuSeparator,
  MenuSubmenu,
  type ContextMenuPosition,
} from '../../ui/primitives/menu';
import type { Scene } from '../../types';

export interface CutContextMenuProps {
  position: ContextMenuPosition;
  onClose: () => void;
  /** Whether multiple cuts are selected */
  isMultiSelect: boolean;
  /** Number of selected cuts */
  selectedCount: number;
  /** All scenes for move-to-scene submenu */
  scenes: Scene[];
  /** Current scene ID (excluded from move options) */
  currentSceneId: string;
  /** Whether paste is available */
  canPaste: boolean;
  /** Whether this cut is a video clip (has in/out points) */
  isClip: boolean;
  /** Whether this cut is an image */
  isImage?: boolean;
  /** Whether this cut belongs to a group */
  isInGroup: boolean;
  /** Copy handler */
  onCopy: () => void;
  /** Paste handler */
  onPaste: () => void;
  /** Delete handler */
  onDelete: () => void;
  /** Move to scene handler */
  onMoveToScene: (sceneId: string) => void;
  /** Finalize clip handler (export clip as new cut) */
  onFinalizeClip?: () => void;
  /** Reverse clip handler (export reversed clip) */
  onReverseClip?: () => void;
  /** Crop image handler (create cropped image cut) */
  onCropImage?: () => void;
  /** Create group from selection */
  onCreateGroup?: () => void;
  /** Remove cut from its group */
  onRemoveFromGroup?: () => void;
}

export function CutContextMenu({
  position,
  onClose,
  isMultiSelect,
  selectedCount,
  scenes,
  currentSceneId,
  canPaste,
  isClip,
  isImage = false,
  isInGroup,
  onCopy,
  onPaste,
  onDelete,
  onMoveToScene,
  onFinalizeClip,
  onReverseClip,
  onCropImage,
  onCreateGroup,
  onRemoveFromGroup,
}: CutContextMenuProps) {
  // Filter out current scene from move options
  const otherScenes = scenes.filter((s) => s.id !== currentSceneId);

  const headerText = isMultiSelect
    ? `${selectedCount} cuts selected`
    : 'Cut options';

  return (
    <ContextMenu position={position} onClose={onClose}>
      <MenuHeader>{headerText}</MenuHeader>

      {/* Copy */}
      <MenuItem icon={<Copy size={14} />} onClick={onCopy}>
        Copy{isMultiSelect ? ` (${selectedCount})` : ''}
      </MenuItem>

      {/* Paste */}
      {canPaste && (
        <MenuItem icon={<Clipboard size={14} />} onClick={onPaste}>
          Paste
        </MenuItem>
      )}

      {/* Move to Scene */}
      {otherScenes.length > 0 && (
        <MenuSubmenu label="Move to Scene" icon={<ArrowRightLeft size={14} />}>
          {otherScenes.map((scene) => (
            <MenuItem key={scene.id} onClick={() => onMoveToScene(scene.id)}>
              {scene.name}
            </MenuItem>
          ))}
        </MenuSubmenu>
      )}

      {/* Clip operations */}
      {isClip && !isMultiSelect && onFinalizeClip && (
        <>
          <MenuSeparator />
          <MenuItem
            icon={<Download size={14} />}
            variant="action"
            onClick={onFinalizeClip}
          >
            Finalize Clip (Add Cut)
          </MenuItem>
        </>
      )}

      {isClip && !isMultiSelect && onReverseClip && (
        <MenuItem
          icon={<RotateCcw size={14} />}
          variant="action"
          onClick={onReverseClip}
        >
          Reverse Clip (Add Cut)
        </MenuItem>
      )}

      {isImage && !isMultiSelect && onCropImage && (
        <>
          {!isClip && <MenuSeparator />}
          <MenuItem
            icon={<Crop size={14} />}
            variant="action"
            onClick={onCropImage}
          >
            Crop Image (Add Cut)
          </MenuItem>
        </>
      )}

      {/* Group operations */}
      <MenuSeparator />

      {/* Create Group - only for multi-select */}
      {isMultiSelect && onCreateGroup && (
        <MenuItem icon={<Layers size={14} />} onClick={onCreateGroup}>
          Create Group ({selectedCount})
        </MenuItem>
      )}

      {/* Remove from Group */}
      {isInGroup && onRemoveFromGroup && (
        <MenuItem icon={<FolderMinus size={14} />} onClick={onRemoveFromGroup}>
          Remove from Group
        </MenuItem>
      )}

      <MenuSeparator />

      {/* Delete */}
      <MenuItem icon={<Trash2 size={14} />} variant="danger" onClick={onDelete}>
        Delete{isMultiSelect ? ` (${selectedCount})` : ''}
      </MenuItem>
    </ContextMenu>
  );
}
