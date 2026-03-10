import { v4 as uuidv4 } from 'uuid';
import type { CutImportSource } from '../../utils/cutImport';
import type { CutGroup } from '../../types';
import { importFileToVault } from '../../utils/assetPath';
import {
  cropImageToAspectBridge,
  ensureAssetsFolderBridge,
  extractAudioBridge,
  finalizeClipBridge,
  getFfmpegQueueStatsBridge,
} from '../platform/electronGateway';

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
  operation: 'clip' | 'clip_reverse' | 'crop' | 'audio_extract',
  extension: 'mp4' | 'png' | 'wav',
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
  updateGroupCutOrder: (sceneId: string, groupId: string, cutIds: string[]) => Promise<void> | void;
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
    await updateGroupCutOrder(sceneId, latestGroup.id, nextOrder);
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
  reason?: 'missing-vault' | 'invalid-clip' | 'missing-asset' | 'runtime' | 'queue-busy';
}

interface FinalizeClipDeriveFileParams {
  sourceAssetPath: string;
  sourceAssetName: string;
  inPoint: number;
  outPoint: number;
  reverseOutput: boolean;
  vaultPath: string;
}

interface FinalizeClipDeriveFileResult {
  success: boolean;
  fileName?: string;
  fileSize?: number;
  outputPath?: string;
  clipDuration?: number;
  error?: string;
  reason?: 'runtime' | 'queue-busy';
}

async function isHeavyFfmpegQueueBusy(): Promise<boolean> {
  try {
    const stats = await getFfmpegQueueStatsBridge();
    if (!stats) return false;
    return (stats.heavy.running + stats.heavy.queued) > 0;
  } catch {
    return false;
  }
}

