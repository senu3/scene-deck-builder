import {
  getFileInfoBridge,
  hasVaultGatewayBridge,
  getVideoMetadataBridge,
  loadAssetIndexBridge,
  moveToTrashWithMetaBridge,
  readImageMetadataBridge,
  resolveVaultPathBridge,
  saveAssetIndexBridge,
  withSerializedAssetIndexMutationBridge,
} from '../platform/electronGateway';
import type { Asset } from '../../types';

type AssetIndexEntryLike = {
  id: string;
  hash: string;
  filename: string;
  originalName: string;
  originalPath: string;
  type: 'image' | 'video' | 'audio';
  fileSize: number;
  importedAt: string;
};

type ImageMetadataLike = {
  width?: number;
  height?: number;
  format?: string;
  prompt?: string;
  negativePrompt?: string;
  model?: string;
  seed?: number;
  steps?: number;
  sampler?: string;
  cfg?: number;
  software?: string;
  fileSize?: number;
};

type VideoMetadataLike = {
  duration?: number;
  width?: number;
  height?: number;
};

export type CanonicalAssetMetadata = {
  duration?: number;
  fileSize?: number;
  metadata?: Asset['metadata'];
};

type DeleteAssetWithIndexSyncParams = {
  assetPath: string;
  trashPath: string;
  assetIds: string[];
  reason?: string;
  vaultPath?: string | null;
};

type DeleteAssetFileParams = {
  assetPath: string;
  trashPath: string;
  assetIds: string[];
  reason?: string;
};

type RemoveAssetsFromIndexParams = {
  vaultPath?: string | null;
  assetIds: string[];
};

export type DeleteAssetFileResult = {
  success: boolean;
  reason?: 'electron-unavailable' | 'trash-move-failed' | 'invalid-params';
};

export type RemoveAssetsFromIndexResult = {
  success: boolean;
  reason?: 'index-update-failed' | 'invalid-params';
};

export type DeleteAssetWithIndexSyncResult = {
  success: boolean;
  fileDeleted: boolean;
  indexUpdated: boolean;
  reason?: 'electron-unavailable' | 'trash-move-failed' | 'index-update-failed' | 'invalid-params';
};

function normalizePositiveNumber(value: unknown): number | undefined {
  if (typeof value !== 'number') return undefined;
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

function normalizeNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value !== 'number') return undefined;
  if (!Number.isFinite(value) || value < 0) return undefined;
  return value;
}

function normalizeAssetMetadataShape(value: unknown): Asset['metadata'] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const normalized: NonNullable<Asset['metadata']> = {};

  if (typeof raw.width === 'number' && Number.isFinite(raw.width) && raw.width > 0) normalized.width = raw.width;
  if (typeof raw.height === 'number' && Number.isFinite(raw.height) && raw.height > 0) normalized.height = raw.height;
  if (typeof raw.format === 'string' && raw.format) normalized.format = raw.format;
  if (typeof raw.prompt === 'string' && raw.prompt) normalized.prompt = raw.prompt;
  if (typeof raw.negativePrompt === 'string' && raw.negativePrompt) normalized.negativePrompt = raw.negativePrompt;
  if (typeof raw.model === 'string' && raw.model) normalized.model = raw.model;
  if (typeof raw.seed === 'number' && Number.isFinite(raw.seed)) normalized.seed = raw.seed;
  if (typeof raw.steps === 'number' && Number.isFinite(raw.steps) && raw.steps >= 0) normalized.steps = raw.steps;
  if (typeof raw.sampler === 'string' && raw.sampler) normalized.sampler = raw.sampler;
  if (typeof raw.cfg === 'number' && Number.isFinite(raw.cfg)) normalized.cfg = raw.cfg;
  if (typeof raw.software === 'string' && raw.software) normalized.software = raw.software;
  const fileSize = normalizeNonNegativeNumber(raw.fileSize);
  if (fileSize !== undefined) normalized.fileSize = fileSize;

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function isAssetIndexEntryLike(value: unknown): value is AssetIndexEntryLike {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === 'string'
    && typeof entry.filename === 'string'
    && typeof entry.originalName === 'string'
    && typeof entry.originalPath === 'string';
}

export async function loadAssetIndexEntries(vaultPath: string): Promise<AssetIndexEntryLike[]> {
  if (!vaultPath) return [];
  try {
    const index = await loadAssetIndexBridge(vaultPath);
    if (!index || !Array.isArray(index.assets)) return [];
    return index.assets.filter(isAssetIndexEntryLike);
  } catch {
    return [];
  }
}

function toAssetFromIndexEntry(vaultPath: string, entry: AssetIndexEntryLike, absolutePath?: string): Asset {
  const vaultRelativePath = `assets/${entry.filename}`.replace(/\\/g, '/');
  return {
    id: entry.id,
    name: entry.originalName || entry.filename || entry.id,
    path: absolutePath || `${vaultPath}/${vaultRelativePath}`.replace(/\\/g, '/'),
    type: entry.type,
    vaultRelativePath,
    originalPath: entry.originalPath,
    hash: entry.hash,
    fileSize: entry.fileSize,
  };
}

async function resolveVaultAssetPath(
  vaultPath: string,
  entry: AssetIndexEntryLike
): Promise<string | undefined> {
  try {
    const resolved = await resolveVaultPathBridge(vaultPath, `assets/${entry.filename}`);
    if (resolved.exists && resolved.absolutePath) {
      return resolved.absolutePath;
    }
  } catch {
    // best effort only
  }
  return undefined;
}

