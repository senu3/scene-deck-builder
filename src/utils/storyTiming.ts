import type { Scene } from '../types';
import { getScenesAndCutsInTimelineOrder } from './timelineOrder';

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
