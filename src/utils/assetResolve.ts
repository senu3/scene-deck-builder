import type { Asset, Cut } from '../types';

type CutLike = Pick<Cut, 'assetId' | 'asset' | 'isClip' | 'displayTime'>;
type GetAssetById = (assetId: string) => Asset | undefined;

export function resolveCutAsset(cut: CutLike | null | undefined, getAsset: GetAssetById): Asset | null {
  if (!cut) return null;
  return getAsset(cut.assetId) ?? cut.asset ?? null;
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

export function resolveCutThumbnail(cut: CutLike | null | undefined, getAsset: GetAssetById): string | null {
  if (!cut) return null;
  if (cut.isClip && cut.asset?.thumbnail) {
    return cut.asset.thumbnail;
  }
  return resolveCutAsset(cut, getAsset)?.thumbnail ?? null;
}
