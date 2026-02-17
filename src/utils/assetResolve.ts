import type { Asset, Cut } from '../types';

type CutLike = Pick<Cut, 'assetId' | 'asset' | 'isClip' | 'displayTime'>;
type GetAssetById = (assetId: string) => Asset | undefined;
type ResolvedDurationSource = 'displayTime' | 'assetDuration' | 'fallback';

export interface ResolveCutDisplayTimeOptions {
  fallbackDurationSec?: number;
  preferAssetDuration?: boolean;
}

export interface ResolvedCutDisplayTime {
  durationSec: number;
  adjusted: boolean;
  source: ResolvedDurationSource;
}

export function resolveCutAsset(cut: CutLike | null | undefined, getAsset: GetAssetById): Asset | null {
  if (!cut) return null;
  return getAsset(cut.assetId) ?? cut.asset ?? null;
}

export function resolveCutAssetId(cut: CutLike | null | undefined, getAsset: GetAssetById): string | null {
  if (!cut) return null;
  if (cut.assetId) return cut.assetId;
  return resolveCutAsset(cut, getAsset)?.id ?? null;
}

export function cutAssetPathStartsWith(
  cut: CutLike | null | undefined,
  getAsset: GetAssetById,
  prefix: string
): boolean {
  const path = resolveCutAsset(cut, getAsset)?.path;
  return typeof path === 'string' && path.startsWith(prefix);
}

export function resolveCutDuration(cut: CutLike | null | undefined, getAsset: GetAssetById): number | null {
  if (!cut) return null;
  const resolved = resolveCutAsset(cut, getAsset);
  if (typeof resolved?.duration === 'number' && Number.isFinite(resolved.duration) && resolved.duration > 0) {
    return resolved.duration;
  }
  if (typeof cut.displayTime === 'number' && Number.isFinite(cut.displayTime) && cut.displayTime > 0) {
    return cut.displayTime;
  }
  return null;
}

export function resolveNormalizedCutDisplayTime(
  cut: CutLike | null | undefined,
  getAsset: GetAssetById,
  options: ResolveCutDisplayTimeOptions = {}
): ResolvedCutDisplayTime {
  const fallbackDurationSec = options.fallbackDurationSec ?? 1.0;
  if (!cut) {
    return {
      durationSec: fallbackDurationSec,
      adjusted: true,
      source: 'fallback',
    };
  }

  if (typeof cut.displayTime === 'number' && Number.isFinite(cut.displayTime) && cut.displayTime > 0) {
    return {
      durationSec: cut.displayTime,
      adjusted: false,
      source: 'displayTime',
    };
  }

  if (options.preferAssetDuration) {
    const resolved = resolveCutAsset(cut, getAsset);
    if (
      resolved?.type === 'video' &&
      typeof resolved.duration === 'number' &&
      Number.isFinite(resolved.duration) &&
      resolved.duration > 0
    ) {
      return {
        durationSec: resolved.duration,
        adjusted: true,
        source: 'assetDuration',
      };
    }
  }

  return {
    durationSec: fallbackDurationSec,
    adjusted: true,
    source: 'fallback',
  };
}

export function resolveCutThumbnail(cut: CutLike | null | undefined, getAsset: GetAssetById): string | null {
  if (!cut) return null;
  if (cut.isClip && cut.asset?.thumbnail) {
    return cut.asset.thumbnail;
  }
  return resolveCutAsset(cut, getAsset)?.thumbnail ?? null;
}
