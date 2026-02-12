import { v4 as uuidv4 } from 'uuid';
import type { CutImportSource } from '../../utils/cutImport';
import type { CutGroup } from '../../types';

function getFileNameFromPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, '');
}

function sanitizeFileStem(raw: string): string {
  const sanitized = raw
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();

  if (!sanitized) return 'asset';
  return sanitized.slice(0, 48);
}

function getStableBaseName(sourceAssetPath: string, sourceAssetName: string): string {
  const fromPath = stripExtension(getFileNameFromPath(sourceAssetPath));
  if (fromPath) return sanitizeFileStem(fromPath);
  return sanitizeFileStem(stripExtension(sourceAssetName));
}

function buildDerivedFileName(
  sourceAssetPath: string,
  sourceAssetName: string,
  operation: 'clip' | 'clip_reverse' | 'crop',
  extension: 'mp4' | 'png',
  extra?: string
): string {
  const baseName = getStableBaseName(sourceAssetPath, sourceAssetName);
  const timestamp = Date.now();
  const unique = uuidv4().slice(0, 8);
  const extraPart = extra ? `_${extra}` : '';
  return `${baseName}_${operation}${extraPart}_${timestamp}_${unique}.${extension}`;
}

interface GroupSyncDeps {
  getCutGroup: (sceneId: string, cutId: string) => CutGroup | undefined;
  updateGroupCutOrder: (sceneId: string, groupId: string, cutIds: string[]) => void;
}

interface CreateDerivedCutDeps extends GroupSyncDeps {
  createCutFromImport: (
    sceneId: string,
    source: CutImportSource,
    insertIndex?: number,
    vaultPathOverride?: string | null
  ) => Promise<string>;
}

export interface CreateDerivedCutParams extends CreateDerivedCutDeps {
  sceneId: string;
  sourceCutId: string;
  insertIndex: number;
  source: CutImportSource;
  vaultPath: string;
}

export async function createDerivedCutAndSyncGroup({
  sceneId,
  sourceCutId,
  insertIndex,
  source,
  vaultPath,
  createCutFromImport,
  getCutGroup,
  updateGroupCutOrder,
}: CreateDerivedCutParams): Promise<string> {
  const newCutId = await createCutFromImport(sceneId, source, insertIndex, vaultPath);
  const latestGroup = getCutGroup(sceneId, sourceCutId);
  if (latestGroup && !latestGroup.cutIds.includes(newCutId)) {
    const insertAt = Math.max(0, latestGroup.cutIds.indexOf(sourceCutId) + 1);
    const nextOrder = [...latestGroup.cutIds];
    nextOrder.splice(insertAt, 0, newCutId);
    updateGroupCutOrder(sceneId, latestGroup.id, nextOrder);
  }
  return newCutId;
}

export interface FinalizeClipAddCutParams extends CreateDerivedCutDeps {
  sceneId: string;
  sourceCutId: string;
  insertIndex: number;
  sourceAssetPath: string;
  sourceAssetName: string;
  inPoint: number;
  outPoint: number;
  reverseOutput: boolean;
  vaultPath: string;
}

export interface FinalizeClipAddCutResult {
  success: boolean;
  cancelled?: boolean;
  fileName?: string;
  fileSize?: number;
  error?: string;
}

export async function finalizeClipAndAddCut({
  sceneId,
  sourceCutId,
  insertIndex,
  sourceAssetPath,
  sourceAssetName,
  inPoint,
  outPoint,
  reverseOutput,
  vaultPath,
  createCutFromImport,
  getCutGroup,
  updateGroupCutOrder,
}: FinalizeClipAddCutParams): Promise<FinalizeClipAddCutResult> {
  if (!window.electronAPI) {
    return { success: false, error: 'electronAPI not available. Please restart the app.' };
  }
  if (typeof window.electronAPI.finalizeClip !== 'function' || typeof window.electronAPI.ensureAssetsFolder !== 'function') {
    return { success: false, error: 'Finalize Clip feature requires app restart after update.' };
  }

  const assetsFolder = await window.electronAPI.ensureAssetsFolder(vaultPath);
  if (!assetsFolder) {
    return { success: false, error: 'Failed to access assets folder in vault.' };
  }

  const clipStart = Math.min(inPoint, outPoint);
  const clipEnd = Math.max(inPoint, outPoint);
  const clipDuration = Math.abs(outPoint - inPoint);
  const fileName = buildDerivedFileName(
    sourceAssetPath,
    sourceAssetName,
    reverseOutput ? 'clip_reverse' : 'clip',
    'mp4'
  );
  const outputPath = `${assetsFolder}/${fileName}`.replace(/\\/g, '/');

  const result = await window.electronAPI.finalizeClip({
    sourcePath: sourceAssetPath,
    outputPath,
    inPoint: clipStart,
    outPoint: clipEnd,
    reverse: reverseOutput,
  });

  if (!result.success) {
    return { success: false, error: result.error || 'Failed to finalize clip.' };
  }

  await createDerivedCutAndSyncGroup({
    sceneId,
    sourceCutId,
    insertIndex,
    source: {
      assetId: uuidv4(),
      name: fileName,
      sourcePath: outputPath,
      type: 'video',
      fileSize: result.fileSize,
      preferredDuration: clipDuration,
    },
    vaultPath,
    createCutFromImport,
    getCutGroup,
    updateGroupCutOrder,
  });

  return {
    success: true,
    fileName,
    fileSize: result.fileSize,
  };
}

