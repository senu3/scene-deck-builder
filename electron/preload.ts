import { contextBridge, ipcRenderer } from 'electron';
const IPC_TOGGLE_SIDEBAR = 'toggle-sidebar';
const IPC_AUTOSAVE_FLUSH_REQUEST = 'autosave-flush-request';
const IPC_AUTOSAVE_FLUSH_COMPLETE = 'autosave-flush-complete';
const IPC_AUTOSAVE_ENABLED = 'autosave-enabled';

export interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileItem[];
}

export interface FolderSelection {
  path: string;
  name: string;
  structure: FileItem[];
}

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  modified: Date;
  type: 'image' | 'video' | 'audio' | null;
  extension: string;
}

export interface ImageMetadata {
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

export interface VaultInfo {
  path: string;
  trashPath: string;
  configPath: string;
}

export interface AssetIndexEntry {
  id: string;
  hash: string;
  filename: string;
  originalName: string;
  originalPath: string;
  usageRefs?: Array<{
    sceneId: string;
    sceneName: string;
    sceneOrder: number;
    cutId: string;
    cutOrder: number;
    cutIndex: number;
  }>;
  type: 'image' | 'video' | 'audio';
  fileSize: number;
  importedAt: string;
}

export interface AssetIndex {
  version: number;
  assets: AssetIndexEntry[];
}

export interface VaultImportResult {
  success: boolean;
  vaultPath?: string;
  relativePath?: string;
  hash?: string;
  isDuplicate?: boolean;
  error?: string;
}

export interface VaultVerifyResult {
  valid: boolean;
  missing: string[];
  orphaned: string[];
  error?: string;
}

export interface VaultGatewayAPI {
  importAndRegisterAsset: (sourcePath: string, vaultPath: string, assetId: string) => Promise<VaultImportResult>;
  saveAssetIndex: (vaultPath: string, index: AssetIndex) => Promise<boolean>;
  moveToTrashWithMeta: (filePath: string, trashPath: string, meta: TrashMeta) => Promise<string | null>;
}

export interface PathResolveResult {
  absolutePath: string | null;
  exists: boolean;
  error?: string;
}

export interface FinalizeClipOptions {
  sourcePath: string;
  outputPath: string;
  inPoint: number;
  outPoint: number;
  reverse?: boolean;
}

export interface FinalizeClipResult {
  success: boolean;
  outputPath?: string;
  fileSize?: number;
  error?: string;
}

export interface ExtractAudioOptions {
  sourcePath: string;
  outputPath: string;
  inPoint?: number;
  outPoint?: number;
  format?: 'wav';
}

export interface ExtractAudioResult {
  success: boolean;
  outputPath?: string;
  fileSize?: number;
  error?: string;
}

export interface AnalyzeVideoHistogramOptions {
  sourcePath: string;
  startSec?: number;
  endSec?: number;
  sampleFps?: number;
  width?: number;
  height?: number;
}

export interface AnalyzeVideoHistogramResult {
  success: boolean;
  sampleFps?: number;
  width?: number;
  height?: number;
  scores?: number[];
  error?: string;
}

export interface ExtractFrameOptions {
  sourcePath: string;
  outputPath: string;
  timestamp: number;
}

export interface ExtractFrameResult {
  success: boolean;
  outputPath?: string;
  fileSize?: number;
  error?: string;
}

export interface CropImageOptions {
  sourcePath: string;
  outputPath: string;
  targetWidth: number;
  targetHeight: number;
  anchorX: number; // 0..1
  anchorY: number; // 0..1
}

export interface CropImageResult {
  success: boolean;
  outputPath?: string;
  fileSize?: number;
  error?: string;
}

export interface PrecomposeLipSyncFramesOptions {
  baseImagePath: string;
  frameImagePaths: string[];
  maskImagePath: string;
}

export interface PrecomposeLipSyncFramesResult {
  success: boolean;
  frameDataUrls?: string[];
  error?: string;
}

export interface SequenceItem {
  type: 'image' | 'video' | 'audio';
  path: string;
  duration: number;
  inPoint?: number;
  outPoint?: number;
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
}

export interface ExportSequenceOptions {
  items: SequenceItem[];
  outputPath: string;
  width: number;
  height: number;
  fps: number;
}

export interface ExportSequenceResult {
  success: boolean;
  outputPath?: string;
  fileSize?: number;
  error?: string;
}

export interface WriteExportSidecarsOptions {
  outputDir: string;
  manifestJson: string;
  timelineText: string;
}

export interface WriteExportSidecarsResult {
  success: boolean;
  manifestPath?: string;
  timelinePath?: string;
  error?: string;
}

export interface FfmpegLimits {
  stderrMaxBytes: number;
  maxClipSeconds: number;
  maxTotalSeconds: number;
  maxClipBytes: number;
  maxTotalBytes: number;
}

export interface FfmpegQueueStats {
  running: number;
  queued: number;
}

export interface FfmpegQueueOverview {
  light: FfmpegQueueStats;
  heavy: FfmpegQueueStats;
}

export interface RecentProject {
  name: string;
  path: string;
  date: string;
}

export interface TrashOriginRef {
  sceneId?: string;
  cutId?: string;
  note?: string;
}

export interface TrashMeta {
  assetId?: string;
  originRefs?: TrashOriginRef[];
  reason?: string;
}

export interface OpenFileDialogOptions {
  title?: string;
  filters?: { name: string; extensions: string[] }[];
  defaultPath?: string;
}

const electronAPI = {
  getVersions: () => ({
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    v8: process.versions.v8,
  }),
  // Folder operations
  selectFolder: (): Promise<FolderSelection | null> =>
    ipcRenderer.invoke('select-folder'),

  getFolderContents: (folderPath: string): Promise<FileItem[]> =>
    ipcRenderer.invoke('get-folder-contents', folderPath),

  getFileInfo: (filePath: string): Promise<FileInfo | null> =>
    ipcRenderer.invoke('get-file-info', filePath),

  readFileAsBase64: (filePath: string): Promise<string | null> =>
    ipcRenderer.invoke('read-file-as-base64', filePath),

  // Read audio file as ArrayBuffer (for Web Audio API - more stable)
  readAudioFile: (filePath: string): Promise<ArrayBuffer | Uint8Array | null> =>
    ipcRenderer.invoke('read-audio-file', filePath),

  readAudioPcm: (filePath: string): Promise<{ success: boolean; pcm?: Uint8Array; sampleRate?: number; channels?: number; error?: string } | null> =>
    ipcRenderer.invoke('read-audio-pcm', filePath),

  getFfmpegLimits: (): Promise<FfmpegLimits> =>
    ipcRenderer.invoke('get-ffmpeg-limits'),

  setFfmpegLimits: (limits: Partial<FfmpegLimits>): Promise<FfmpegLimits> =>
    ipcRenderer.invoke('set-ffmpeg-limits', limits),

  getFfmpegQueueStats: (): Promise<FfmpegQueueOverview> =>
    ipcRenderer.invoke('get-ffmpeg-queue-stats'),

  // Image metadata
  readImageMetadata: (filePath: string): Promise<ImageMetadata | null> =>
    ipcRenderer.invoke('read-image-metadata', filePath),

  // Video metadata
  getVideoMetadata: (filePath: string): Promise<{ path: string; fileSize: number; format: string; duration?: number; width?: number; height?: number } | null> =>
    ipcRenderer.invoke('get-video-metadata', filePath),

  generateThumbnail: (
    filePath: string,
    type: 'image' | 'video',
    options?: { timeOffset?: number; profile?: 'timeline-card' | 'asset-grid' | 'sequence-preview' | 'details-panel' }
  ): Promise<{ success: boolean; thumbnail?: string; error?: string } | null> =>
    ipcRenderer.invoke('generate-thumbnail', {
      filePath,
      type,
      timeOffset: options?.timeOffset,
      profile: options?.profile,
    }),

  generateVideoThumbnail: (filePath: string, timeOffset?: number): Promise<{ success: boolean; thumbnail?: string; error?: string } | null> =>
    ipcRenderer.invoke('generate-video-thumbnail', { filePath, timeOffset }),

  // Vault operations
  selectVault: (): Promise<string | null> =>
    ipcRenderer.invoke('select-vault'),

  createVault: (vaultPath: string, projectName: string): Promise<VaultInfo | null> =>
    ipcRenderer.invoke('create-vault', vaultPath, projectName),

  createSceneFolder: (vaultPath: string, sceneName: string): Promise<string | null> =>
    ipcRenderer.invoke('create-scene-folder', vaultPath, sceneName),

  // File operations
  moveToVault: (sourcePath: string, destFolder: string, newName?: string): Promise<string | null> =>
    ipcRenderer.invoke('move-to-vault', sourcePath, destFolder, newName),

  moveToTrash: (filePath: string, trashPath: string): Promise<string | null> =>
    ipcRenderer.invoke('move-to-trash', filePath, trashPath),

  moveToTrashWithMeta: (filePath: string, trashPath: string, meta: TrashMeta): Promise<string | null> =>
    ipcRenderer.invoke('move-to-trash-with-meta', filePath, trashPath, meta),

  pathExists: (path: string): Promise<boolean> =>
    ipcRenderer.invoke('path-exists', path),

  // File dialog
  showOpenFileDialog: (options?: OpenFileDialogOptions): Promise<string | null> =>
    ipcRenderer.invoke('show-open-file-dialog', options || {}),

  // Project operations
  saveProject: (projectData: string, projectPath?: string): Promise<string | null> =>
    ipcRenderer.invoke('save-project', projectData, projectPath),

  loadProject: (): Promise<{ data: unknown; path: string } | null> =>
    ipcRenderer.invoke('load-project'),

  loadProjectFromPath: (projectPath: string): Promise<{ data: unknown; path: string } | null> =>
    ipcRenderer.invoke('load-project-from-path', projectPath),

  // Recent projects
  getRecentProjects: (): Promise<RecentProject[]> =>
    ipcRenderer.invoke('get-recent-projects'),

  saveRecentProjects: (projects: RecentProject[]): Promise<boolean> =>
    ipcRenderer.invoke('save-recent-projects', projects),

  // Scene notes
  saveSceneNotes: (scenePath: string, notes: string): Promise<boolean> =>
    ipcRenderer.invoke('save-scene-notes', scenePath, notes),

  loadSceneNotes: (scenePath: string): Promise<unknown[]> =>
    ipcRenderer.invoke('load-scene-notes', scenePath),

  // Vault asset sync operations
  calculateFileHash: (filePath: string): Promise<string | null> =>
    ipcRenderer.invoke('calculate-file-hash', filePath),

  ensureAssetsFolder: (vaultPath: string): Promise<string | null> =>
    ipcRenderer.invoke('ensure-assets-folder', vaultPath),

  loadAssetIndex: (vaultPath: string): Promise<AssetIndex> =>
    ipcRenderer.invoke('load-asset-index', vaultPath),

  saveAssetIndex: (vaultPath: string, index: AssetIndex): Promise<boolean> =>
    ipcRenderer.invoke('save-asset-index', vaultPath, index),

  importAssetToVault: (sourcePath: string, vaultPath: string, assetId: string): Promise<VaultImportResult> =>
    ipcRenderer.invoke('import-asset-to-vault', sourcePath, vaultPath, assetId),

  verifyVaultAssets: (vaultPath: string): Promise<VaultVerifyResult> =>
    ipcRenderer.invoke('verify-vault-assets', vaultPath),

  resolveVaultPath: (vaultPath: string, relativePath: string): Promise<PathResolveResult> =>
    ipcRenderer.invoke('resolve-vault-path', vaultPath, relativePath),

  getRelativePath: (vaultPath: string, absolutePath: string): Promise<string | null> =>
    ipcRenderer.invoke('get-relative-path', vaultPath, absolutePath),

  isPathInVault: (vaultPath: string, checkPath: string): Promise<boolean> =>
    ipcRenderer.invoke('is-path-in-vault', vaultPath, checkPath),

  // Vault gateway (single write entry)
  vaultGateway: {
    importAndRegisterAsset: (sourcePath: string, vaultPath: string, assetId: string): Promise<VaultImportResult> =>
      ipcRenderer.invoke('vault-gateway-import-asset', sourcePath, vaultPath, assetId),
    importDataUrlAsset: (dataUrl: string, vaultPath: string, assetId: string): Promise<VaultImportResult> =>
      ipcRenderer.invoke('vault-gateway-import-data-url', dataUrl, vaultPath, assetId),
    saveAssetIndex: (vaultPath: string, index: AssetIndex): Promise<boolean> =>
      ipcRenderer.invoke('vault-gateway-save-asset-index', vaultPath, index),
    moveToTrashWithMeta: (filePath: string, trashPath: string, meta: TrashMeta): Promise<string | null> =>
      ipcRenderer.invoke('vault-gateway-move-to-trash', filePath, trashPath, meta),
  },

  // Video clip finalization
  showSaveClipDialog: (defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke('show-save-clip-dialog', defaultName),

  finalizeClip: (options: FinalizeClipOptions): Promise<FinalizeClipResult> =>
    ipcRenderer.invoke('finalize-clip', options),

  extractAudio: (options: ExtractAudioOptions): Promise<ExtractAudioResult> =>
    ipcRenderer.invoke('extract-audio', options),

  // Video frame extraction
  extractVideoFrame: (options: ExtractFrameOptions): Promise<ExtractFrameResult> =>
    ipcRenderer.invoke('extract-video-frame', options),

  analyzeVideoHistogram: (options: AnalyzeVideoHistogramOptions): Promise<AnalyzeVideoHistogramResult> =>
    ipcRenderer.invoke('analyze-video-histogram', options),

  // Image crop finalization
  cropImageToAspect: (options: CropImageOptions): Promise<CropImageResult> =>
    ipcRenderer.invoke('crop-image-to-aspect', options),

  // LipSync precompose (ffmpeg)
  precomposeLipSyncFrames: (options: PrecomposeLipSyncFramesOptions): Promise<PrecomposeLipSyncFramesResult> =>
    ipcRenderer.invoke('precompose-lipsync-frames', options),

  // Sequence export
  showSaveSequenceDialog: (defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke('show-save-sequence-dialog', defaultName),

  exportSequence: (options: ExportSequenceOptions): Promise<ExportSequenceResult> =>
    ipcRenderer.invoke('export-sequence', options),

  writeExportSidecars: (options: WriteExportSidecarsOptions): Promise<WriteExportSidecarsResult> =>
    ipcRenderer.invoke('write-export-sidecars', options),

  // App menu events
  onToggleSidebar: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on(IPC_TOGGLE_SIDEBAR, handler);
    return () => ipcRenderer.removeListener(IPC_TOGGLE_SIDEBAR, handler);
  },
  onAutosaveFlushRequest: (callback: () => void | Promise<void>): (() => void) => {
    const handler = () => {
      void callback();
    };
    ipcRenderer.on(IPC_AUTOSAVE_FLUSH_REQUEST, handler);
    return () => ipcRenderer.removeListener(IPC_AUTOSAVE_FLUSH_REQUEST, handler);
  },
  notifyAutosaveFlushed: (): void => {
    ipcRenderer.send(IPC_AUTOSAVE_FLUSH_COMPLETE);
  },
  setAutosaveEnabled: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke(IPC_AUTOSAVE_ENABLED, enabled),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}
