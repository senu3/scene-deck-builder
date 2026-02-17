import type { Asset, Cut, Scene } from '../types';
import { getScenesAndCutsInTimelineOrder } from './timelineOrder';
import { resolveNormalizedCutDisplayTime, type ResolveCutDisplayTimeOptions, type ResolvedCutDisplayTime } from './assetResolve';

export interface SceneTiming {
  startSec: number;
  durationSec: number;
}

export interface CutTiming {
  startSec: number;
  durationSec: number;
  sceneId: string;
}

export interface StoryTimings {
  sceneTimings: Map<string, SceneTiming>;
  cutTimings: Map<string, CutTiming>;
  totalDurationSec: number;
}

export interface StoryTimingCutInput {
  cutId: string;
  sceneId: string;
  displayTime: number;
}

export interface CanonicalStoryTimingCutInput {
  cut: Cut;
  sceneId: string;
}

export interface CanonicalStoryTimingCut {
  cutId: string;
  sceneId: string;
  durationSec: number;
  adjusted: boolean;
  source: ResolvedCutDisplayTime['source'];
}

export interface CanonicalStoryTimings extends StoryTimings {
  normalizedCuts: CanonicalStoryTimingCut[];
}

function normalizeDurationSec(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value;
}

export function computeStoryTimings(scenes: Scene[], sceneOrder?: string[]): StoryTimings {
  const orderedScenes = getScenesAndCutsInTimelineOrder(scenes, sceneOrder);
  const cutInputs: StoryTimingCutInput[] = [];

  for (const scene of orderedScenes) {
    for (const cut of scene.cuts) {
      cutInputs.push({
        cutId: cut.id,
        sceneId: scene.id,
        displayTime: cut.displayTime,
      });
    }
  }

  return computeStoryTimingsForCuts(cutInputs);
}

export function computeStoryTimingsForCuts(cuts: StoryTimingCutInput[]): StoryTimings {
  const sceneTimings = new Map<string, SceneTiming>();
  const cutTimings = new Map<string, CutTiming>();
  let totalDurationSec = 0;

  for (const cut of cuts) {
    const durationSec = normalizeDurationSec(cut.displayTime);
    const cutStartSec = totalDurationSec;

    cutTimings.set(cut.cutId, {
      startSec: cutStartSec,
      durationSec,
      sceneId: cut.sceneId,
    });

    const existingScene = sceneTimings.get(cut.sceneId);
    if (!existingScene) {
      sceneTimings.set(cut.sceneId, {
        startSec: cutStartSec,
        durationSec,
      });
    } else {
      sceneTimings.set(cut.sceneId, {
        startSec: existingScene.startSec,
        durationSec: existingScene.durationSec + durationSec,
      });
    }

    totalDurationSec += durationSec;
  }

  return {
    sceneTimings,
    cutTimings,
    totalDurationSec,
  };
}

export function resolveCanonicalCutDuration(
  cut: Cut | null | undefined,
  getAsset: (assetId: string) => Asset | undefined,
  options: ResolveCutDisplayTimeOptions = {}
): ResolvedCutDisplayTime {
  return resolveNormalizedCutDisplayTime(cut, getAsset, options);
}

export function computeCanonicalStoryTimingsForCuts(
  cuts: CanonicalStoryTimingCutInput[],
  getAsset: (assetId: string) => Asset | undefined,
  options: ResolveCutDisplayTimeOptions = {}
): CanonicalStoryTimings {
  const normalizedCuts = cuts.map(({ cut, sceneId }) => {
    const resolved = resolveCanonicalCutDuration(cut, getAsset, options);
    return {
      cutId: cut.id,
      sceneId,
      durationSec: resolved.durationSec,
      adjusted: resolved.adjusted,
      source: resolved.source,
    };
  });

  const timings = computeStoryTimingsForCuts(
    normalizedCuts.map((cut) => ({
      cutId: cut.cutId,
      sceneId: cut.sceneId,
      displayTime: cut.durationSec,
    }))
  );

  return {
    ...timings,
    normalizedCuts,
  };
}
