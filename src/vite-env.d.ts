/// <reference types="vite/client" />

export {};

interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileItem[];
}

interface FolderSelection {
  path: string;
  name: string;
  structure: FileItem[];
}

interface FileInfo {
  name: string;
  path: string;
  size: number;
  modified: Date;
  type: 'image' | 'video' | 'audio' | null;
  extension: string;
}

interface ImageMetadata {
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
}

interface VaultInfo {
  path: string;
  trashPath: string;
  configPath: string;
}

interface RecentProject {
  name: string;
  path: string;
  date: string;
}

interface TrashOriginRef {
  sceneId?: string;
  cutId?: string;
  note?: string;
}

interface TrashMeta {
  assetId?: string;
  assetIds?: string[];
  originRefs?: TrashOriginRef[];
  reason?: string;
}

interface AssetIndexEntry {
  id: string;
  hash: string;
  filename: string;
  originalName: string;
  originalPath: string;
  usageRefs?: AssetUsageRef[];
  type: 'image' | 'video' | 'audio';
  fileSize: number;
  importedAt: string;
}

interface AssetUsageRef {
  sceneId: string;
  sceneName: string;
  sceneOrder: number;
  cutId: string;
  cutOrder: number;
  cutIndex: number;
}

interface AssetIndex {
  version: number;
  assets: AssetIndexEntry[];
}

interface VaultImportResult {
  success: boolean;
  vaultPath?: string;
  relativePath?: string;
  hash?: string;
  isDuplicate?: boolean;
  error?: string;
}

interface MoveToTrashResult {
  success: boolean;
  trashedPath?: string;
  indexUpdated: boolean;
  reason?: 'trash-move-failed' | 'index-update-failed';
}

interface VaultVerifyResult {
  valid: boolean;
  missing: string[];
  orphaned: string[];
  error?: string;
}

interface VaultGatewayAPI {
  importAndRegisterAsset: (sourcePath: string, vaultPath: string, assetId: string) => Promise<VaultImportResult>;
  registerVaultAsset: (filePath: string, vaultPath: string, assetId: string) => Promise<VaultImportResult>;
  importDataUrlAsset: (dataUrl: string, vaultPath: string, assetId: string) => Promise<VaultImportResult>;
  saveAssetIndex: (vaultPath: string, index: AssetIndex) => Promise<boolean>;
  moveToTrashWithMeta: (filePath: string, trashPath: string, meta: TrashMeta) => Promise<MoveToTrashResult>;
}

interface PathResolveResult {
  absolutePath: string | null;
  exists: boolean;
  error?: string;
}

interface FinalizeClipOptions {
  sourcePath: string;
  outputPath: string;
  inPoint: number;
  outPoint: number;
  reverse?: boolean;
}

interface FinalizeClipResult {
  success: boolean;
  outputPath?: string;
  fileSize?: number;
  error?: string;
}

interface ExtractAudioOptions {
  sourcePath: string;
  outputPath: string;
  inPoint?: number;
  outPoint?: number;
  format?: 'wav';
}

interface ExtractAudioResult {
  success: boolean;
  outputPath?: string;
  fileSize?: number;
  error?: string;
}

interface ExtractFrameOptions {
  sourcePath: string;
  outputPath: string;
  timestamp: number;
}

interface ExtractFrameResult {
  success: boolean;
  outputPath?: string;
  fileSize?: number;
  error?: string;
}

interface CropImageOptions {
  sourcePath: string;
  outputPath: string;
  targetWidth: number;
  targetHeight: number;
  anchorX: number;
  anchorY: number;
}

interface CropImageResult {
  success: boolean;
  outputPath?: string;
  fileSize?: number;
  error?: string;
}

interface PrecomposeLipSyncFramesOptions {
  baseImagePath: string;
  frameImagePaths: string[];
  maskImagePath: string;
}

interface PrecomposeLipSyncFramesResult {
  success: boolean;
  frameDataUrls?: string[];
  error?: string;
}

interface SequenceItem {
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
}

interface ExportAudioEvent {
  assetId?: string;
  sourcePath: string;
  sourceStartSec: number;
  sourceOffsetSec?: number;
  timelineStartSec: number;
  durationSec: number;
  gain?: number;
  sceneId?: string;
  groupId?: string;
  cutId?: string;
  sourceType: 'video' | 'cut-attach' | 'scene-attach' | 'group-attach';
}

interface ExportAudioPlan {
  totalDurationSec: number;
  events: ExportAudioEvent[];
}

interface ExportSequenceOptions {
  items: SequenceItem[];
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  audioPlan?: ExportAudioPlan;
}

interface ExportSequenceResult {
  success: boolean;
  outputPath?: string;
  fileSize?: number;
  audioOutputPath?: string;
  audioFileSize?: number;
  error?: string;
}

interface WriteExportSidecarsOptions {
  outputDir: string;
  manifestJson: string;
  timelineText: string;
}

interface WriteExportSidecarsResult {
  success: boolean;
  manifestPath?: string;
  timelinePath?: string;
  error?: string;
}

interface FfmpegLimits {
  stderrMaxBytes: number;
  maxClipSeconds: number;
  maxTotalSeconds: number;
  maxClipBytes: number;
  maxTotalBytes: number;
}

interface FfmpegQueueStats {
  running: number;
  queued: number;
}

