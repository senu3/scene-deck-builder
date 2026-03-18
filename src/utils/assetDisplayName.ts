import type { Asset } from '../types';

function getBasename(filePath: string | undefined): string | undefined {
  if (!filePath) return undefined;
  const normalized = filePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  const basename = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
  return basename || undefined;
}

export function getAssetDisplayName(
  asset: Pick<Asset, 'name' | 'path' | 'originalPath'> & { originalName?: string }
): string {
  const explicitOriginalName = asset.originalName?.trim();
  if (explicitOriginalName) return explicitOriginalName;

  const assetName = asset.name?.trim();
  const pathName = getBasename(asset.path);
  const originalPathName = getBasename(asset.originalPath);

  if (assetName && pathName && assetName !== pathName) {
    return assetName;
  }
  if (originalPathName && pathName && originalPathName !== pathName) {
    return originalPathName;
  }
  if (assetName) {
    return assetName;
  }
  if (originalPathName) {
    return originalPathName;
  }
  return pathName || 'asset';
}
