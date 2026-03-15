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
  CutRuntimeHold,
  CutRuntimeState,
} from '../types';
import type { StoreEvent } from './events';
import type {
  CutTimelineSliceContract,
  GroupSliceContract,
  MetadataSliceContract,
  ProjectSliceContract,
  SelectionUiSliceContract,
  StoreEventContract,
  SourceFolderContract,
} from './contracts';
import type { PersistedProjectSnapshot } from '../features/project/persistedSnapshot';

export interface SourceFolder extends SourceFolderContract {}

export interface ClipboardCut {
  assetId: string;
  asset?: Asset;
  displayTime: number;
  hold?: CutRuntimeHold;
  useEmbeddedAudio?: boolean;
  audioBindings?: CutAudioBinding[];
  inPoint?: number;
  outPoint?: number;
  isClip?: boolean;
  isLipSync?: boolean;
  lipSyncFrameCount?: number;
}

export interface AppState
  extends ProjectSliceContract,
    CutTimelineSliceContract,
    SelectionUiSliceContract,
    MetadataSliceContract,
    GroupSliceContract,
    StoreEventContract {
  projectLoaded: boolean;
  projectPath: string | null;
  vaultPath: string | null;
  trashPath: string | null;
  projectName: string;
  lastPersistedSnapshot: PersistedProjectSnapshot | null;
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

  getSelectedCut: () => { scene: Scene; cut: Cut } | null;
  getSelectedScene: () => Scene | null;
  getProjectData: () => Project;
  getSelectedCuts: () => Array<{ scene: Scene; cut: Cut }>;
  getSelectedCutIds: () => string[];
}