export async function hydrateAssetsByIdsFromIndex(
  vaultPath: string,
  assetIds: string[],
): Promise<Asset[]> {
  if (!vaultPath || assetIds.length === 0) return [];
  const entries = await loadAssetIndexEntries(vaultPath);
  if (entries.length === 0) return [];
  const entryById = new Map(entries.map((entry) => [entry.id, entry] as const));
  const hydratedAssets: Asset[] = [];

  for (const assetId of assetIds) {
    const entry = entryById.get(assetId);
    if (!entry) continue;
    const absolutePath = await resolveVaultAssetPath(vaultPath, entry);
    hydratedAssets.push(toAssetFromIndexEntry(vaultPath, entry, absolutePath));
  }

  return hydratedAssets;
}

export async function readImageMetadataForPath(path: string): Promise<ImageMetadataLike | null> {
  if (!path) return null;
  try {
    return await readImageMetadataBridge(path);
  } catch {
    return null;
  }
}

export async function readVideoMetadataForPath(path: string): Promise<VideoMetadataLike | null> {
  if (!path) return null;
  try {
    return await getVideoMetadataBridge(path);
  } catch {
    return null;
  }
}

export async function resolveVideoDurationForPath(path: string): Promise<number | null> {
  const meta = await readVideoMetadataForPath(path);
  return normalizePositiveNumber(meta?.duration) ?? null;
}

export async function readCanonicalAssetMetadataForPath(
  path: string,
  assetType: Asset['type'],
  seed?: CanonicalAssetMetadata
): Promise<CanonicalAssetMetadata> {
  const fileInfo = await getFileInfoBridge(path).catch(() => null);
  const next: CanonicalAssetMetadata = {
    duration: normalizePositiveNumber(seed?.duration),
    fileSize: normalizeNonNegativeNumber(fileInfo?.size) ?? normalizeNonNegativeNumber(seed?.fileSize),
    metadata: normalizeAssetMetadataShape(seed?.metadata),
  };

  if (assetType === 'image') {
    const imageMeta = await readImageMetadataForPath(path);
    const normalizedImageMeta = normalizeAssetMetadataShape({
      ...(next.metadata || {}),
      ...(imageMeta || {}),
    });
    return {
      ...next,
      fileSize: normalizeNonNegativeNumber(imageMeta?.fileSize) ?? next.fileSize,
      metadata: normalizedImageMeta,
    };
  }

  if (assetType === 'video') {
    const videoMeta = await readVideoMetadataForPath(path);
    const normalizedVideoMeta = normalizeAssetMetadataShape({
      ...(next.metadata || {}),
      width: videoMeta?.width,
      height: videoMeta?.height,
    });
    return {
      ...next,
      duration: normalizePositiveNumber(videoMeta?.duration) ?? next.duration,
      metadata: normalizedVideoMeta,
    };
  }

  return next;
}

export async function deleteAssetWithIndexSync(
  params: DeleteAssetWithIndexSyncParams
): Promise<DeleteAssetWithIndexSyncResult> {
  const fileDeletion = await deleteAssetFile(params);
  if (!fileDeletion.success) {
    return {
      success: false,
      fileDeleted: false,
      indexUpdated: false,
      reason: fileDeletion.reason,
    };
  }

  const indexUpdate = await removeAssetsFromIndex({
    vaultPath: params.vaultPath,
    assetIds: params.assetIds,
  });
  if (!indexUpdate.success) {
    return { success: true, fileDeleted: true, indexUpdated: false, reason: indexUpdate.reason };
  }

  return { success: true, fileDeleted: true, indexUpdated: true };
}

export async function deleteAssetFile(
  params: DeleteAssetFileParams
): Promise<DeleteAssetFileResult> {
  const { assetPath, trashPath, assetIds, reason } = params;
  const normalizedAssetIds = Array.from(new Set(assetIds.filter(Boolean)));
  if (!assetPath || !trashPath) {
    return { success: false, reason: 'invalid-params' };
  }
  if (!hasVaultGatewayBridge()) {
    return { success: false, reason: 'electron-unavailable' };
  }

  const moved = await moveToTrashWithMetaBridge(assetPath, trashPath, {
    assetId: normalizedAssetIds[0],
    reason: reason || 'asset-delete-policy',
  });
  if (!moved) {
    return { success: false, reason: 'trash-move-failed' };
  }

  return { success: true };
}

export async function removeAssetsFromIndex(
  params: RemoveAssetsFromIndexParams
): Promise<RemoveAssetsFromIndexResult> {
  const { vaultPath, assetIds } = params;
  const normalizedAssetIds = Array.from(new Set(assetIds.filter(Boolean)));
  if (!vaultPath || normalizedAssetIds.length === 0) {
    return { success: true };
  }

  const indexUpdated = await withSerializedAssetIndexMutationBridge(async () => {
    try {
      const index = await loadAssetIndexBridge(vaultPath);
      if (!index || !Array.isArray(index.assets)) return false;
      const deletedIds = new Set(normalizedAssetIds);
      const updatedAssets = index.assets.filter((entry) => {
        const candidate = entry as { id?: unknown };
        return typeof candidate.id !== 'string' || !deletedIds.has(candidate.id);
      });
      if (updatedAssets.length === index.assets.length) {
        return true;
      }
      return await saveAssetIndexBridge(vaultPath, {
        ...index,
        assets: updatedAssets,
      });
    } catch {
      return false;
    }
  });

  if (!indexUpdated) {
    return { success: false, reason: 'index-update-failed' };
  }
  return { success: true };
}
