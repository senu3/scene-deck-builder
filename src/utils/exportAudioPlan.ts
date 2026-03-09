import type { Asset, AudioBindingCore, Cut, MetadataStore } from '../types';
import { resolveCutAsset } from './assetResolve';
import { toCoreAudioBindingFromCut, toCoreAudioBindingFromScene } from './audioBindingAdapter';
import {
  asCanonicalDurationSec,
  computeStoryTimingsForCuts,
  resolveCanonicalCutDuration,
  type CanonicalDurationSec,
} from './storyTiming';

export interface ExportAudioEvent {
  assetId?: string;
  sourcePath: string;
  sourceStartSec: number;
  sourceOffsetSec?: number;
  timelineStartSec: number;
  durationSec: number;
  gain?: number;
  sceneId?: string;
  groupId?: string;
  cutId?: string;
  sourceType: 'video' | 'cut-attach' | 'scene-attach' | 'group-attach';
}

export interface ExportAudioPlan {
  totalDurationSec: number;
  events: ExportAudioEvent[];
}

export type ExportAudioPlanCut = Omit<Cut, 'displayTime'> & {
  displayTime: CanonicalDurationSec;
};

export interface CanonicalizedAudioPlanCuts {
  cuts: ExportAudioPlanCut[];
  adjustedCutIds: string[];
}

interface BuildExportAudioPlanInput {
  cuts: ExportAudioPlanCut[];
  metadataStore: MetadataStore | null;
  getAssetById: (assetId: string) => Asset | undefined;
  resolveSceneIdByCutId: (cutId: string) => string | undefined;
  canonicalGuard?: 'warn' | 'throw' | 'none';
}

function normalizeSeconds(value: number | undefined, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return value as number;
}

function isCanonicalDurationEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1e-6;
}

function resolveCanonicalAudioCutDuration(cut: Cut, getAssetById: (assetId: string) => Asset | undefined): number {
  return resolveCanonicalCutDuration(cut, getAssetById, {
    fallbackDurationSec: 1.0,
    preferAssetDuration: true,
  }).durationSec;
}

function buildSceneGroupKey(sceneId: string, groupId: string): string {
  return `${sceneId}::${groupId}`;
}

function resolveClampedAudioDuration(asset: Asset | undefined, spanDurationSec: number): number {
  const normalizedSpanDurationSec = Math.max(0, spanDurationSec);
  if (normalizedSpanDurationSec <= 0) return 0;
  const assetDuration = asset?.type === 'audio' && Number.isFinite(asset.duration) && asset.duration > 0
    ? asset.duration
    : normalizedSpanDurationSec;
  return Math.min(normalizedSpanDurationSec, assetDuration);
}

export function canonicalizeCutsForExportAudioPlan(
  cuts: Cut[],
  getAssetById: (assetId: string) => Asset | undefined
): CanonicalizedAudioPlanCuts {
  const adjustedCutIds: string[] = [];
  const normalizedCuts: ExportAudioPlanCut[] = cuts.map((cut) => {
    const resolvedDurationSec = resolveCanonicalAudioCutDuration(cut, getAssetById);
    if (!isCanonicalDurationEqual(cut.displayTime, resolvedDurationSec)) {
      adjustedCutIds.push(cut.id);
    }
    return {
      ...cut,
      displayTime: asCanonicalDurationSec(resolvedDurationSec),
    };
  });
  return {
    cuts: normalizedCuts,
    adjustedCutIds,
  };
}

