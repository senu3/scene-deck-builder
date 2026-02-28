import {
  getCachedThumbnail,
  getThumbnail,
  removeThumbnailCache,
  type ThumbnailMediaType,
  type ThumbnailProfile,
} from '../../utils/thumbnailCache';

export type CutDerivedThumbnailKind = 'clip' | (string & {});

export interface AssetThumbnailParams {
  path: string;
  type: ThumbnailMediaType;
  assetId?: string;
  timeOffset?: number;
  key?: string;
}

export interface CutDerivedThumbnailParams {
  kind: CutDerivedThumbnailKind;
  cutId: string;
  fingerprint: string;
  path: string;
  type: ThumbnailMediaType;
  timeOffset?: number;
  key?: string;
}

export interface CutClipThumbnailParams {
  cutId: string;
  path: string;
  inPointSec: number;
  outPointSec?: number;
  key?: string;
}

export interface AssetThumbnailSource {
  id?: string;
  path?: string;
  type?: string;
  thumbnail?: string;
}

export interface ResolveAssetThumbnailSourceOptions {
  timeOffset?: number;
  preferCache?: boolean;
  includeSnapshotFallback?: boolean;
}

function normalizeTimeOffset(timeOffset: number | undefined): number {
  if (!Number.isFinite(timeOffset)) return 0;
  return Math.max(0, timeOffset ?? 0);
}

function toMillis(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round((value ?? 0) * 1000));
}

function encodePart(value: string): string {
  return encodeURIComponent(value);
}

function isThumbnailMediaType(value: string | undefined): value is ThumbnailMediaType {
  return value === 'image' || value === 'video';
}

export function buildAssetThumbnailKey(params: {
  assetId?: string;
  path: string;
  profile: ThumbnailProfile;
  timeOffset?: number;
}): string {
  const identity = params.assetId || params.path;
  const offset = normalizeTimeOffset(params.timeOffset);
  return `asset:${encodePart(identity)}:${params.profile}:${offset}`;
}

export function buildCutDerivedThumbnailKey(params: {
  kind: CutDerivedThumbnailKind;
  cutId: string;
  fingerprint: string;
  profile: ThumbnailProfile;
}): string {
  return `cut:${encodePart(params.kind)}:${encodePart(params.cutId)}:${encodePart(params.fingerprint)}:${params.profile}`;
}

export function buildCutClipFingerprint(inPointSec: number | undefined, outPointSec: number | undefined): string {
  const inMs = toMillis(inPointSec);
  const outMs = toMillis(outPointSec ?? inPointSec);
  return `${inMs}-${outMs}`;
}

export async function getAssetThumbnail(
  profile: ThumbnailProfile,
  params: AssetThumbnailParams
): Promise<string | null> {
  const normalizedOffset = normalizeTimeOffset(params.timeOffset);
  const key = params.key ?? buildAssetThumbnailKey({
    assetId: params.assetId,
    path: params.path,
    profile,
    timeOffset: normalizedOffset,
  });
  return getThumbnail(params.path, params.type, {
    profile,
    timeOffset: normalizedOffset,
    key,
  });
}

export function getCachedAssetThumbnail(
  profile: ThumbnailProfile,
  params: Pick<AssetThumbnailParams, 'assetId' | 'path' | 'timeOffset' | 'key'>
): string | null {
  const normalizedOffset = normalizeTimeOffset(params.timeOffset);
  const key = params.key ?? buildAssetThumbnailKey({
    assetId: params.assetId,
    path: params.path,
    profile,
    timeOffset: normalizedOffset,
  });
  return getCachedThumbnail(params.path, {
    profile,
    timeOffset: normalizedOffset,
    key,
  });
}

export function removeAssetThumbnail(
  profile: ThumbnailProfile,
  params: Pick<AssetThumbnailParams, 'assetId' | 'path' | 'timeOffset' | 'key'>
): void {
  const normalizedOffset = normalizeTimeOffset(params.timeOffset);
  const key = params.key ?? buildAssetThumbnailKey({
    assetId: params.assetId,
    path: params.path,
    profile,
    timeOffset: normalizedOffset,
  });
  removeThumbnailCache(params.path, {
    profile,
    timeOffset: normalizedOffset,
    key,
  });
}

export async function getCutDerivedThumbnail(
  profile: ThumbnailProfile,
  params: CutDerivedThumbnailParams
): Promise<string | null> {
  const normalizedOffset = normalizeTimeOffset(params.timeOffset);
  const key = params.key ?? buildCutDerivedThumbnailKey({
    kind: params.kind,
    cutId: params.cutId,
    fingerprint: params.fingerprint,
    profile,
  });
  return getThumbnail(params.path, params.type, {
    profile,
    timeOffset: normalizedOffset,
    key,
  });
}

export async function getCutClipThumbnail(
  profile: ThumbnailProfile,
  params: CutClipThumbnailParams
): Promise<string | null> {
  return getCutDerivedThumbnail(profile, {
    kind: 'clip',
    cutId: params.cutId,
    fingerprint: buildCutClipFingerprint(params.inPointSec, params.outPointSec),
    path: params.path,
    type: 'video',
    timeOffset: params.inPointSec,
    key: params.key,
  });
}

export function resolveAssetThumbnailFromCache(
  profile: ThumbnailProfile,
  asset: AssetThumbnailSource,
  options: ResolveAssetThumbnailSourceOptions = {}
): string | null {
  const includeSnapshotFallback = options.includeSnapshotFallback !== false;
  if (!asset.path) return includeSnapshotFallback ? (asset.thumbnail ?? null) : null;

  const normalizedOffset = normalizeTimeOffset(options.timeOffset);
  const key = buildAssetThumbnailKey({
    assetId: asset.id,
    path: asset.path,
    profile,
    timeOffset: normalizedOffset,
  });
  const cached = getCachedAssetThumbnail(profile, {
    assetId: asset.id,
    path: asset.path,
    timeOffset: normalizedOffset,
    key,
  });
  if (cached) return cached;
  return includeSnapshotFallback ? (asset.thumbnail ?? null) : null;
}

export async function resolveAssetThumbnailSource(
  profile: ThumbnailProfile,
  asset: AssetThumbnailSource,
  options: ResolveAssetThumbnailSourceOptions = {}
): Promise<string | null> {
  const includeSnapshotFallback = options.includeSnapshotFallback !== false;
  const preferCache = options.preferCache !== false;

  if (!asset.path || !isThumbnailMediaType(asset.type)) {
    return includeSnapshotFallback ? (asset.thumbnail ?? null) : null;
  }

  const normalizedOffset = normalizeTimeOffset(options.timeOffset);
  const key = buildAssetThumbnailKey({
    assetId: asset.id,
    path: asset.path,
    profile,
    timeOffset: normalizedOffset,
  });

  if (preferCache) {
    const cached = getCachedAssetThumbnail(profile, {
      assetId: asset.id,
      path: asset.path,
      timeOffset: normalizedOffset,
      key,
    });
    if (cached) return cached;
  }

  const loaded = await getAssetThumbnail(profile, {
    assetId: asset.id,
    path: asset.path,
    type: asset.type,
    timeOffset: normalizedOffset,
    key,
  });
  if (loaded) return loaded;

  return includeSnapshotFallback ? (asset.thumbnail ?? null) : null;
}
