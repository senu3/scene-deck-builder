import { Asset } from '../types';

/**
 * Asset path utilities for vault synchronization
 */

/**
 * Check if an asset has been imported to the vault
 */
export function isAssetInVault(asset: Asset): boolean {
  return !!asset.vaultRelativePath;
}

/**
 * Get the effective path for an asset
 * Prioritizes vault path if available, falls back to original path
 */
export function getEffectivePath(asset: Asset, vaultPath: string): string {
  if (asset.vaultRelativePath) {
    // Use forward slashes for consistency, then let the system normalize
    return `${vaultPath}/${asset.vaultRelativePath}`.replace(/\//g, '\\');
  }
  return asset.path;
}

/**
 * Resolve a relative path to an absolute path within the vault
 */
export async function resolveAssetPath(
  vaultPath: string,
  relativePath: string
): Promise<{ absolutePath: string; exists: boolean }> {
  if (!window.electronAPI) {
    return { absolutePath: '', exists: false };
  }
  const result = await window.electronAPI.resolveVaultPath(vaultPath, relativePath);
  return {
    absolutePath: result.absolutePath || '',
    exists: result.exists,
  };
}

/**
 * Convert an asset for saving (relative paths)
 */
export function prepareAssetForSave(asset: Asset): Asset {
  if (asset.vaultRelativePath) {
    // When saving, we only need the relative path
    return {
      ...asset,
      // Keep original path for reference, but path now points to relative
      path: asset.vaultRelativePath,
    };
  }
  return asset;
}

/**
 * Convert an asset after loading (resolve relative paths)
 */
export async function prepareAssetForLoad(
  asset: Asset,
  vaultPath: string
): Promise<Asset> {
  if (!window.electronAPI) {
    return asset;
  }

  // Check if path looks like a relative vault path
  if (asset.path.startsWith('assets/')) {
    const resolved = await window.electronAPI.resolveVaultPath(vaultPath, asset.path);
    if (resolved.exists) {
      return {
        ...asset,
        vaultRelativePath: asset.path,
        path: resolved.absolutePath || asset.path,
      };
    }
  }

  // Check if asset already has vaultRelativePath
  if (asset.vaultRelativePath) {
    const resolved = await window.electronAPI.resolveVaultPath(vaultPath, asset.vaultRelativePath);
    if (resolved.exists) {
      return {
        ...asset,
        path: resolved.absolutePath || asset.path,
      };
    }
  }

  return asset;
}

/**
 * Generate a unique asset ID
 */
export function generateAssetId(): string {
  return `asset_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Check if a path is already inside the vault's assets folder
 */
export async function isPathInVaultAssets(
  vaultPath: string,
  checkPath: string
): Promise<boolean> {
  if (!window.electronAPI) {
    return false;
  }
  const assetsPath = `${vaultPath}/assets`;
  return window.electronAPI.isPathInVault(assetsPath, checkPath);
}

/**
 * Import a file to the vault and return the updated asset data
 */
export async function importFileToVault(
  sourcePath: string,
  vaultPath: string,
  assetId: string,
  existingAsset?: Partial<Asset>
): Promise<Asset | null> {
  if (!window.electronAPI?.vaultGateway) {
    return null;
  }

  const inVault = await isPathInVaultAssets(vaultPath, sourcePath);

  // Import to vault
  const result = await window.electronAPI.vaultGateway.importAndRegisterAsset(sourcePath, vaultPath, assetId);

  if (!result.success) {
    console.error('Failed to import asset to vault:', result.error);
    return null;
  }

  // If the source was already inside assets/ but got re-hashed, move the original to trash
  if (inVault && result.vaultPath && result.vaultPath !== sourcePath) {
    const trashPath = `${vaultPath}/.trash`.replace(/\\/g, '/');
    await window.electronAPI.vaultGateway.moveToTrashWithMeta(sourcePath, trashPath, {
      assetId,
      reason: 'rehash',
    });
  }

  return {
    ...existingAsset,
    id: assetId,
    name: existingAsset?.name || sourcePath.split(/[/\\]/).pop() || 'Unknown',
    path: result.vaultPath || sourcePath,
    type: existingAsset?.type || getMediaTypeFromPath(sourcePath),
    vaultRelativePath: result.relativePath,
    originalPath: sourcePath,
    hash: result.hash,
  } as Asset;
}

/**
 * Get media type from file path
 */
function getMediaTypeFromPath(filePath: string): 'image' | 'video' {
  const ext = filePath.toLowerCase().split('.').pop() || '';
  const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
  return videoExts.includes(ext) ? 'video' : 'image';
}

/**
 * Migrate an asset from absolute path to vault
 */
export async function migrateAssetToVault(
  asset: Asset,
  vaultPath: string
): Promise<Asset | null> {
  if (!window.electronAPI) {
    return null;
  }

  // Skip if already in vault
  if (asset.vaultRelativePath) {
    return asset;
  }

  // Check if original file exists
  const exists = await window.electronAPI.pathExists(asset.path);
  if (!exists) {
    console.warn(`Cannot migrate asset: file not found at ${asset.path}`);
    return null;
  }

  return importFileToVault(asset.path, vaultPath, asset.id, asset);
}

/**
 * Batch migrate assets to vault
 */
export async function migrateAssetsToVault(
  assets: Asset[],
  vaultPath: string,
  onProgress?: (current: number, total: number, asset: Asset) => void
): Promise<{ migrated: Asset[]; failed: Asset[] }> {
  const migrated: Asset[] = [];
  const failed: Asset[] = [];

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    onProgress?.(i + 1, assets.length, asset);

    const migratedAsset = await migrateAssetToVault(asset, vaultPath);
    if (migratedAsset) {
      migrated.push(migratedAsset);
    } else {
      failed.push(asset);
    }
  }

  return { migrated, failed };
}
