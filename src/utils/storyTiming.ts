import type { Asset, Cut, Scene } from '../types';
import { getScenesAndCutsInTimelineOrder } from './timelineOrder';
import { resolveNormalizedCutDisplayTime, type ResolveCutDisplayTimeOptions, type ResolvedCutDisplayTime } from './assetResolve';

declare const canonicalDurationSecBrand: unique symbol;
declare const canonicalTimeSecBrand: unique symbol;

export type CanonicalDurationSec = number & { readonly [canonicalDurationSecBrand]: true };
export type CanonicalTimeSec = number & { readonly [canonicalTimeSecBrand]: true };

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
  durationSec: CanonicalDurationSec;
  adjusted: boolean;
  source: ResolvedCutDisplayTime['source'];
}

export interface CanonicalSceneTiming {
  startSec: CanonicalTimeSec;
  durationSec: CanonicalDurationSec;
}

export interface CanonicalCutTiming {
  startSec: CanonicalTimeSec;
  durationSec: CanonicalDurationSec;
  sceneId: string;
}

export interface CanonicalStoryTimings {
  sceneTimings: Map<string, CanonicalSceneTiming>;
  cutTimings: Map<string, CanonicalCutTiming>;
  totalDurationSec: CanonicalDurationSec;
  normalizedCuts: CanonicalStoryTimingCut[];
  normalizedCutByCutId: ReadonlyMap<string, CanonicalStoryTimingCut>;
  normalizedDurationByCutId: ReadonlyMap<string, CanonicalDurationSec>;
}

function normalizeDurationSec(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value;
}

export function asCanonicalDurationSec(value: number): CanonicalDurationSec {
  return normalizeDurationSec(value) as CanonicalDurationSec;
}

export function asCanonicalTimeSec(value: number): CanonicalTimeSec {
  if (!Number.isFinite(value) || value < 0) return 0 as CanonicalTimeSec;
  return value as CanonicalTimeSec;
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
      durationSec: asCanonicalDurationSec(resolved.durationSec),
      adjusted: resolved.adjusted,
      source: resolved.source,
    };
  });
  const normalizedDurationByCutId = new Map(normalizedCuts.map((entry) => [entry.cutId, entry.durationSec] as const));
  const normalizedCutByCutId = new Map(normalizedCuts.map((entry) => [entry.cutId, entry] as const));

  const timings = computeStoryTimingsForCuts(
    normalizedCuts.map((cut) => ({
      cutId: cut.cutId,
      sceneId: cut.sceneId,
      displayTime: cut.durationSec,
    }))
  );

  return {
    sceneTimings: new Map(
      Array.from(timings.sceneTimings.entries(), ([sceneId, sceneTiming]) => [
        sceneId,
        {
          startSec: asCanonicalTimeSec(sceneTiming.startSec),
          durationSec: asCanonicalDurationSec(sceneTiming.durationSec),
        },
      ])
    ),
    cutTimings: new Map(
      Array.from(timings.cutTimings.entries(), ([cutId, cutTiming]) => [
        cutId,
        {
          startSec: asCanonicalTimeSec(cutTiming.startSec),
          durationSec: asCanonicalDurationSec(cutTiming.durationSec),
          sceneId: cutTiming.sceneId,
        },
      ])
    ),
    totalDurationSec: asCanonicalDurationSec(timings.totalDurationSec),
    normalizedCuts,
    normalizedCutByCutId,
    normalizedDurationByCutId,
  };
}