interface FfmpegQueueOverview {
  light: FfmpegQueueStats;
  heavy: FfmpegQueueStats;
}

interface AppVersions {
  electron: string;
  chrome: string;
  node: string;
  v8: string;
}

interface ElectronAPI {
  getVersions?: () => AppVersions;
  getPathForFile?: (file: File) => string;
  startAssetFileDrag?: (payload: { filePath: string; vaultPath: string; iconDataUrl?: string }) => boolean;
  // Folder operations
  selectFolder: () => Promise<FolderSelection | null>;
  getFolderContents: (folderPath: string) => Promise<FileItem[]>;
  getFileInfo: (filePath: string) => Promise<FileInfo | null>;
  readFileAsBase64: (filePath: string) => Promise<string | null>;

  // Audio file (returns raw ArrayBuffer for Web Audio API)
  readAudioFile: (filePath: string) => Promise<ArrayBuffer | Uint8Array | null>;
  readAudioPcm: (filePath: string) => Promise<{ success: boolean; pcm?: Uint8Array; sampleRate?: number; channels?: number; error?: string } | null>;
  getRuntimeLogPath: () => Promise<string>;
  getFfmpegLimits: () => Promise<FfmpegLimits>;
  setFfmpegLimits: (limits: Partial<FfmpegLimits>) => Promise<FfmpegLimits>;
  getFfmpegQueueStats: () => Promise<FfmpegQueueOverview>;

  // Image metadata
  readImageMetadata: (filePath: string) => Promise<ImageMetadata | null>;

  // Video metadata
    getVideoMetadata: (filePath: string) => Promise<{ path: string; fileSize: number; format: string; duration?: number; width?: number; height?: number } | null>;
    generateThumbnail: (
      filePath: string,
      type: 'image' | 'video',
      options?: { timeOffset?: number; profile?: 'timeline-card' | 'asset-grid' | 'sequence-preview' | 'details-panel' }
    ) => Promise<{ success: boolean; thumbnail?: string; error?: string } | null>;

  // Vault operations
  selectVault: () => Promise<string | null>;
  createVault: (vaultPath: string, projectName: string) => Promise<VaultInfo | null>;
  createSceneFolder: (vaultPath: string, sceneName: string) => Promise<string | null>;

  // File operations
  moveToVault: (sourcePath: string, destFolder: string, newName?: string) => Promise<string | null>;
  moveToTrash: (filePath: string, trashPath: string) => Promise<string | null>;
  pathExists: (path: string) => Promise<boolean>;

  // File dialog
  showOpenFileDialog: (options?: { title?: string; filters?: { name: string; extensions: string[] }[]; defaultPath?: string }) => Promise<string | null>;

  // Project operations
  saveProject: (projectData: string, projectPath?: string) => Promise<string | null>;
  loadProject: () => Promise<{ data: unknown; path: string } | null>;
  loadProjectFromPath: (projectPath: string) => Promise<{ data: unknown; path: string } | null>;

  // Recent projects
  getRecentProjects: () => Promise<RecentProject[]>;
  saveRecentProjects: (projects: RecentProject[]) => Promise<boolean>;

  // Scene notes
  saveSceneNotes: (scenePath: string, notes: string) => Promise<boolean>;
  loadSceneNotes: (scenePath: string) => Promise<unknown[]>;

  // Vault asset sync operations
  calculateFileHash: (filePath: string) => Promise<string | null>;
  ensureAssetsFolder: (vaultPath: string) => Promise<string | null>;
  loadAssetIndex: (vaultPath: string) => Promise<AssetIndex>;
  verifyVaultAssets: (vaultPath: string) => Promise<VaultVerifyResult>;
  resolveVaultPath: (vaultPath: string, relativePath: string) => Promise<PathResolveResult>;
  getRelativePath: (vaultPath: string, absolutePath: string) => Promise<string | null>;
  isPathInVault: (vaultPath: string, checkPath: string) => Promise<boolean>;
  vaultGateway: VaultGatewayAPI;

  // Video clip finalization
  showSaveClipDialog: (defaultName: string) => Promise<string | null>;
  finalizeClip: (options: FinalizeClipOptions) => Promise<FinalizeClipResult>;
  extractAudio: (options: ExtractAudioOptions) => Promise<ExtractAudioResult>;

  // Video frame extraction
  extractVideoFrame: (options: ExtractFrameOptions) => Promise<ExtractFrameResult>;
  cropImageToAspect: (options: CropImageOptions) => Promise<CropImageResult>;
  precomposeLipSyncFrames: (options: PrecomposeLipSyncFramesOptions) => Promise<PrecomposeLipSyncFramesResult>;

  // Sequence export
  showSaveSequenceDialog: (defaultName: string) => Promise<string | null>;
  exportSequence: (options: ExportSequenceOptions) => Promise<ExportSequenceResult>;
  writeExportSidecars: (options: WriteExportSidecarsOptions) => Promise<WriteExportSidecarsResult>;

  // App menu events
  onToggleSidebar: (callback: () => void) => () => void;
  onAutosaveFlushRequest: (callback: () => void | Promise<void>) => () => void;
  notifyAutosaveFlushed: () => void;
  setAutosaveEnabled: (enabled: boolean) => Promise<boolean>;
  reportRendererError?: (payload: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
