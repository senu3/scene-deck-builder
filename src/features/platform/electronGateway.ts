import type { AssetIndex, FileItem } from '../../types';

type BridgeElectronAPI = NonNullable<Window['electronAPI']>;

type AudioPcmResult = {
  success: boolean;
  pcm?: Uint8Array;
  sampleRate?: number;
  channels?: number;
  error?: string;
};

type PathResolveResult = {
  absolutePath: string | null;
  exists: boolean;
  error?: string;
};

export type StartAssetDragOutResultLike = {
  ok: boolean;
  reason?:
    | 'asset-id-missing'
    | 'vault-path-missing'
    | 'index-missing'
    | 'index-invalid'
    | 'asset-not-found'
    | 'asset-filename-missing'
    | 'file-missing'
    | 'not-file'
    | 'outside-assets';
};

type RecentProjectLike = {
  name: string;
  path: string;
  date: string;
};

export type ProjectFileLoadErrorCode =
  | 'project-file-not-found'
  | 'invalid-json'
  | 'read-failed';

export type ProjectFileLoadResult =
  | { kind: 'success'; data: unknown; path: string }
  | { kind: 'canceled' }
  | { kind: 'error'; code: ProjectFileLoadErrorCode; path: string };

type VaultImportResult = {
  success: boolean;
  vaultPath?: string;
  relativePath?: string;
  hash?: string;
  isDuplicate?: boolean;
  error?: string;
};

type MoveToTrashResultLike = {
  success: boolean;
  trashedPath?: string;
  indexUpdated: boolean;
  reason?: 'trash-move-failed' | 'index-update-failed';
};

type OpenFileDialogOptions = {
  title?: string;
  filters?: { name: string; extensions: string[] }[];
  defaultPath?: string;
};

type ExportSequenceBridgeResult = {
  success: boolean;
  outputPath?: string;
  fileSize?: number;
  audioOutputPath?: string;
  audioFileSize?: number;
  error?: string;
};

type WriteExportSidecarsOptionsLike = {
  outputDir: string;
  manifestJson: string;
  timelineText: string;
};

type WriteExportSidecarsResultLike = {
  success: boolean;
  manifestPath?: string;
  timelinePath?: string;
  error?: string;
};

type FfmpegQueueStatsLike = {
  running: number;
  queued: number;
};

type FfmpegQueueOverviewLike = {
  light: FfmpegQueueStatsLike;
  heavy: FfmpegQueueStatsLike;
};

type FfmpegLimitsLike = {
  stderrMaxBytes: number;
  maxClipSeconds: number;
  maxTotalSeconds: number;
  maxClipBytes: number;
  maxTotalBytes: number;
};

type FinalizeClipOptionsLike = {
  sourcePath: string;
  outputPath: string;
  inPoint: number;
  outPoint: number;
  reverse?: boolean;
};

type FinalizeClipResultLike = {
  success: boolean;
  outputPath?: string;
  fileSize?: number;
  error?: string;
};

type ExtractAudioOptionsLike = {
  sourcePath: string;
  outputPath: string;
  inPoint?: number;
  outPoint?: number;
  format?: 'wav';
};

type ExtractAudioResultLike = {
  success: boolean;
  outputPath?: string;
  fileSize?: number;
  error?: string;
};

type ExtractFrameOptionsLike = {
  sourcePath: string;
  outputPath: string;
  timestamp: number;
};

type ExtractFrameResultLike = {
  success: boolean;
  outputPath?: string;
  fileSize?: number;
  error?: string;
};

type CropImageOptionsLike = {
  sourcePath: string;
  outputPath: string;
  targetWidth: number;
  targetHeight: number;
  anchorX: number;
  anchorY: number;
};

type CropImageResultLike = {
  success: boolean;
  outputPath?: string;
  fileSize?: number;
  error?: string;
};

type PrecomposeLipSyncFramesOptionsLike = {
  baseImagePath: string;
  frameImagePaths: string[];
  maskImagePath: string;
};

type PrecomposeLipSyncFramesResultLike = {
  success: boolean;
  frameDataUrls?: string[];
  error?: string;
};

type FileInfoLike = {
  name: string;
  path: string;
  size: number;
  modified: Date;
  type: 'image' | 'video' | 'audio' | null;
  extension: string;
};

