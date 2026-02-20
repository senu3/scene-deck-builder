import type { Asset, Cut, MetadataStore } from '../types';
import { resolveCutAsset } from './assetResolve';
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
  cutId?: string;
  sourceType: 'video' | 'cut-attach' | 'scene-attach';
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

export function canonicalizeCutsForExportAudioPlan(
  cuts: Cut[],
  getAssetById: (assetId: string) => Asset | undefined
): CanonicalizedAudioPlanCuts {
  const adjustedCutIds: string[] = [];
  const normalizedCuts: ExportAudioPlanCut[] = cuts.map((cut) => {
    const resolved = resolveCanonicalCutDuration(cut, getAssetById, {
      fallbackDurationSec: 1.0,
      preferAssetDuration: true,
    });
    if (resolved.adjusted || !isCanonicalDurationEqual(cut.displayTime, resolved.durationSec)) {
      adjustedCutIds.push(cut.id);
    }
    return {
      ...cut,
      displayTime: asCanonicalDurationSec(resolved.durationSec),
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
    const resolved = resolveCanonicalCutDuration(cut, input.getAssetById, {
      fallbackDurationSec: 1.0,
      preferAssetDuration: true,
    });
    canonicalDurationByCutId.set(cut.id, resolved.durationSec);
    if (!isCanonicalDurationEqual(cut.displayTime, resolved.durationSec)) {
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
      const audioAsset = input.getAssetById(binding.audioAssetId);
      if (!audioAsset?.path || audioAsset.type !== 'audio') continue;
      events.push({
        assetId: audioAsset.id,
        sourcePath: audioAsset.path,
        sourceStartSec: 0,
        sourceOffsetSec: normalizeSeconds(binding.offsetSec, 0),
        timelineStartSec: cutTiming.startSec,
        durationSec: cutTiming.durationSec,
        gain: Number.isFinite(binding.gain) ? binding.gain : 1,
        sceneId: cutTiming.sceneId,
        cutId: cut.id,
        sourceType: 'cut-attach',
      });
    }
  }

  const sceneMetadata = input.metadataStore?.sceneMetadata || {};
  for (const [sceneId, sceneTiming] of timings.sceneTimings.entries()) {
    if (sceneTiming.durationSec <= 0) continue;
    const binding = sceneMetadata[sceneId]?.attachAudio;
    if (!binding?.audioAssetId || binding.enabled === false) continue;
    const audioAsset = input.getAssetById(binding.audioAssetId);
    if (!audioAsset?.path || audioAsset.type !== 'audio') continue;
    events.push({
      assetId: audioAsset.id,
      sourcePath: audioAsset.path,
      sourceStartSec: 0,
      sourceOffsetSec: 0,
      timelineStartSec: sceneTiming.startSec,
      durationSec: sceneTiming.durationSec,
      gain: Number.isFinite(binding.gain) ? binding.gain : 1,
      sceneId,
      sourceType: 'scene-attach',
    });
  }

  return {
    totalDurationSec: timings.totalDurationSec,
    events,
  };
}
