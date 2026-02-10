import type { Cut, Scene } from '../types';

function safeOrder(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? (value as number) : fallback;
}

export function getScenesAndCutsInTimelineOrder(scenes: Scene[]): Scene[] {
  const orderedScenes = [...scenes]
    .map((scene, sceneIndex) => ({ scene, sceneIndex }))
    .sort((a, b) => {
      const sceneOrderA = safeOrder(a.scene.order, a.sceneIndex);
      const sceneOrderB = safeOrder(b.scene.order, b.sceneIndex);
      if (sceneOrderA !== sceneOrderB) return sceneOrderA - sceneOrderB;
      return a.sceneIndex - b.sceneIndex;
    })
    .map(({ scene }) => ({
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

export function getCutIdsInTimelineOrder(scenes: Scene[], cutIds: string[]): string[] {
  const requestedCutIds = new Set(cutIds);
  const orderedIds: string[] = [];

  const orderedScenes = getScenesAndCutsInTimelineOrder(scenes);
  for (const scene of orderedScenes) {
    for (const cut of scene.cuts) {
      if (requestedCutIds.has(cut.id)) {
        orderedIds.push(cut.id);
      }
    }
  }

  return orderedIds;
}
