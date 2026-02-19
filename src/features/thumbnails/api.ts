import { getThumbnail, type ThumbnailMediaType, type ThumbnailProfile } from '../../utils/thumbnailCache';

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