type SequenceItemLike = {
  type: 'image' | 'video' | 'audio';
  path: string;
  duration: number;
  inPoint?: number;
  outPoint?: number;
  holdDurationSec?: number;
  framingMode?: 'cover' | 'fit';
  framingAnchor?:
    | 'top-left'
    | 'top'
    | 'top-right'
    | 'left'
    | 'center'
    | 'right'
    | 'bottom-left'
    | 'bottom'
    | 'bottom-right';
  lipSync?: {
    framePaths: string[];
    rms: number[];
    rmsFps: number;
    thresholds: { t1: number; t2: number; t3: number };
    audioOffsetSec: number;
  };
  flags?: {
    isClip?: boolean;
    isMuted?: boolean;
    isHold?: boolean;
  };
};

type ExportAudioEventLike = {
  assetId?: string;
  sourcePath: string;
  sourceStartSec: number;
  sourceOffsetSec?: number;
  timelineStartSec: number;
  durationSec: number;
  gain?: number;
  sceneId?: string;
  cutId?: string;
  sourceType: 'video' | 'cut-attach' | 'scene-attach' | 'group-attach';
};

type ExportAudioPlanLike = {
  totalDurationSec: number;
  events: ExportAudioEventLike[];
};

type ExportSequenceOptionsLike = {
  items: SequenceItemLike[];
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  audioPlan?: ExportAudioPlanLike;
};

type VaultInfoLike = {
  path: string;
  name?: string;
};

type VideoMetadataLike = {
  duration?: number;
  width?: number;
  height?: number;
};

type ImageMetadataLike = {
  width?: number;
  height?: number;
  format?: string;
  prompt?: string;
  negativePrompt?: string;
  model?: string;
  seed?: number;
  steps?: number;
  sampler?: string;
  cfg?: number;
  software?: string;
  fileSize?: number;
};

type AppVersionsLike = {
  electron: string;
  chrome: string;
  node: string;
  v8: string;
};

type TrashMetaLike = {
  assetId?: string;
  assetIds?: string[];
  reason?: string;
  originRefs?: Array<{
    sceneId?: string;
    cutId?: string;
    note?: string;
  }>;
};

function getElectronAPI(): BridgeElectronAPI | null {
  if (typeof window === 'undefined' || !window.electronAPI) return null;
  return window.electronAPI;
}

let assetIndexMutationQueue: Promise<void> = Promise.resolve();

export function hasElectronBridge(): boolean {
  return !!getElectronAPI();
}

export function getPathForFileBridge(file: File): string | undefined {
  return getElectronAPI()?.getPathForFile?.(file);
}

export function startAssetDragOutBridge(payload: {
  assetId: string;
  vaultPath: string;
  iconDataUrl?: string;
}): StartAssetDragOutResultLike {
  return getElectronAPI()?.startAssetDragOut?.(payload) ?? { ok: false, reason: 'vault-path-missing' };
}

export async function readAudioPcmBridge(filePath: string): Promise<AudioPcmResult | null> {
  return getElectronAPI()?.readAudioPcm?.(filePath) ?? null;
}

export async function getFfmpegQueueStatsBridge(): Promise<FfmpegQueueOverviewLike | null> {
  return getElectronAPI()?.getFfmpegQueueStats?.() ?? null;
}

export async function getFfmpegLimitsBridge(): Promise<FfmpegLimitsLike | null> {
  return getElectronAPI()?.getFfmpegLimits?.() ?? null;
}

export async function setFfmpegLimitsBridge(
  limits: Partial<FfmpegLimitsLike>
): Promise<FfmpegLimitsLike | null> {
  return getElectronAPI()?.setFfmpegLimits?.(limits) ?? null;
}

export async function resolveVaultPathBridge(vaultPath: string, relativePath: string): Promise<PathResolveResult> {
  const result = await getElectronAPI()?.resolveVaultPath?.(vaultPath, relativePath);
  if (!result) return { absolutePath: null, exists: false };
  return result;
}

export async function isPathInVaultBridge(vaultPath: string, checkPath: string): Promise<boolean> {
  return (await getElectronAPI()?.isPathInVault?.(vaultPath, checkPath)) ?? false;
}

