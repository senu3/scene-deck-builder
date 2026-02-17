import type { Asset } from '../types';
import { importFileToVault } from './assetPath';
import { extractVideoMetadata } from './videoUtils';
import { getThumbnail } from './thumbnailCache';

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
  let duration = source.preferredDuration ?? source.existingAsset?.duration;
  let thumbnail = source.preferredThumbnail ?? source.existingAsset?.thumbnail;
  let metadata = source.existingAsset?.metadata;

  if (source.type === 'video') {
    if (!duration) {
      const videoMeta = await extractVideoMetadata(source.sourcePath);
      if (videoMeta) {
        duration = videoMeta.duration;
        if (!metadata) {
          metadata = {
            width: videoMeta.width,
            height: videoMeta.height,
          };
        }
      }
    }

    if (!thumbnail) {
      const thumb = await getThumbnail(source.sourcePath, 'video', {
        timeOffset: source.thumbnailTimeOffset ?? 0,
        profile: 'timeline-card',
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
    fileSize: source.fileSize ?? source.existingAsset?.fileSize,
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
