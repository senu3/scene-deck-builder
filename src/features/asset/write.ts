import type { Asset } from '../../types';
import { readCanonicalAssetMetadataForPath } from '../metadata/provider';
import {
  finalizeVaultAssetBridge,
  hasVaultGatewayBridge,
  withSerializedAssetIndexMutationBridge,
} from '../platform/electronGateway';
import { getMediaType } from '../../utils/mediaType';

export interface RegisterAssetFileParams {
  sourcePath: string;
  vaultPath: string;
  assetId: string;
  existingAsset?: Partial<Asset>;
}

export interface RegisterAssetFileResult {
  asset: Asset;
  isDuplicate: boolean;
}

function inferAssetType(sourcePath: string, existingAsset?: Partial<Asset>): Asset['type'] {
  if (existingAsset?.type) return existingAsset.type;
  return getMediaType(sourcePath) || 'image';
}

function getDisplayName(sourcePath: string, existingAsset?: Partial<Asset>): string {
  if (existingAsset?.name) return existingAsset.name;
  return sourcePath.split(/[/\\]/).pop() || 'asset';
}

export async function registerAssetFile({
  sourcePath,
  vaultPath,
  assetId,
  existingAsset,
}: RegisterAssetFileParams): Promise<RegisterAssetFileResult | null> {
  if (!sourcePath || !vaultPath || !assetId || !hasVaultGatewayBridge()) {
    return null;
  }

  const type = inferAssetType(sourcePath, existingAsset);
  const normalizedMetadata = await readCanonicalAssetMetadataForPath(sourcePath, type, {
    duration: existingAsset?.duration,
    fileSize: existingAsset?.fileSize,
    metadata: existingAsset?.metadata,
  });

  const result = await withSerializedAssetIndexMutationBridge(async () => {
    return finalizeVaultAssetBridge(sourcePath, vaultPath, assetId, {
      originalName: existingAsset?.name,
      originalPath: existingAsset?.originalPath || sourcePath,
    });
  });

  if (!result?.success) {
    return null;
  }

  return {
    asset: {
      ...existingAsset,
      id: assetId,
      name: getDisplayName(sourcePath, existingAsset),
      path: result.vaultPath || sourcePath,
      type,
      thumbnail: existingAsset?.thumbnail,
      duration: normalizedMetadata.duration,
      metadata: normalizedMetadata.metadata,
      fileSize: normalizedMetadata.fileSize,
      vaultRelativePath: result.relativePath,
      originalPath: existingAsset?.originalPath || sourcePath,
      hash: result.hash || existingAsset?.hash,
    } as Asset,
    isDuplicate: !!result.isDuplicate,
  };
}
