import { v4 as uuidv4 } from 'uuid';
import type { Asset, AssetUsageRef, Scene, SourcePanelState } from '../types';
import { getScenesAndCutsInTimelineOrder } from './timelineOrder';
import { normalizeSceneOrder } from './sceneOrder';
import { resolveCutAssetFromAssetId, resolveCutAssetId } from './assetResolve';

export interface ProjectSavePayload {
  version: number;
  name: string;
  vaultPath: string | null;
  scenes: Scene[];
  sceneOrder: string[];
  targetTotalDurationSec?: number;
  sourcePanel: SourcePanelState | undefined;
  savedAt: string;
}

export function buildProjectSavePayload(input: {
  version: number;
  name: string;
  vaultPath: string | null;
  scenes: Scene[];
  sceneOrder?: string[];
  targetTotalDurationSec?: number;
  sourcePanel: SourcePanelState | undefined;
  savedAt: string;
}): ProjectSavePayload {
  const sceneOrder = normalizeSceneOrder(input.sceneOrder, input.scenes);
  const payload: ProjectSavePayload = {
    version: input.version,
    name: input.name,
    vaultPath: input.vaultPath,
    scenes: input.scenes,
    sceneOrder,
    sourcePanel: input.sourcePanel,
    savedAt: input.savedAt,
  };

  if (Number.isFinite(input.targetTotalDurationSec) && (input.targetTotalDurationSec as number) > 0) {
    payload.targetTotalDurationSec = Math.floor(input.targetTotalDurationSec as number);
  }

  return payload;
}

export function serializeProjectSavePayload(payload: ProjectSavePayload): string {
  return JSON.stringify(payload);
}

// Convert assets to use relative paths for saving
export function prepareAssetForSave(asset: Asset): Asset {
  if (asset.vaultRelativePath) {
    return {
      ...asset,
      // Store relative path as the main path for portability
      path: asset.vaultRelativePath,
    };
  }
  return asset;
}

function prepareCutAssetSnapshot(asset: Asset): Asset {
  const snapshot: Asset = {
    id: asset.id,
    name: asset.name || asset.id,
    path: '',
    type: asset.type,
  };
  if (typeof asset.duration === 'number' && Number.isFinite(asset.duration) && asset.duration > 0) {
    snapshot.duration = asset.duration;
  }
  if (asset.thumbnail) {
    snapshot.thumbnail = asset.thumbnail;
  }
  if (asset.vaultRelativePath) {
    snapshot.vaultRelativePath = asset.vaultRelativePath;
  }
  return snapshot;
}

// Prepare scenes for saving (convert to relative paths)
export function prepareScenesForSave(
  scenes: Scene[],
  getAssetById: (assetId: string) => Asset | undefined
): Scene[] {
  return scenes.map((scene) => ({
    ...scene,
    cuts: scene.cuts.map((cut) => ({
      ...cut,
      asset: (() => {
        const resolved = resolveCutAssetFromAssetId(cut, getAssetById);
        return resolved ? prepareCutAssetSnapshot(prepareAssetForSave(resolved)) : undefined;
      })(),
    })),
  }));
}

export function getOrderedAssetIdsFromScenes(scenes: Scene[], sceneOrder?: string[]): string[] {
  const orderedIds: string[] = [];
  const seen = new Set<string>();

  for (const scene of getScenesAndCutsInTimelineOrder(scenes, sceneOrder)) {
    for (const cut of scene.cuts) {
      const assetId = resolveCutAssetId(cut, () => undefined);
      if (assetId && !seen.has(assetId)) {
        seen.add(assetId);
        orderedIds.push(assetId);
      }
    }
  }

  return orderedIds;
}

export function buildAssetUsageRefs(scenes: Scene[], sceneOrder?: string[]): Map<string, AssetUsageRef[]> {
  const usageMap = new Map<string, AssetUsageRef[]>();
  const orderedScenes = getScenesAndCutsInTimelineOrder(scenes, sceneOrder);

  for (let sceneIndex = 0; sceneIndex < orderedScenes.length; sceneIndex++) {
    const scene = orderedScenes[sceneIndex];
    scene.cuts.forEach((cut, index) => {
      const assetId = resolveCutAssetId(cut, () => undefined);
      if (!assetId) return;
      const ref: AssetUsageRef = {
        sceneId: scene.id,
        sceneName: scene.name,
        sceneOrder: sceneIndex,
        cutId: cut.id,
        cutOrder: cut.order ?? index,
        cutIndex: index + 1,
      };
      const existing = usageMap.get(assetId) || [];
      existing.push(ref);
      usageMap.set(assetId, existing);
    });
  }

  return usageMap;
}

export function ensureSceneIds(scenes: Scene[]): { scenes: Scene[]; missingCount: number } {
  let missingCount = 0;
  const updatedScenes = scenes.map((scene) => {
    if (typeof scene.id === 'string' && scene.id.trim().length > 0) return scene;
    missingCount += 1;
    return { ...scene, id: uuidv4() };
  });

  return { scenes: updatedScenes, missingCount };
}

export function ensureSceneOrder(
  sceneOrder: string[] | undefined,
  scenes: Scene[]
): { sceneOrder: string[]; changed: boolean } {
  const normalized = normalizeSceneOrder(sceneOrder, scenes);
  const changed =
    !sceneOrder ||
    sceneOrder.length !== normalized.length ||
    sceneOrder.some((id, index) => id !== normalized[index]);
  return { sceneOrder: normalized, changed };
}
