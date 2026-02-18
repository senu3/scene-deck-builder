import type {
  Scene,
  Cut,
  Asset,
  FileItem,
  FavoriteFolder,
  CutAudioBinding,
  PlaybackMode,
  PreviewMode,
  SelectionType,
  Project,
  SourceViewMode,
  MetadataStore,
  CutRuntimeState,
} from '../types';
import type { StoreEvent, StoreEventInput } from './events';
import type {
  CutTimelineSliceContract,
  GroupSliceContract,
  MetadataSliceContract,
  ProjectSliceContract,
  SelectionUiSliceContract,
  SourceFolderContract,
} from './contracts';

export interface SourceFolder extends SourceFolderContract {}

export interface ClipboardCut {
  assetId: string;
  asset?: Asset;
  displayTime: number;
  useEmbeddedAudio?: boolean;
  audioBindings?: CutAudioBinding[];
  inPoint?: number;
  outPoint?: number;
  isClip?: boolean;
  isLipSync?: boolean;
  lipSyncFrameCount?: number;
}

export interface AppState extends ProjectSliceContract, CutTimelineSliceContract, SelectionUiSliceContract, MetadataSliceContract, GroupSliceContract {
  projectLoaded: boolean;
  projectPath: string | null;
  vaultPath: string | null;
  trashPath: string | null;
  projectName: string;
  targetTotalDurationSec?: number;

  metadataStore: MetadataStore | null;

  clipboard: ClipboardCut[];

  sourceFolders: SourceFolder[];
  rootFolder: { path: string; name: string; structure: FileItem[] } | null;
  expandedFolders: Set<string>;
  favorites: FavoriteFolder[];
  sourceViewMode: SourceViewMode;

  scenes: Scene[];
  sceneOrder: string[];
  cutRuntimeById: Record<string, CutRuntimeState>;
  selectedSceneId: string | null;
  selectedCutId: string | null;
  selectedCutIds: Set<string>;
  lastSelectedCutId: string | null;
  selectionType: SelectionType;
  selectedGroupId: string | null;

  assetCache: Map<string, Asset>;

  playbackMode: PlaybackMode;
  previewMode: PreviewMode;
  currentPreviewIndex: number;

  globalVolume: number;
  globalMuted: boolean;

  videoPreviewCutId: string | null;
  sequencePreviewCutId: string | null;

  isImportingAsset: string | null;

  assetDrawerOpen: boolean;
  sidebarOpen: boolean;
  detailsPanelOpen: boolean;
  storeEvents: StoreEvent[];

  emitStoreEvent: (event: StoreEventInput) => void;
  drainStoreEvents: () => StoreEvent[];
  applyStoreEvents: () => void;

  getSelectedCut: () => { scene: Scene; cut: Cut } | null;
  getSelectedScene: () => Scene | null;
  getProjectData: () => Project;
  getSelectedCuts: () => Array<{ scene: Scene; cut: Cut }>;
  getSelectedCutIds: () => string[];
}