export function buildExportAudioPlan(input: BuildExportAudioPlanInput): ExportAudioPlan {
  const guard = input.canonicalGuard ?? 'warn';
  const nonCanonicalCutIds: string[] = [];
  const canonicalDurationByCutId = new Map<string, number>();
  for (const cut of input.cuts) {
    const resolvedDurationSec = resolveCanonicalAudioCutDuration(cut, input.getAssetById);
    canonicalDurationByCutId.set(cut.id, resolvedDurationSec);
    if (!isCanonicalDurationEqual(cut.displayTime, resolvedDurationSec)) {
      nonCanonicalCutIds.push(cut.id);
    }
  }
  if (nonCanonicalCutIds.length > 0 && guard !== 'none') {
    const message =
      `[export-audio] buildExportAudioPlan received non-canonical cuts: ${nonCanonicalCutIds.join(', ')}. ` +
      'Canonicalize with canonicalizeCutsForExportAudioPlan(...) before building audio plan.';
    if (guard === 'throw') {
      throw new Error(message);
    }
    console.warn(message);
  }

  const cutTimingInputs = input.cuts.map((cut) => ({
    cutId: cut.id,
    sceneId: input.resolveSceneIdByCutId(cut.id) || `unknown-${cut.id}`,
    displayTime: canonicalDurationByCutId.get(cut.id) ?? cut.displayTime,
  }));
  const timings = computeStoryTimingsForCuts(cutTimingInputs);
  const events: ExportAudioEvent[] = [];
  const groupSpanByKey = new Map<string, {
    sceneId: string;
    groupId: string;
    startSec: number;
    endSec: number;
  }>();

  for (const cut of input.cuts) {
    const cutTiming = timings.cutTimings.get(cut.id);
    if (!cutTiming || cutTiming.durationSec <= 0) continue;

    const cutAsset = resolveCutAsset(cut, input.getAssetById);
    const useEmbeddedAudio = cut.useEmbeddedAudio ?? true;
    if (cutAsset?.type === 'video' && cutAsset.path && useEmbeddedAudio) {
      events.push({
        assetId: cutAsset.id,
        sourcePath: cutAsset.path,
        sourceStartSec: cut.isClip ? normalizeSeconds(cut.inPoint, 0) : 0,
        sourceOffsetSec: 0,
        timelineStartSec: cutTiming.startSec,
        durationSec: cutTiming.durationSec,
        gain: 1,
        sceneId: cutTiming.sceneId,
        cutId: cut.id,
        sourceType: 'video',
      });
    }

    const enabledBindings = (cut.audioBindings || []).filter((binding) => binding.enabled !== false);
    for (const binding of enabledBindings) {
      const coreBinding = toCoreAudioBindingFromCut(binding);
      const audioAsset = input.getAssetById(coreBinding.assetId);
      if (!audioAsset?.path || audioAsset.type !== 'audio') continue;
      events.push({
        assetId: audioAsset.id,
        sourcePath: audioAsset.path,
        sourceStartSec: 0,
        sourceOffsetSec: normalizeSeconds(coreBinding.offsetSec, 0),
        timelineStartSec: cutTiming.startSec,
        durationSec: cutTiming.durationSec,
        gain: Number.isFinite(coreBinding.gain) ? coreBinding.gain : 1,
        sceneId: cutTiming.sceneId,
        cutId: cut.id,
        sourceType: 'cut-attach',
      });
    }

    const sceneId = cutTiming.sceneId;
    const groupId = cut.groupId;
    if (!sceneId || !groupId) continue;
    const groupKey = buildSceneGroupKey(sceneId, groupId);
    const currentSpan = groupSpanByKey.get(groupKey);
    const cutEndSec = cutTiming.startSec + cutTiming.durationSec;
    if (!currentSpan) {
      groupSpanByKey.set(groupKey, {
        sceneId,
        groupId,
        startSec: cutTiming.startSec,
        endSec: cutEndSec,
      });
      continue;
    }
    currentSpan.startSec = Math.min(currentSpan.startSec, cutTiming.startSec);
    currentSpan.endSec = Math.max(currentSpan.endSec, cutEndSec);
  }

  const sceneMetadata = input.metadataStore?.sceneMetadata || {};
  for (const [sceneId, sceneTiming] of timings.sceneTimings.entries()) {
    if (sceneTiming.durationSec <= 0) continue;
    const binding = sceneMetadata[sceneId]?.attachAudio;
    if (!binding?.audioAssetId || binding.enabled === false) continue;
    const coreBinding = toCoreAudioBindingFromScene(binding);
    const audioAsset = input.getAssetById(coreBinding.assetId);
    if (!audioAsset?.path || audioAsset.type !== 'audio') continue;
    events.push({
      assetId: audioAsset.id,
      sourcePath: audioAsset.path,
      sourceStartSec: 0,
      sourceOffsetSec: normalizeSeconds(coreBinding.offsetSec, 0),
      timelineStartSec: sceneTiming.startSec,
      durationSec: sceneTiming.durationSec,
      gain: Number.isFinite(coreBinding.gain) ? coreBinding.gain : 1,
      sceneId,
      sourceType: 'scene-attach',
    });
  }

  for (const groupSpan of groupSpanByKey.values()) {
    const groupBinding = input.metadataStore?.sceneMetadata?.[groupSpan.sceneId]?.groupAudioBindings?.[groupSpan.groupId];
    if (!groupBinding?.audioAssetId || groupBinding.enabled === false) continue;
    const coreGroupBinding: AudioBindingCore = {
      assetId: groupBinding.audioAssetId,
      enabled: groupBinding.enabled,
      gain: groupBinding.gain,
      offsetSec: 0,
    };
    const groupAudioAsset = input.getAssetById(coreGroupBinding.assetId);
    if (!groupAudioAsset?.path || groupAudioAsset.type !== 'audio') continue;
    const durationSec = resolveClampedAudioDuration(groupAudioAsset, groupSpan.endSec - groupSpan.startSec);
    if (durationSec <= 0) continue;
    events.push({
      assetId: groupAudioAsset.id,
      sourcePath: groupAudioAsset.path,
      sourceStartSec: 0,
      sourceOffsetSec: normalizeSeconds(coreGroupBinding.offsetSec, 0),
      timelineStartSec: groupSpan.startSec,
      durationSec,
      gain: Number.isFinite(coreGroupBinding.gain) ? coreGroupBinding.gain : 1,
      sceneId: groupSpan.sceneId,
      groupId: groupSpan.groupId,
      sourceType: 'group-attach',
    });
  }

  return {
    totalDurationSec: timings.totalDurationSec,
    events,
  };
}
