import { useStore } from '../../store/useStore';
import {
  startAssetDragOutBridge,
  type StartAssetDragOutResultLike,
} from './electronGateway';

export function startAssetDragOut(assetId: string): StartAssetDragOutResultLike {
  const trimmedAssetId = assetId.trim();
  if (!trimmedAssetId) {
    return { ok: false, reason: 'asset-id-missing' };
  }

  const vaultPath = useStore.getState().vaultPath;
  if (!vaultPath) {
    return { ok: false, reason: 'vault-path-missing' };
  }

  return startAssetDragOutBridge({
    assetId: trimmedAssetId,
    vaultPath,
  });
}

export function getAssetDragOutFailureMessage(
  reason: StartAssetDragOutResultLike['reason']
): string {
  switch (reason) {
    case 'asset-id-missing':
      return 'Asset ID is missing.';
    case 'vault-path-missing':
      return 'Vault path is not available.';
    case 'index-missing':
    case 'index-invalid':
      return 'Asset index is unavailable. Reload or repair the vault.';
    case 'asset-not-found':
    case 'asset-filename-missing':
      return 'The asset record could not be resolved from the vault index.';
    case 'file-missing':
    case 'not-file':
      return 'The asset file could not be found on disk.';
    case 'outside-assets':
      return 'The resolved asset is outside vault/assets and was rejected.';
    default:
      return 'External drag could not be started.';
  }
}