export interface CropImageAddCutParams extends CreateDerivedCutDeps {
  sceneId: string;
  sourceCutId: string;
  insertIndex: number;
  sourceAssetPath: string;
  sourceAssetName: string;
  targetWidth: number;
  targetHeight: number;
  anchorX: number;
  anchorY: number;
  preferredThumbnail?: string;
  vaultPath: string;
}

export interface CropImageAddCutResult {
  success: boolean;
  fileName?: string;
  fileSize?: number;
  error?: string;
}

interface SceneLike {
  id: string;
  cuts: Array<{ id: string }>;
}

type RemoveCutFn = (sceneId: string, cutId: string) => void;
type MoveCutsToSceneFn = (cutIds: string[], targetSceneId: string, toIndex: number) => void;

export function removeCutsFromScenes(
  scenes: SceneLike[],
  cutIds: string[],
  removeCut: RemoveCutFn
): number {
  let removedCount = 0;
  for (const cutId of cutIds) {
    for (const scene of scenes) {
      if (scene.cuts.some((cut) => cut.id === cutId)) {
        removeCut(scene.id, cutId);
        removedCount += 1;
        break;
      }
    }
  }
  return removedCount;
}

export function moveCutsToSceneEnd(
  scenes: SceneLike[],
  cutIds: string[],
  targetSceneId: string,
  moveCutsToScene: MoveCutsToSceneFn
): boolean {
  const targetScene = scenes.find((scene) => scene.id === targetSceneId);
  if (!targetScene) return false;
  moveCutsToScene(cutIds, targetSceneId, targetScene.cuts.length);
  return true;
}

export async function cropImageAndAddCut({
  sceneId,
  sourceCutId,
  insertIndex,
  sourceAssetPath,
  sourceAssetName,
  targetWidth,
  targetHeight,
  anchorX,
  anchorY,
  preferredThumbnail,
  vaultPath,
  createCutFromImport,
  getCutGroup,
  updateGroupCutOrder,
}: CropImageAddCutParams): Promise<CropImageAddCutResult> {
  if (!window.electronAPI) {
    return { success: false, error: 'electronAPI not available. Please restart the app.' };
  }
  if (typeof window.electronAPI.cropImageToAspect !== 'function' || typeof window.electronAPI.ensureAssetsFolder !== 'function') {
    return { success: false, error: 'Crop feature requires app restart after update.' };
  }

  const assetsFolder = await window.electronAPI.ensureAssetsFolder(vaultPath);
  if (!assetsFolder) {
    return { success: false, error: 'Failed to access assets folder in vault.' };
  }

  const fileName = buildDerivedFileName(
    sourceAssetPath,
    sourceAssetName,
    'crop',
    'png',
    `${targetWidth}x${targetHeight}`
  );
  const outputPath = `${assetsFolder}/${fileName}`.replace(/\\/g, '/');

  const result = await window.electronAPI.cropImageToAspect({
    sourcePath: sourceAssetPath,
    outputPath,
    targetWidth,
    targetHeight,
    anchorX,
    anchorY,
  });

  if (!result.success) {
    return { success: false, error: result.error || 'Failed to crop image.' };
  }

  await createDerivedCutAndSyncGroup({
    sceneId,
    sourceCutId,
    insertIndex,
    source: {
      assetId: uuidv4(),
      name: fileName,
      sourcePath: outputPath,
      type: 'image',
      fileSize: result.fileSize,
      preferredThumbnail,
    },
    vaultPath,
    createCutFromImport,
    getCutGroup,
    updateGroupCutOrder,
  });

  return {
    success: true,
    fileName,
    fileSize: result.fileSize,
  };
}
