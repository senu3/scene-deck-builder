import {
  getVideoMetadataBridge,
  loadAssetIndexBridge,
  readImageMetadataBridge,
  resolveVaultPathBridge,
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
  const duration = meta?.duration;
  if (typeof duration !== 'number') return null;
  if (!Number.isFinite(duration) || duration <= 0) return null;
  return duration;
}