export async function pathExistsBridge(checkPath: string): Promise<boolean> {
  return (await getElectronAPI()?.pathExists?.(checkPath)) ?? false;
}

export async function getFolderContentsBridge(folderPath: string): Promise<FileItem[] | null> {
  return (await getElectronAPI()?.getFolderContents?.(folderPath)) ?? null;
}

export async function selectFolderBridge(): Promise<{
  path: string;
  name: string;
  structure: FileItem[];
} | null> {
  return getElectronAPI()?.selectFolder?.() ?? null;
}

export async function selectVaultBridge(): Promise<string | null> {
  return getElectronAPI()?.selectVault?.() ?? null;
}

export async function createVaultBridge(vaultPath: string, projectName: string): Promise<VaultInfoLike | null> {
  return getElectronAPI()?.createVault?.(vaultPath, projectName) ?? null;
}

export async function loadProjectFromPathBridge(projectPath: string): Promise<ProjectFileLoadResult> {
  return getElectronAPI()?.loadProjectFromPath?.(projectPath) ?? { kind: 'canceled' };
}

export async function loadProjectBridge(): Promise<ProjectFileLoadResult> {
  return getElectronAPI()?.loadProject?.() ?? { kind: 'canceled' };
}

export async function saveProjectBridge(projectData: string, projectPath?: string): Promise<string | null> {
  return getElectronAPI()?.saveProject?.(projectData, projectPath) ?? null;
}

export async function getRecentProjectsBridge(): Promise<RecentProjectLike[]> {
  return (await getElectronAPI()?.getRecentProjects?.()) ?? [];
}

export async function saveRecentProjectsBridge(projects: RecentProjectLike[]): Promise<boolean> {
  return (await getElectronAPI()?.saveRecentProjects?.(projects as any)) ?? false;
}

export async function getRelativePathBridge(vaultPath: string, absolutePath: string): Promise<string | null> {
  return getElectronAPI()?.getRelativePath?.(vaultPath, absolutePath) ?? null;
}

export async function calculateFileHashBridge(filePath: string): Promise<string | null> {
  return getElectronAPI()?.calculateFileHash?.(filePath) ?? null;
}

export async function getFileInfoBridge(filePath: string): Promise<FileInfoLike | null> {
  return getElectronAPI()?.getFileInfo?.(filePath) ?? null;
}

export async function showOpenFileDialogBridge(
  options?: OpenFileDialogOptions
): Promise<string | null> {
  return getElectronAPI()?.showOpenFileDialog?.(options) ?? null;
}

export async function readFileAsBase64Bridge(filePath: string): Promise<string | null> {
  return getElectronAPI()?.readFileAsBase64?.(filePath) ?? null;
}

export async function generateThumbnailBridge(
  filePath: string,
  type: string,
  options: { timeOffset?: number; profile: string }
): Promise<{ success: boolean; thumbnail?: string; error?: string } | null> {
  return getElectronAPI()?.generateThumbnail?.(filePath, type as any, options as any) ?? null;
}

export async function loadAssetIndexBridge(vaultPath: string): Promise<AssetIndex | null> {
  return getElectronAPI()?.loadAssetIndex?.(vaultPath) ?? null;
}

export async function ensureAssetsFolderBridge(vaultPath: string): Promise<string | null> {
  return getElectronAPI()?.ensureAssetsFolder?.(vaultPath) ?? null;
}

export async function finalizeClipBridge(
  options: FinalizeClipOptionsLike
): Promise<FinalizeClipResultLike> {
  return (await getElectronAPI()?.finalizeClip?.(options)) ?? {
    success: false,
    error: 'electron-unavailable',
  };
}

export async function extractAudioBridge(
  options: ExtractAudioOptionsLike
): Promise<ExtractAudioResultLike> {
  return (await getElectronAPI()?.extractAudio?.(options)) ?? {
    success: false,
    error: 'electron-unavailable',
  };
}

export async function extractVideoFrameBridge(
  options: ExtractFrameOptionsLike
): Promise<ExtractFrameResultLike> {
  return (await getElectronAPI()?.extractVideoFrame?.(options)) ?? {
    success: false,
    error: 'electron-unavailable',
  };
}

