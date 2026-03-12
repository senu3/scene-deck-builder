import type { Asset } from '../../types';
import {
  readCanonicalAssetMetadataForPath,
  type CanonicalAssetMetadata,
} from './provider';

export interface AssetMetadataRequirements {
  duration?: boolean;
  dimensions?: boolean;
  fileSize?: boolean;
}

function isFinitePositive(value: number | undefined): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isFiniteNonNegative(value: number | undefined): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function sanitizeImageMetadata(asset: Asset, canonical: CanonicalAssetMetadata): Asset['metadata'] | undefined {
  const merged = {
    ...(asset.metadata || {}),
    ...(canonical.metadata || {}),
  };
  const keys = Object.keys(merged).filter((key) => merged[key as keyof typeof merged] !== undefined);
  if (keys.length === 0) {
    return undefined;
  }
  return merged;
}

export function applyCanonicalAssetMetadata(asset: Asset, canonical: CanonicalAssetMetadata): Asset {
  const nextDuration = isFinitePositive(canonical.duration) ? canonical.duration : asset.duration;
  const nextFileSize = isFiniteNonNegative(canonical.fileSize) ? canonical.fileSize : asset.fileSize;
  const nextMetadata = sanitizeImageMetadata(asset, canonical);

  const sameDuration = nextDuration === asset.duration;
  const sameFileSize = nextFileSize === asset.fileSize;
  const sameMetadata = JSON.stringify(nextMetadata || null) === JSON.stringify(asset.metadata || null);
  if (sameDuration && sameFileSize && sameMetadata) {
    return asset;
  }

  return {
    ...asset,
    duration: nextDuration,
    fileSize: nextFileSize,
    metadata: nextMetadata,
  };
}

export function hasRequiredAssetMetadata(
  asset: Asset | null | undefined,
  requirements: AssetMetadataRequirements,
): boolean {
  if (!asset) return false;

  if (requirements.duration && !isFinitePositive(asset.duration)) {
    return false;
  }

  if (requirements.fileSize && !isFiniteNonNegative(asset.fileSize)) {
    return false;
  }

  if (requirements.dimensions) {
    const width = asset.metadata?.width;
    const height = asset.metadata?.height;
    if (!isFinitePositive(width) || !isFinitePositive(height)) {
      return false;
    }
  }

  return true;
}

export function needsAssetMetadataHydration(
  asset: Asset | null | undefined,
  requirements: AssetMetadataRequirements,
): boolean {
  if (!asset?.path) return false;
  if (asset.type !== 'image' && asset.type !== 'video' && asset.type !== 'audio') {
    return false;
  }
  return !hasRequiredAssetMetadata(asset, requirements);
}

export async function hydrateAssetWithCanonicalMetadata(asset: Asset): Promise<Asset> {
  if (!asset.path) return asset;

  const canonical = await readCanonicalAssetMetadataForPath(asset.path, asset.type, {
    duration: asset.duration,
    fileSize: asset.fileSize,
    metadata: asset.metadata,
  });
  return applyCanonicalAssetMetadata(asset, canonical);
}
