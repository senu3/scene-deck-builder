/**
 * AssetContextMenu Pattern
 *
 * Unified context menu for assets in the asset panel.
 */
import { AudioLines, Download, RotateCcw, Trash2 } from 'lucide-react';
import {
  ContextMenu,
  MenuHeader,
  MenuItem,
  MenuSeparator,
  type ContextMenuPosition,
} from '../../ui/primitives/menu';

export interface AssetContextMenuProps {
  position: ContextMenuPosition;
  onClose: () => void;
  canFinalizeClip?: boolean;
  canReverse?: boolean;
  canExtractAudio?: boolean;
  onFinalizeClip?: () => void;
  onReverse?: () => void;
  onExtractAudio?: () => void;
  /** Delete handler (move to trash) */
  onDelete: () => void;
}

export function AssetContextMenu({
  position,
  onClose,
  canFinalizeClip = false,
  canReverse = false,
  canExtractAudio = false,
  onFinalizeClip,
  onReverse,
  onExtractAudio,
  onDelete,
}: AssetContextMenuProps) {
  const hasTransformActions = canFinalizeClip || canReverse || canExtractAudio;

  return (
    <ContextMenu position={position} onClose={onClose}>
      <MenuHeader>Asset options</MenuHeader>
      {hasTransformActions && (
        <>
          {canFinalizeClip && onFinalizeClip && (
            <MenuItem icon={<Download size={14} />} variant="action" onClick={onFinalizeClip}>
              Finalize Clip (Asset Only)
            </MenuItem>
          )}
          {canReverse && onReverse && (
            <MenuItem icon={<RotateCcw size={14} />} variant="action" onClick={onReverse}>
              Reverse (Asset Only)
            </MenuItem>
          )}
          {canExtractAudio && onExtractAudio && (
            <MenuItem icon={<AudioLines size={14} />} variant="action" onClick={onExtractAudio}>
              Extract Audio (Asset Only)
            </MenuItem>
          )}
        </>
      )}
      <MenuSeparator />
      <MenuItem icon={<Trash2 size={14} />} variant="danger" onClick={onDelete}>
        Delete (Move to Trash)
      </MenuItem>
    </ContextMenu>
  );
}
