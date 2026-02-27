import { Asset } from '../types';
import {
  calculateFileHashBridge,
  getFileInfoBridge,
  getRelativePathBridge,
  hasVaultGatewayBridge,
  importAndRegisterAssetBridge,
  isPathInVaultBridge,
  loadAssetIndexBridge,
  pathExistsBridge,
  resolveVaultPathBridge,
  saveAssetIndexBridge,
} from '../features/platform/electronGateway';

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
  const result = await resolveVaultPathBridge(vaultPath, relativePath);
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
  // Check if path looks like a relative vault path
  if (asset.path.startsWith('assets/')) {
    const resolved = await resolveVaultPathBridge(vaultPath, asset.path);
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
    const resolved = await resolveVaultPathBridge(vaultPath, asset.vaultRelativePath);
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
  const assetsPath = `${vaultPath}/assets`;
  return isPathInVaultBridge(assetsPath, checkPath);
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
  if (!hasVaultGatewayBridge()) {
    return null;
  }

  const inVault = await isPathInVaultAssets(vaultPath, sourcePath);

  if (inVault) {
    const relativePath = await getRelativePathBridge(vaultPath, sourcePath);
    if (!relativePath) {
      return null;
    }

    const normalizedRelativePath = relativePath.replace(/\\/g, '/');
    const filename = normalizedRelativePath.split('/').pop() || sourcePath.split(/[/\\]/).pop() || 'Unknown';
    const hash = (await calculateFileHashBridge(sourcePath)) || existingAsset?.hash || '';
    const fileSize = existingAsset?.fileSize || (await getFileInfoBridge(sourcePath))?.size || 0;
    const mediaType = existingAsset?.type || getMediaTypeFromPath(sourcePath);

    const index = (await loadAssetIndexBridge(vaultPath)) || { version: 1, assets: [] as Record<string, unknown>[] };
    const nextAssets = [...(index.assets as Record<string, unknown>[])];
    const entry = {
      id: assetId,
      hash,
      filename,
      originalName: existingAsset?.name || filename,
      originalPath: normalizedRelativePath,
      type: mediaType,
      fileSize,
      importedAt: new Date().toISOString(),
    };
    const existingIndex = nextAssets.findIndex((item) => item.id === assetId);
    if (existingIndex >= 0) {
      nextAssets[existingIndex] = entry;
    } else {
      nextAssets.push(entry);
    }

    await saveAssetIndexBridge(vaultPath, {
      version: index.version || 1,
      assets: nextAssets,
    });

    return {
      ...existingAsset,
      id: assetId,
      name: existingAsset?.name || filename,
      path: sourcePath,
      type: mediaType,
      vaultRelativePath: normalizedRelativePath,
      originalPath: sourcePath,
      hash,
      fileSize,
    } as Asset;
  }

  // Import to vault
  const result = await importAndRegisterAssetBridge(sourcePath, vaultPath, assetId);

  if (!result?.success) {
    console.error('Failed to import asset to vault:', result?.error);
    return null;
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
function getMediaTypeFromPath(filePath: string): 'image' | 'video' | 'audio' {
  const ext = filePath.toLowerCase().split('.').pop() || '';
  const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
  const audioExts = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'];
  if (videoExts.includes(ext)) return 'video';
  if (audioExts.includes(ext)) return 'audio';
  return 'image';
}

/**
 * Migrate an asset from absolute path to vault
 */
export async function migrateAssetToVault(
  asset: Asset,
  vaultPath: string
): Promise<Asset | null> {
  // Skip if already in vault
  if (asset.vaultRelativePath) {
    return asset;
  }

  // Check if original file exists
  const exists = await pathExistsBridge(asset.path);
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
