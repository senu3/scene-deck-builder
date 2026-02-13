import { useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store/useStore';
import AssetPanel, { type FilterType, type AssetInfo } from './AssetPanel';
import type { Asset } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { Overlay, useModalKeyboard } from '../ui/primitives/Modal';
import './AssetModal.css';

export interface AssetModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (asset: Asset) => void;
  title?: string;                    // default: "Select Asset"
  initialFilterType?: FilterType;   // e.g., 'audio' for ATTACH AUDIO
  allowImport?: boolean;            // default: true
}

export default function AssetModal({
  open,
  onClose,
  onConfirm,
  title = 'Select Asset',
  initialFilterType = 'all',
  allowImport = true,
}: AssetModalProps) {
  const { vaultPath } = useStore();

  // ESC key to close
  useModalKeyboard({ onEscape: onClose, enabled: open });

  // Handle confirm from AssetPanel
  const handleConfirm = useCallback((assets: AssetInfo[]) => {
    if (assets.length > 0) {
      const assetInfo = assets[0];
      // Convert AssetInfo to Asset
      const asset: Asset = {
        id: assetInfo.id,
        name: assetInfo.sourceName,
        path: assetInfo.path,
        type: assetInfo.type,
        thumbnail: assetInfo.thumbnail,
      };
      onConfirm(asset);
    }
  }, [onConfirm]);

  // Handle import from external file
  const handleImportExternal = useCallback(async () => {
    if (!window.electronAPI?.vaultGateway || !vaultPath) return;

    // Determine file extensions based on filter type
    let extensions: string[] = [];
    let filterName = 'Media';

    if (initialFilterType === 'audio') {
      extensions = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'];
      filterName = 'Audio';
    } else if (initialFilterType === 'image') {
      extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
      filterName = 'Images';
    } else if (initialFilterType === 'video') {
      extensions = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
      filterName = 'Video';
    } else {
      extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'mp4', 'webm', 'mov', 'avi', 'mkv', 'mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'];
    }

    try {
      const filePath = await window.electronAPI.showOpenFileDialog({
        title: `Import ${filterName} File`,
        filters: [{ name: filterName, extensions }],
      });

      if (!filePath) return;

      const assetId = uuidv4();
      const originalName = filePath.split(/[/\\]/).pop() || 'asset';

      // Import to vault
      const importResult = await window.electronAPI.vaultGateway.importAndRegisterAsset(
        filePath,
        vaultPath,
        assetId
      );

      if (!importResult.success) {
        alert(`Failed to import file: ${importResult.error}`);
        return;
      }

      // Get file info
      const fileInfo = await window.electronAPI.getFileInfo(importResult.vaultPath!);
      const ext = fileInfo?.extension?.toLowerCase() || '';

      // Determine type
      let type: 'image' | 'video' | 'audio' = 'image';
      if (['.mp4', '.webm', '.mov', '.avi', '.mkv'].includes(ext)) {
        type = 'video';
      } else if (['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'].includes(ext)) {
        type = 'audio';
      }

      // Create and return the asset
      const asset: Asset = {
        id: assetId,
        name: originalName,
        path: importResult.vaultPath!,
        type,
        vaultRelativePath: importResult.relativePath,
        originalPath: filePath,
        hash: importResult.hash,
        fileSize: fileInfo?.size,
      };

      onConfirm(asset);
    } catch (error) {
      console.error('Failed to import file:', error);
      alert(`Failed to import file: ${error}`);
    }
  }, [vaultPath, initialFilterType, onConfirm]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <Overlay className="asset-modal-overlay" onClick={onClose}>
      <div className="asset-modal">
        <AssetPanel
          mode="modal"
          selectionMode="single"
          initialFilterType={initialFilterType}
          headerTitle={title}
          onClose={onClose}
          onConfirm={handleConfirm}
          onImportExternal={allowImport ? handleImportExternal : undefined}
          showConfirmButton={true}
          showImportButton={allowImport}
          enableContextMenu={false}
          enableDragDrop={false}
        />
      </div>
    </Overlay>
  , document.body);
}