export async function cropImageToAspectBridge(
  options: CropImageOptionsLike
): Promise<CropImageResultLike> {
  return (await getElectronAPI()?.cropImageToAspect?.(options)) ?? {
    success: false,
    error: 'electron-unavailable',
  };
}

export async function precomposeLipSyncFramesBridge(
  options: PrecomposeLipSyncFramesOptionsLike
): Promise<PrecomposeLipSyncFramesResultLike> {
  return (await getElectronAPI()?.precomposeLipSyncFrames?.(options)) ?? {
    success: false,
    error: 'electron-unavailable',
  };
}

export async function withSerializedAssetIndexMutationBridge<T>(run: () => Promise<T>): Promise<T> {
  const previous = assetIndexMutationQueue;
  let release!: () => void;
  assetIndexMutationQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await run();
  } finally {
    release();
  }
}

export async function getVideoMetadataBridge(filePath: string): Promise<VideoMetadataLike | null> {
  return getElectronAPI()?.getVideoMetadata?.(filePath) ?? null;
}

export async function readImageMetadataBridge(filePath: string): Promise<ImageMetadataLike | null> {
  return getElectronAPI()?.readImageMetadata?.(filePath) ?? null;
}

export function hasVaultGatewayBridge(): boolean {
  return !!getElectronAPI()?.vaultGateway;
}

export async function saveAssetIndexBridge(vaultPath: string, index: AssetIndex): Promise<boolean> {
  return (await getElectronAPI()?.vaultGateway?.saveAssetIndex?.(vaultPath, index as any)) ?? false;
}

export async function moveToTrashWithMetaBridge(
  filePath: string,
  trashPath: string,
  meta: TrashMetaLike
): Promise<MoveToTrashResultLike | null> {
  return (await getElectronAPI()?.vaultGateway?.moveToTrashWithMeta?.(filePath, trashPath, meta as any)) ?? null;
}

export async function importAndRegisterAssetBridge(
  sourcePath: string,
  vaultPath: string,
  assetId: string
): Promise<VaultImportResult | null> {
  return getElectronAPI()?.vaultGateway?.importAndRegisterAsset?.(sourcePath, vaultPath, assetId) ?? null;
}

export async function registerVaultAssetBridge(
  filePath: string,
  vaultPath: string,
  assetId: string
): Promise<VaultImportResult | null> {
  return getElectronAPI()?.vaultGateway?.registerVaultAsset?.(filePath, vaultPath, assetId) ?? null;
}

export async function importDataUrlAssetBridge(
  dataUrl: string,
  vaultPath: string,
  assetId: string
): Promise<VaultImportResult | null> {
  return getElectronAPI()?.vaultGateway?.importDataUrlAsset?.(dataUrl, vaultPath, assetId) ?? null;
}

export async function showSaveSequenceDialogBridge(defaultName: string): Promise<string | null> {
  return getElectronAPI()?.showSaveSequenceDialog?.(defaultName) ?? null;
}

export async function exportSequenceBridge(
  options: ExportSequenceOptionsLike
): Promise<ExportSequenceBridgeResult> {
  return (await getElectronAPI()?.exportSequence?.(options)) ?? {
    success: false,
    error: 'electron-unavailable',
  };
}

export async function writeExportSidecarsBridge(
  options: WriteExportSidecarsOptionsLike
): Promise<WriteExportSidecarsResultLike> {
  return (await getElectronAPI()?.writeExportSidecars?.(options as any)) ?? {
    success: false,
    error: 'electron-unavailable',
  };
}

export function getVersionsBridge(): AppVersionsLike | null {
  return getElectronAPI()?.getVersions?.() ?? null;
}

export async function setAutosaveEnabledBridge(enabled: boolean): Promise<boolean> {
  return (await getElectronAPI()?.setAutosaveEnabled?.(enabled)) ?? false;
}

export function onAutosaveFlushRequestBridge(callback: () => void | Promise<void>): (() => void) | null {
  return getElectronAPI()?.onAutosaveFlushRequest?.(callback) ?? null;
}

export function onToggleSidebarBridge(callback: () => void): (() => void) | null {
  return getElectronAPI()?.onToggleSidebar?.(callback) ?? null;
}

export function notifyAutosaveFlushedBridge(): void {
  getElectronAPI()?.notifyAutosaveFlushed?.();
}
