import type { Cut, Scene } from '../types';
import { getScenesInOrder } from './sceneOrder';

function safeOrder(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? (value as number) : fallback;
}

export function getScenesAndCutsInTimelineOrder(scenes: Scene[], sceneOrder?: string[]): Scene[] {
  const orderedScenes = getScenesInOrder(scenes, sceneOrder).map((scene) => ({
    ...scene,
    cuts: getCutsInTimelineOrder(scene.cuts),
  }));

  return orderedScenes;
}

export function getCutsInTimelineOrder(cuts: Cut[]): Cut[] {
  return [...cuts]
    .map((cut, cutIndex) => ({ cut, cutIndex }))
    .sort((a, b) => {
      const cutOrderA = safeOrder(a.cut.order, a.cutIndex);
      const cutOrderB = safeOrder(b.cut.order, b.cutIndex);
      if (cutOrderA !== cutOrderB) return cutOrderA - cutOrderB;
      return a.cutIndex - b.cutIndex;
    })
    .map(({ cut }) => cut);
}

export function getCutIdsInTimelineOrder(scenes: Scene[], cutIds: string[], sceneOrder?: string[]): string[] {
  const requestedCutIds = new Set(cutIds);
  const orderedIds: string[] = [];

  const orderedScenes = getScenesAndCutsInTimelineOrder(scenes, sceneOrder);
  for (const scene of orderedScenes) {
    for (const cut of scene.cuts) {
      if (requestedCutIds.has(cut.id)) {
        orderedIds.push(cut.id);
      }
    }
  }

  return orderedIds;
}
