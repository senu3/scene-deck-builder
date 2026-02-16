import type { Asset, Cut, MetadataStore } from '../types';
import { resolveCutAsset } from './assetResolve';
import { computeStoryTimingsForCuts } from './storyTiming';

export interface ExportAudioEvent {
  sourcePath: string;
  sourceStartSec: number;
  timelineStartSec: number;
  durationSec: number;
  sceneId?: string;
  cutId?: string;
  sourceType: 'video' | 'cut-attach' | 'scene-attach';
}

export interface ExportAudioPlan {
  totalDurationSec: number;
  events: ExportAudioEvent[];
}

interface BuildExportAudioPlanInput {
  cuts: Cut[];
  metadataStore: MetadataStore | null;
  getAssetById: (assetId: string) => Asset | undefined;
  resolveSceneIdByCutId: (cutId: string) => string | undefined;
}

function normalizeSeconds(value: number | undefined, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, value as number);
}

export function buildExportAudioPlan(input: BuildExportAudioPlanInput): ExportAudioPlan {
  const cutTimingInputs = input.cuts.map((cut) => ({
    cutId: cut.id,
    sceneId: input.resolveSceneIdByCutId(cut.id) || `unknown-${cut.id}`,
    displayTime: cut.displayTime,
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
        sourcePath: cutAsset.path,
        sourceStartSec: cut.isClip ? normalizeSeconds(cut.inPoint, 0) : 0,
        timelineStartSec: cutTiming.startSec,
        durationSec: cutTiming.durationSec,
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
        sourcePath: audioAsset.path,
        sourceStartSec: 0,
        timelineStartSec: cutTiming.startSec,
        durationSec: cutTiming.durationSec,
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
      sourcePath: audioAsset.path,
      sourceStartSec: 0,
      timelineStartSec: sceneTiming.startSec,
      durationSec: sceneTiming.durationSec,
      sceneId,
      sourceType: 'scene-attach',
    });
  }

  return {
    totalDurationSec: timings.totalDurationSec,
    events,
  };
}
