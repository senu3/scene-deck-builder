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

export interface Asset {
  id: string;
  name: string;
  path: string;
  type: 'image' | 'video' | 'audio';
  thumbnail?: string;
  duration?: number;
  metadata?: ImageMetadata;
  fileSize?: number;
  // Vault sync fields
  vaultRelativePath?: string;  // Relative path within assets/ folder
  originalPath?: string;       // Original source path before import
  hash?: string;               // SHA256 hash for duplicate detection
}

// Asset index entry for vault
export interface AssetIndexEntry {
  id: string;
  hash: string;
  filename: string;           // e.g., "img_abc123.png"
  originalName: string;       // e.g., "my_photo.png"
  originalPath: string;       // Vault-relative original path
  usageRefs?: AssetUsageRef[]; // Scene/cut usage info
  type: 'image' | 'video' | 'audio';
  fileSize: number;
  importedAt: string;
}

export interface AssetUsageRef {
  sceneId: string;
  sceneName: string;
  sceneOrder: number;
  cutId: string;
  cutOrder: number;
  cutIndex: number; // 1-based position in the scene
}

// Asset index stored in assets/.index.json
export interface AssetIndex {
  version: number;
  assets: AssetIndexEntry[];
}

// Result of importing asset to vault
export interface VaultImportResult {
  success: boolean;
  vaultPath?: string;         // Absolute path in vault
  relativePath?: string;      // Relative path from vault root
  hash?: string;
  isDuplicate?: boolean;
  existingAssetId?: string;   // If duplicate, the existing asset ID
  error?: string;
}

export interface Cut {
  id: string;
  assetId: string;
  asset?: Asset;
  displayTime: number;
  order: number;
  framing?: CutFraming;
  useEmbeddedAudio?: boolean;
  audioBindings?: CutAudioBinding[];
  // Video clip fields (for non-destructive trimming)
  inPoint?: number;   // Start time in seconds
  outPoint?: number;  // End time in seconds
  isClip?: boolean;   // True if this cut has custom IN/OUT points
  // Lip sync fields
  isLipSync?: boolean;  // True if this is a lip sync cut
  lipSyncFrameCount?: number; // Number of registered frames (e.g., 4)
}

export interface CutRuntimeState {
  isLoading?: boolean;
  loadingName?: string;
}

export type FramingMode = 'cover' | 'fit';

export type FramingAnchor =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

export interface CutFraming {
  mode?: FramingMode;
  anchor?: FramingAnchor;
}

export type AudioTrackKind =
  | 'voice.lipsync'
  | 'voice.other'
  | 'se'
  | 'embedded';

export interface CutAudioBinding {
  id: string;
  audioAssetId: string;
  sourceName?: string;
  offsetSec: number;
  gain?: number;
  enabled: boolean;
  kind: Exclude<AudioTrackKind, 'embedded'>;
}

export interface SceneAudioBinding {
  id: string;
  audioAssetId: string;
  sourceName?: string;
  gain?: number;
  enabled: boolean;
  kind: 'scene';
}

export interface ClipData {
  sourceAssetId: string;
  inPoint: number;
  outPoint: number;
  duration: number;
}

export interface SceneNote {
  id: string;
  type: 'text' | 'image';
  content: string; // For text: the text content, for image: the path
  createdAt: string;
}

// Cut group for visual grouping on timeline
export interface CutGroup {
  id: string;
  name: string;
  cutIds: string[];      // Ordered list of cut IDs in this group
  isCollapsed: boolean;  // Whether the group is collapsed (stacked view)
}

export interface Scene {
  id: string;
  name: string;
  cuts: Cut[];
  order?: number; // Deprecated: kept only for backward compatibility.
  notes: SceneNote[];
  folderPath?: string; // Path to scene folder in vault
  groups?: CutGroup[]; // Optional cut groups for visual organization
}

// Source panel view mode
export type SourceViewMode = 'list' | 'grid';

// Source folder stored in project
export interface SourceFolderState {
  path: string;
  name: string;
}

// Source panel state stored in project
export interface SourcePanelState {
  folders: SourceFolderState[];
  expandedPaths: string[];
  viewMode: SourceViewMode;
}

export interface Project {
  id: string;
  name: string;
  vaultPath: string;
  scenes: Scene[];
  sceneOrder?: string[];
  targetTotalDurationSec?: number;
  createdAt: string;
  updatedAt: string;
  version?: number;  // 1 = absolute paths, 2 = relative paths with vault sync
  // Source panel state (v3+)
  sourcePanel?: SourcePanelState;
}

export interface FavoriteFolder {
  path: string;
  name: string;
}

export type PlaybackMode = 'stopped' | 'playing' | 'paused';
export type PreviewMode = 'scene' | 'all';
export type SelectionType = 'scene' | 'cut' | null;

// Asset metadata for multi-file attachment (.metadata.json persistence)
export interface AssetMetadata {
  assetId: string;              // Target asset ID
  displayTime?: number;         // Display duration for image assets in seconds
  // Future expansion
  attachedImageIds?: string[];  // Multiple image attachments
  audioAnalysis?: AudioAnalysis; // Precomputed audio analysis data
  lipSync?: LipSyncSettings;     // Lip sync settings (assetId-based)
}

export interface AudioAnalysis {
  fps: number;
  rms: number[];     // Normalized RMS samples (0..1)
  duration: number; // Seconds
  sampleRate: number;
  channels: number;
  hash?: string;
}

export interface LipSyncSettings {
  baseImageAssetId: string;     // Closed frame (base)
  variantAssetIds: string[];    // [half1, half2, open]
  maskAssetId?: string;         // Optional mouth mask
  compositedFrameAssetIds?: string[]; // Optional precomposited [closed, half1, half2, open]
  ownerAssetId?: string;        // Owner asset ID for generated bundle management
  ownedGeneratedAssetIds?: string[]; // Generated assets managed as this owner's bundle
  orphanedGeneratedAssetIds?: string[]; // Old generated assets from previous registrations
  rmsSourceAudioAssetId: string; // Audio asset used for RMS
  thresholds: { t1: number; t2: number; t3: number };
  fps: number;
  sourceVideoAssetId?: string;  // Source video asset for edit preview
  version?: 1 | 2;
}

// Metadata store (file structure)
export interface MetadataStore {
  version: number;
  metadata: { [assetId: string]: AssetMetadata };
  sceneMetadata?: { [sceneId: string]: SceneMetadata };
}

export interface SceneMetadata {
  id: string;
  name: string;
  notes: SceneNote[];
  updatedAt: string;
  attachAudio?: SceneAudioBinding;
}
