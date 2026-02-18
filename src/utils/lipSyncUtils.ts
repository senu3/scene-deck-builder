import type { LipSyncSettings, Asset } from '../types';

export interface LipSyncThresholds {
  t1: number;
  t2: number;
  t3: number;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeThresholds(thresholds: LipSyncThresholds): LipSyncThresholds {
  const t1 = clamp(thresholds.t1);
  const t2 = clamp(Math.max(t1, thresholds.t2));
  const t3 = clamp(Math.max(t2, thresholds.t3));
  return { t1, t2, t3 };
}

export function rmsValueToVariantIndex(value: number, thresholds: LipSyncThresholds): number {
  const { t1, t2, t3 } = normalizeThresholds(thresholds);
  const v = clamp(value);
  if (v >= t3) return 3;
  if (v >= t2) return 2;
  if (v >= t1) return 1;
  return 0;
}

export function absoluteTimeToRmsIndex(
  absoluteTimeSec: number,
  fps: number,
  length: number,
  offsetSec: number = 0
): number {
  if (length <= 0 || fps <= 0) return 0;
  const effectiveTime = Math.max(0, absoluteTimeSec + offsetSec);
  const index = Math.floor(effectiveTime * fps);
  if (index < 0) return 0;
  if (index >= length) return length - 1;
  return index;
}

export async function importDataUrlAssetToVault(
  dataUrl: string,
  vaultPath: string,
  assetId: string,
  name: string
): Promise<Asset | null> {
  if (!window.electronAPI?.vaultGateway) return null;
  if (!dataUrl) return null;

  const importDataUrlAsset = window.electronAPI.vaultGateway.importDataUrlAsset;
  if (typeof importDataUrlAsset !== 'function') {
    console.error('importDataUrlAsset is unavailable. App restart may be required.');
    return null;
  }

  const result = await importDataUrlAsset(dataUrl, vaultPath, assetId);
  if (!result.success) {
    console.error('Failed to import data URL asset:', result.error);
    return null;
  }

  return {
    id: assetId,
    name,
    path: result.vaultPath || '',
    type: 'image',
    vaultRelativePath: result.relativePath,
    originalPath: result.vaultPath || '',
    hash: result.hash,
  };
}

export function buildLipSyncSources(
  settings: LipSyncSettings,
  assetMap: Map<string, Asset>,
  thumbnailMap: Map<string, string>
): string[] {
  const ids = getLipSyncFrameAssetIds(settings);
  return ids.map((id, index) => {
    const cached = thumbnailMap.get(id);
    if (cached) return cached;
    const asset = assetMap.get(id);
    return asset?.thumbnail || (index === 0 ? asset?.thumbnail || '' : '');
  });
}

export function getLipSyncFrameAssetIds(settings: LipSyncSettings): string[] {
  if (!Array.isArray(settings.compositedFrameAssetIds) || settings.compositedFrameAssetIds.length === 0) {
    return [];
  }
  return settings.compositedFrameAssetIds;
}
