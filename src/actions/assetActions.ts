import type { AssetRefMap } from '../utils/assetRefs';
import { getBlockingRefsForAssetIds } from '../utils/assetRefs';
import {
  extractAudioAndRegisterAsset,
  finalizeClipAndRegisterAsset,
  type ExtractAudioAssetOnlyResult,
  type FinalizeClipAssetOnlyResult,
} from '../features/cut/actions';

export interface AssetActionContext {
  assetPath: string;
  sourceName: string;
  assetType: 'image' | 'video' | 'audio';
  linkedAssetIds: string[];
  fallbackAssetId: string;
  hasClipRange: boolean;
  clipInPoint?: number;
  clipOutPoint?: number;
}

interface ResolveAssetRangeDeps {
  resolveDurationSec: (assetPath: string) => Promise<number | null>;
}

interface DeleteAssetWithPolicyResult {
  success: boolean;
  reason?: string;
  blockingRefs?: Array<{ kind?: string }>;
}

interface AssetActionDeps extends ResolveAssetRangeDeps {
  deleteAssetWithPolicy: (params: {
    assetPath: string;
    assetIds: string[];
    reason: string;
  }) => Promise<DeleteAssetWithPolicyResult>;
}

export type ResolveRangeResult =
  | { success: true; inPoint: number; outPoint: number }
  | { success: false; reason: 'range-required' | 'duration-unavailable' };

export async function resolveAssetRange(
  context: AssetActionContext,
  requireClipRange: boolean,
  deps: ResolveAssetRangeDeps
): Promise<ResolveRangeResult> {
  if (
    context.hasClipRange &&
    typeof context.clipInPoint === 'number' &&
    typeof context.clipOutPoint === 'number'
  ) {
    return { success: true, inPoint: context.clipInPoint, outPoint: context.clipOutPoint };
  }

  if (requireClipRange) {
    return { success: false, reason: 'range-required' };
  }

  const duration = await deps.resolveDurationSec(context.assetPath);
  if (!duration || duration <= 0) {
    return { success: false, reason: 'duration-unavailable' };
  }
  return { success: true, inPoint: 0, outPoint: duration };
}

export type RunAssetFinalizeResult =
  | { success: true; result: FinalizeClipAssetOnlyResult }
  | { success: false; reason: 'missing-vault' | 'range-required' | 'duration-unavailable' | 'unsupported-asset-type' };

export async function runAssetFinalize(
  context: AssetActionContext,
  params: {
    vaultPath: string | null;
    reverseOutput: boolean;
    requireClipRange: boolean;
  },
  deps: ResolveAssetRangeDeps
): Promise<RunAssetFinalizeResult> {
  if (!params.vaultPath) {
    return { success: false, reason: 'missing-vault' };
  }
  if (context.assetType !== 'video') {
    return { success: false, reason: 'unsupported-asset-type' };
  }

  const range = await resolveAssetRange(context, params.requireClipRange, deps);
  if (!range.success) {
    return { success: false, reason: range.reason };
  }

  const result = await finalizeClipAndRegisterAsset({
    sourceAssetPath: context.assetPath,
    sourceAssetName: context.sourceName,
    inPoint: range.inPoint,
    outPoint: range.outPoint,
    reverseOutput: params.reverseOutput,
    vaultPath: params.vaultPath,
  });

  return { success: true, result };
}

export type RunAssetExtractAudioResult =
  | { success: true; result: ExtractAudioAssetOnlyResult }
  | { success: false; reason: 'missing-vault' | 'duration-unavailable' | 'unsupported-asset-type' };

export async function runAssetExtractAudio(
  context: AssetActionContext,
  params: { vaultPath: string | null },
  deps: ResolveAssetRangeDeps
): Promise<RunAssetExtractAudioResult> {
  if (!params.vaultPath) {
    return { success: false, reason: 'missing-vault' };
  }
  if (context.assetType !== 'video') {
    return { success: false, reason: 'unsupported-asset-type' };
  }

  const range = await resolveAssetRange(context, false, deps);
  if (!range.success) {
    return { success: false, reason: 'duration-unavailable' };
  }

  const result = await extractAudioAndRegisterAsset({
    sourceAssetPath: context.assetPath,
    sourceAssetName: context.sourceName,
    vaultPath: params.vaultPath,
    inPoint: range.inPoint,
    outPoint: range.outPoint,
  });

  return { success: true, result };
}

export type RunAssetDeleteResult =
  | { success: true; assetIds: string[] }
  | { success: false; reason: 'blocked' | 'delete-failed'; blockingKind?: string };

export async function runAssetDelete(
  context: AssetActionContext,
  params: {
    reason: string;
    assetRefs: AssetRefMap;
  },
  deps: Pick<AssetActionDeps, 'deleteAssetWithPolicy'>
): Promise<RunAssetDeleteResult> {
  const assetIds = context.linkedAssetIds.length > 0 ? context.linkedAssetIds : [context.fallbackAssetId];
  const blockingRefs = getBlockingRefsForAssetIds(params.assetRefs, assetIds);
  if (blockingRefs.length > 0) {
    return { success: false, reason: 'blocked', blockingKind: blockingRefs[0]?.kind || 'unknown' };
  }

  const result = await deps.deleteAssetWithPolicy({
    assetPath: context.assetPath,
    assetIds,
    reason: params.reason,
  });

  if (!result.success) {
    if (result.reason === 'asset-in-use') {
      return {
        success: false,
        reason: 'blocked',
        blockingKind: result.blockingRefs?.[0]?.kind || 'unknown',
      };
    }
    return { success: false, reason: 'delete-failed' };
  }

  return { success: true, assetIds };
}
