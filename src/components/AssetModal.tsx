import { useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store/useStore';
import AssetPanel, { type FilterType, type AssetInfo } from './AssetPanel';
import type { Asset } from '../types';
import { selectAndImportAssetToVault } from '../features/asset/import';
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
    if (!vaultPath) return;

    try {
      const asset = await selectAndImportAssetToVault({
        vaultPath,
        filterType: initialFilterType,
        dialogTitle: undefined,
      });
      if (!asset) return;
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
