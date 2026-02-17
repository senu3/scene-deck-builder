import type { Cut, Scene } from '../types';
import { getScenesInOrder } from './sceneOrder';

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
      if (a.cut.order !== b.cut.order) return a.cut.order - b.cut.order;
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
