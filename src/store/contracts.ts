import type {
  Asset,
  Cut,
  CutAudioBinding,
  CutGroup,
  CutRuntimeState,
  FileItem,
  FavoriteFolder,
  SceneAudioBinding,
  GroupAudioBinding,
  LipSyncSettings,
  PlaybackMode,
  PreviewMode,
  Project,
  Scene,
  SceneNote,
  SourceViewMode,
  SourcePanelState,
} from '../types';
import type { CutImportSource } from '../utils/cutImport';
import type { AssetRef } from '../utils/assetRefs';
import type { AppEffectWarning } from '../features/platform/effects';
import type {
  StoreEvent,
  StoreEventInput,
  StoreEventOperationContext,
  StoreEventSubscriber,
} from './events';

export interface SourceFolderContract {
  path: string;
  name: string;
  structure: FileItem[];
}

export interface ProjectSliceContract {
  setProjectLoaded: (loaded: boolean) => void;
  setProjectPath: (path: string | null) => void;
  setVaultPath: (path: string | null) => void;
  setTrashPath: (path: string | null) => void;
  setProjectName: (name: string) => void;
  setTargetTotalDurationSec: (seconds: number | undefined) => void;
  initializeProject: (project: Partial<Project>) => void;
  clearProject: () => void;
  loadProject: (scenes: Scene[], sceneOrder?: string[]) => void;

  setRootFolder: (folder: { path: string; name: string; structure: FileItem[] } | null) => void;
  addSourceFolder: (folder: SourceFolderContract) => void;
  removeSourceFolder: (path: string) => void;
  updateSourceFolder: (path: string, structure: FileItem[]) => void;
  refreshAllSourceFolders: () => Promise<void>;
  toggleFolderExpanded: (path: string) => void;
  setExpandedFolders: (paths: string[]) => void;
  addFavorite: (folder: FavoriteFolder) => void;
  removeFavorite: (path: string) => void;
  setSourceViewMode: (mode: SourceViewMode) => void;
  initializeSourcePanel: (state: SourcePanelState | undefined, vaultPath: string | null) => void;
  getSourcePanelState: () => SourcePanelState;
}

export interface CutTimelineSliceContract {
  addScene: (name?: string) => string;
  removeScene: (sceneId: string) => void;
  renameScene: (sceneId: string, name: string) => void;
  reorderScenes: (fromIndex: number, toIndex: number) => void;
  updateSceneFolderPath: (sceneId: string, folderPath: string) => void;

  addSceneNote: (sceneId: string, note: Omit<SceneNote, 'id' | 'createdAt'>) => void;
  updateSceneNote: (sceneId: string, noteId: string, content: string) => void;
  removeSceneNote: (sceneId: string, noteId: string) => void;

  addCutToScene: (sceneId: string, asset: Asset, insertIndex?: number) => string;
  addLoadingCutToScene: (sceneId: string, assetId: string, loadingName: string, insertIndex?: number) => string;
  updateCutWithAsset: (sceneId: string, cutId: string, asset: Asset, displayTime?: number) => void;
  createCutFromImport: (
    sceneId: string,
    source: CutImportSource,
    insertIndex?: number,
    vaultPathOverride?: string | null
  ) => Promise<string>;
  removeCut: (sceneId: string, cutId: string) => Cut | null;
  updateCutDisplayTime: (sceneId: string, cutId: string, time: number) => void;
  updateCutClipPoints: (sceneId: string, cutId: string, inPoint: number, outPoint: number) => void;
  clearCutClipPoints: (sceneId: string, cutId: string) => void;
  updateCutAsset: (sceneId: string, cutId: string, assetUpdates: Partial<Asset>) => void;
  updateCutLipSync: (sceneId: string, cutId: string, isLipSync: boolean, frameCount?: number) => void;
  setCutAudioBindings: (sceneId: string, cutId: string, bindings: CutAudioBinding[]) => void;
  setCutUseEmbeddedAudio: (sceneId: string, cutId: string, enabled: boolean) => void;
  reorderCuts: (sceneId: string, cutId: string, newIndex: number, fromSceneId: string, oldIndex: number) => void;
  moveCutToScene: (fromSceneId: string, toSceneId: string, cutId: string, toIndex: number) => void;
  moveCutsToScene: (cutIds: string[], toSceneId: string, toIndex: number) => void;
  setCutRuntime: (cutId: string, runtime: CutRuntimeState) => void;
  setCutRuntimeHold: (cutId: string, hold: NonNullable<CutRuntimeState['hold']>) => void;
  clearCutRuntimeHold: (cutId: string) => void;
  clearCutRuntime: (cutId: string) => void;
  getCutRuntime: (cutId: string) => CutRuntimeState | undefined;
  copySelectedCuts: () => void;
  pasteCuts: (targetSceneId: string, targetIndex?: number) => string[];
  canPaste: () => boolean;
}

