import type { Asset } from '../types';
import { importFileToVault } from './assetPath';
import { getAssetThumbnail } from '../features/thumbnails/api';
import { readCanonicalAssetMetadataForPath } from '../features/metadata/provider';

export interface CutImportSource {
  assetId: string;
  name: string;
  sourcePath: string;
  type: 'image' | 'video' | 'audio';
  fileSize?: number;
  existingAsset?: Partial<Asset>;
  preferredDuration?: number;
  preferredThumbnail?: string;
  thumbnailTimeOffset?: number;
}

export interface CutImportResult {
  asset: Asset;
  displayTime: number;
}

export async function buildAssetForCut(
  source: CutImportSource,
  vaultPath?: string | null
): Promise<CutImportResult> {
  const canonicalMetadata = await readCanonicalAssetMetadataForPath(source.sourcePath, source.type, {
    duration: source.preferredDuration ?? source.existingAsset?.duration,
    fileSize: source.fileSize ?? source.existingAsset?.fileSize,
    metadata: source.existingAsset?.metadata,
  });
  let duration = canonicalMetadata.duration ?? source.preferredDuration ?? source.existingAsset?.duration;
  let thumbnail = source.preferredThumbnail ?? source.existingAsset?.thumbnail;
  let metadata = canonicalMetadata.metadata ?? source.existingAsset?.metadata;

  if (source.type === 'video') {
    if (!thumbnail) {
      const thumb = await getAssetThumbnail('timeline-card', {
        assetId: source.assetId,
        path: source.sourcePath,
        type: 'video',
        timeOffset: source.thumbnailTimeOffset ?? 0,
      });
      if (thumb) {
        thumbnail = thumb;
      }
    }
  }

  const baseAsset: Partial<Asset> = {
    ...source.existingAsset,
    id: source.assetId,
    name: source.existingAsset?.name ?? source.name,
    path: source.sourcePath,
    type: source.existingAsset?.type ?? source.type,
    thumbnail,
    duration,
    metadata,
    fileSize: canonicalMetadata.fileSize ?? source.fileSize ?? source.existingAsset?.fileSize,
  };

  let resolvedAsset: Asset | null = null;
  if (vaultPath) {
    resolvedAsset = await importFileToVault(source.sourcePath, vaultPath, source.assetId, baseAsset);
  }

  const asset: Asset = resolvedAsset ?? {
    id: source.assetId,
    name: baseAsset.name || source.name,
    path: baseAsset.path || source.sourcePath,
    type: baseAsset.type || source.type,
    thumbnail,
    duration,
    metadata,
    fileSize: baseAsset.fileSize,
    vaultRelativePath: baseAsset.vaultRelativePath,
    originalPath: baseAsset.originalPath ?? source.sourcePath,
    hash: baseAsset.hash,
  };

  const displayTime = asset.type === 'video' && asset.duration ? asset.duration : 1.0;

  return { asset, displayTime };
}
