import type { Scene } from '../types';

export function normalizeSceneOrder(sceneOrder: string[] | undefined, scenes: Scene[]): string[] {
  const sceneIds = new Set(scenes.map((scene) => scene.id));
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const id of sceneOrder || []) {
    if (!sceneIds.has(id) || seen.has(id)) continue;
    normalized.push(id);
    seen.add(id);
  }

  for (const scene of scenes) {
    if (seen.has(scene.id)) continue;
    normalized.push(scene.id);
    seen.add(scene.id);
  }

  return normalized;
}

export function getScenesInOrder(scenes: Scene[], sceneOrder: string[] | undefined): Scene[] {
  const normalized = normalizeSceneOrder(sceneOrder, scenes);
  const byId = new Map(scenes.map((scene) => [scene.id, scene] as const));
  return normalized
    .map((id) => byId.get(id))
    .filter((scene): scene is Scene => !!scene);
}

export function getFirstSceneId(scenes: Scene[], sceneOrder: string[] | undefined): string | undefined {
  return getScenesInOrder(scenes, sceneOrder)[0]?.id;
}