export interface SelectionUiSliceContract {
  selectScene: (sceneId: string | null) => void;
  selectCut: (cutId: string | null) => void;
  toggleCutSelection: (cutId: string) => void;
  selectCutRange: (cutId: string) => void;
  selectMultipleCuts: (cutIds: string[]) => void;
  clearCutSelection: () => void;
  isMultiSelected: (cutId: string) => boolean;
  setPlaybackMode: (mode: PlaybackMode) => void;
  setPreviewMode: (mode: PreviewMode) => void;
  setCurrentPreviewIndex: (index: number) => void;
  setGlobalVolume: (volume: number) => void;
  setGlobalMuted: (muted: boolean) => void;
  toggleGlobalMute: () => void;
  openVideoPreview: (cutId: string) => void;
  closeVideoPreview: () => void;
  openSequencePreview: (cutId: string) => void;
  closeSequencePreview: () => void;
  setImportingAsset: (name: string | null) => void;
  openAssetDrawer: () => void;
  closeAssetDrawer: () => void;
  toggleAssetDrawer: () => void;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
  openDetailsPanel: () => void;
  closeDetailsPanel: () => void;
}

export interface MetadataSliceContract {
  cacheAsset: (asset: Asset) => void;
  getAsset: (assetId: string) => Asset | undefined;
  loadMetadata: (vaultPath: string) => Promise<void>;
  saveMetadata: () => Promise<void>;
  attachAudioToCut: (sceneId: string, cutId: string, audioAsset: Asset, offset?: number) => void;
  analyzeAudioAsset: (audioAsset: Asset, fps?: number) => Promise<void>;
  detachAudioFromCut: (sceneId: string, cutId: string) => void;
  getAttachedAudioForCut: (sceneId: string, cutId: string) => Asset | undefined;
  updateCutAudioOffset: (sceneId: string, cutId: string, offset: number) => void;
  setSceneAudioBinding: (sceneId: string, binding: SceneAudioBinding | null) => void;
  attachAudioToScene: (sceneId: string, audioAsset: Asset) => void;
  detachAudioFromScene: (sceneId: string) => void;
  getSceneAudioBinding: (sceneId: string) => SceneAudioBinding | undefined;
  getAttachedAudioForScene: (sceneId: string) => Asset | undefined;
  setGroupAudioBinding: (sceneId: string, groupId: string, binding: GroupAudioBinding | null) => void;
  attachAudioToGroup: (sceneId: string, groupId: string, audioAsset: Asset) => void;
  detachAudioFromGroup: (sceneId: string, groupId: string) => void;
  getGroupAudioBinding: (sceneId: string, groupId: string) => GroupAudioBinding | undefined;
  getAttachedAudioForGroup: (sceneId: string, groupId: string) => Asset | undefined;
  setLipSyncForAsset: (assetId: string, settings: LipSyncSettings) => void;
  clearLipSyncForAsset: (assetId: string) => void;
  cleanupLipSyncAssetsForDeletedCut: (assetId: string) => Promise<void>;
  removeAssetReferences: (assetIds: string[]) => void;
  deleteAssetWithPolicy: (params: {
    assetPath: string;
    assetIds: string[];
    reason?: string;
  }) => Promise<{ success: boolean; reason?: string; blockingRefs?: AssetRef[]; warnings?: AppEffectWarning[] }>;
  relinkCutAsset: (
    sceneId: string,
    cutId: string,
    newAsset: Asset,
    options?: { eventContext?: StoreEventOperationContext }
  ) => void;
}

export interface StoreEventContract {
  emitStoreEvent: (event: StoreEventInput) => void;
  emitCutRelinked: (input: {
    sceneId: string;
    cutId: string;
    previousAssetId?: string;
    nextAssetId: string;
  }) => void;
  createStoreEventOperation: (
    origin: StoreEventOperationContext['origin'],
    opId?: string
  ) => StoreEventOperationContext;
  runWithStoreEventContext: (
    context: StoreEventOperationContext,
    run: () => void | Promise<void>
  ) => Promise<void>;
  registerStoreEventSubscriber: (subscriber: StoreEventSubscriber) => () => void;
  drainStoreEvents: () => StoreEvent[];
  applyStoreEvents: () => void;
}

export interface GroupSliceContract {
  createGroup: (
    sceneId: string,
    cutIds: string[],
    name?: string,
    options?: Partial<CutGroup> & { id?: string }
  ) => string;
  deleteGroup: (sceneId: string, groupId: string) => CutGroup | null;
  toggleGroupCollapsed: (sceneId: string, groupId: string) => void;
  getCutGroup: (sceneId: string, cutId: string) => CutGroup | undefined;
  selectGroup: (groupId: string | null) => void;
  renameGroup: (sceneId: string, groupId: string, name: string) => void;
  addCutsToGroup: (sceneId: string, groupId: string, cutIds: string[]) => void;
  removeCutsFromGroup: (sceneId: string, groupId: string, cutIds: string[]) => void;
  removeCutFromGroup: (sceneId: string, groupId: string, cutId: string) => void;
  updateGroupCutOrder: (sceneId: string, groupId: string, cutIds: string[]) => void;
  splitGroup: (sceneId: string, groupId: string, pivotCutId: string) => string | null;
  mergeGroups: (sceneId: string, survivorGroupId: string, mergedGroupId: string) => boolean;
  getSelectedGroup: () => { scene: Scene; group: CutGroup } | null;
}
