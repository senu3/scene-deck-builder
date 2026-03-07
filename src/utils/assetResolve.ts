import type { Asset, Cut } from '../types';

type CutLike = Pick<Cut, 'assetId' | 'asset' | 'isClip' | 'displayTime' | 'inPoint' | 'outPoint'>;
type GetAssetById = (assetId: string) => Asset | undefined;
type ResolvedDurationSource = 'clipDuration' | 'displayTime' | 'assetDuration' | 'fallback';

export interface ResolveCutDisplayTimeOptions {
  fallbackDurationSec?: number;
  preferAssetDuration?: boolean;
}

export interface ResolvedCutDisplayTime {
  durationSec: number;
  adjusted: boolean;
  source: ResolvedDurationSource;
}

function resolveClipDuration(cut: CutLike | null | undefined): number | null {
  if (!cut?.isClip) return null;
  if (!Number.isFinite(cut.inPoint) || !Number.isFinite(cut.outPoint)) return null;
  const durationSec = (cut.outPoint as number) - (cut.inPoint as number);
  if (!Number.isFinite(durationSec) || durationSec <= 0) return null;
  return durationSec;
}

export function resolveCutAsset(cut: CutLike | null | undefined, getAsset: GetAssetById): Asset | null {
  if (!cut?.assetId) return null;
  return getAsset(cut.assetId) ?? null;
}

export function resolveCutAssetFromAssetId(cut: CutLike | null | undefined, getAsset: GetAssetById): Asset | null {
  if (!cut?.assetId) return null;
  return getAsset(cut.assetId) ?? null;
}

export function resolveCutAssetId(cut: CutLike | null | undefined, getAsset: GetAssetById): string | null {
  void getAsset;
  if (!cut?.assetId) return null;
  return cut.assetId;
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

  const clipDurationSec = resolveClipDuration(cut);
  if (clipDurationSec !== null) {
    const displayTime = typeof cut.displayTime === 'number' && Number.isFinite(cut.displayTime) && cut.displayTime > 0
      ? cut.displayTime
      : null;
    return {
      durationSec: clipDurationSec,
      adjusted: displayTime === null || Math.abs(displayTime - clipDurationSec) > 1e-6,
      source: 'clipDuration',
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