async function finalizeClipToDerivedFile({
  sourceAssetPath,
  sourceAssetName,
  inPoint,
  outPoint,
  reverseOutput,
  vaultPath,
}: FinalizeClipDeriveFileParams): Promise<FinalizeClipDeriveFileResult> {
  if (await isHeavyFfmpegQueueBusy()) {
    return { success: false, reason: 'queue-busy', error: 'FFmpeg queue is busy. Please wait for current operation to finish.' };
  }

  const assetsFolder = await ensureAssetsFolderBridge(vaultPath);
  if (!assetsFolder) {
    return { success: false, reason: 'runtime', error: 'Failed to access assets folder in vault.' };
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

  const result = await finalizeClipBridge({
    sourcePath: sourceAssetPath,
    outputPath,
    inPoint: clipStart,
    outPoint: clipEnd,
    reverse: reverseOutput,
  });

  if (!result.success) {
    return { success: false, reason: 'runtime', error: result.error || 'Failed to finalize clip.' };
  }

  return {
    success: true,
    fileName,
    fileSize: result.fileSize,
    outputPath,
    clipDuration,
  };
}

export interface FinalizeClipAssetOnlyParams {
  sourceAssetPath: string;
  sourceAssetName: string;
  inPoint: number;
  outPoint: number;
  reverseOutput: boolean;
  vaultPath: string;
}

export interface FinalizeClipAssetOnlyResult {
  success: boolean;
  fileName?: string;
  fileSize?: number;
  assetId?: string;
  outputPath?: string;
  error?: string;
  reason?: 'runtime' | 'queue-busy';
}

export async function finalizeClipAndRegisterAsset({
  sourceAssetPath,
  sourceAssetName,
  inPoint,
  outPoint,
  reverseOutput,
  vaultPath,
}: FinalizeClipAssetOnlyParams): Promise<FinalizeClipAssetOnlyResult> {
  const finalized = await finalizeClipToDerivedFile({
    sourceAssetPath,
    sourceAssetName,
    inPoint,
    outPoint,
    reverseOutput,
    vaultPath,
  });

  if (!finalized.success || !finalized.outputPath || !finalized.fileName) {
    return {
      success: false,
      reason: finalized.reason,
      error: finalized.error || 'Failed to finalize clip.',
    };
  }

  const assetId = uuidv4();
  const registered = await importFileToVault(
    finalized.outputPath,
    vaultPath,
    assetId,
    {
      id: assetId,
      name: finalized.fileName,
      path: finalized.outputPath,
      type: 'video',
      fileSize: finalized.fileSize,
      originalPath: finalized.outputPath,
    }
  );
  if (!registered) {
    return {
      success: false,
      reason: 'runtime',
      error: 'Failed to register derived asset.',
    };
  }

  return {
    success: true,
    fileName: finalized.fileName,
    fileSize: finalized.fileSize,
    assetId,
    outputPath: finalized.outputPath,
  };
}

interface FinalizeCutLike {
  isClip?: boolean;
  inPoint?: number;
  outPoint?: number;
}

interface FinalizeAssetLike {
  path?: string;
  name?: string;
}

export interface FinalizeClipFromContextParams extends CreateDerivedCutDeps {
  sceneId: string;
  sourceCutId: string;
  insertIndex: number;
  cut: FinalizeCutLike;
  asset?: FinalizeAssetLike;
  reverseOutput: boolean;
  vaultPath: string | null;
}

export async function finalizeClipFromContext({
  sceneId,
  sourceCutId,
  insertIndex,
  cut,
  asset,
  reverseOutput,
  vaultPath,
  createCutFromImport,
  getCutGroup,
  updateGroupCutOrder,
}: FinalizeClipFromContextParams): Promise<FinalizeClipAddCutResult> {
  if (!vaultPath) {
    return {
      success: false,
      reason: 'missing-vault',
      error: 'Vault path not set. Please set up a vault first.',
    };
  }
  if (!cut.isClip || cut.inPoint === undefined || cut.outPoint === undefined) {
    return {
      success: false,
      reason: 'invalid-clip',
      error: 'Cut is not a finalized clip target.',
    };
  }
  if (!asset?.path || !asset.name) {
    return {
      success: false,
      reason: 'missing-asset',
      error: 'Source asset path is missing.',
    };
  }

  return finalizeClipAndAddCut({
    sceneId,
    sourceCutId,
    insertIndex,
    sourceAssetPath: asset.path,
    sourceAssetName: asset.name,
    inPoint: cut.inPoint,
    outPoint: cut.outPoint,
    reverseOutput,
    vaultPath,
    createCutFromImport,
    getCutGroup,
    updateGroupCutOrder,
  });
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
  const finalized = await finalizeClipToDerivedFile({
    sourceAssetPath,
    sourceAssetName,
    inPoint,
    outPoint,
    reverseOutput,
    vaultPath,
  });
  if (!finalized.success || !finalized.outputPath || !finalized.fileName) {
    return {
      success: false,
      reason: finalized.reason || 'runtime',
      error: finalized.error || 'Failed to finalize clip.',
    };
  }

  await createDerivedCutAndSyncGroup({
    sceneId,
    sourceCutId,
    insertIndex,
    source: {
      assetId: uuidv4(),
      name: finalized.fileName,
      sourcePath: finalized.outputPath,
      type: 'video',
      fileSize: finalized.fileSize,
      preferredDuration: finalized.clipDuration,
    },
    vaultPath,
    createCutFromImport,
    getCutGroup,
    updateGroupCutOrder,
  });

  return {
    success: true,
    fileName: finalized.fileName,
    fileSize: finalized.fileSize,
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

export interface ExtractAudioAssetOnlyParams {
  sourceAssetPath: string;
  sourceAssetName: string;
  vaultPath: string;
  inPoint?: number;
  outPoint?: number;
}

export interface ExtractAudioAssetOnlyResult {
  success: boolean;
  fileName?: string;
  fileSize?: number;
  assetId?: string;
  outputPath?: string;
  error?: string;
  reason?: 'runtime' | 'queue-busy';
}

export async function extractAudioAndRegisterAsset({
  sourceAssetPath,
  sourceAssetName,
  vaultPath,
  inPoint,
  outPoint,
}: ExtractAudioAssetOnlyParams): Promise<ExtractAudioAssetOnlyResult> {
  if (await isHeavyFfmpegQueueBusy()) {
    return { success: false, reason: 'queue-busy', error: 'FFmpeg queue is busy. Please wait for current operation to finish.' };
  }

  const assetsFolder = await ensureAssetsFolderBridge(vaultPath);
  if (!assetsFolder) {
    return { success: false, reason: 'runtime', error: 'Failed to access assets folder in vault.' };
  }

  const hasRange = typeof inPoint === 'number' && typeof outPoint === 'number';
  const start = hasRange ? Math.min(inPoint, outPoint) : undefined;
  const end = hasRange ? Math.max(inPoint, outPoint) : undefined;
  const fileName = buildDerivedFileName(
    sourceAssetPath,
    sourceAssetName,
    'audio_extract',
    'wav'
  );
  const outputPath = `${assetsFolder}/${fileName}`.replace(/\\/g, '/');
  const extractResult = await extractAudioBridge({
    sourcePath: sourceAssetPath,
    outputPath,
    inPoint: start,
    outPoint: end,
    format: 'wav',
  });
  if (!extractResult.success) {
    return {
      success: false,
      reason: 'runtime',
      error: extractResult.error || 'Failed to extract audio.',
    };
  }

  const assetId = uuidv4();
  const registered = await importFileToVault(
    outputPath,
    vaultPath,
    assetId,
    {
      id: assetId,
      name: fileName,
      path: outputPath,
      type: 'audio',
      fileSize: extractResult.fileSize,
      originalPath: outputPath,
    }
  );
  if (!registered) {
    return {
      success: false,
      reason: 'runtime',
      error: 'Failed to register extracted audio asset.',
    };
  }

  return {
    success: true,
    fileName,
    fileSize: extractResult.fileSize,
    assetId,
    outputPath,
  };
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
  const assetsFolder = await ensureAssetsFolderBridge(vaultPath);
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

  const result = await cropImageToAspectBridge({
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
