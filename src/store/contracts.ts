import type {
  Asset,
  Cut,
  CutAudioBinding,
  CutGroup,
  CutRuntimeState,
  FileItem,
  FavoriteFolder,
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
  initializeProject: (project: Partial<Project>) => void;
  clearProject: () => void;
  loadProject: (scenes: Scene[]) => void;

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
  setLipSyncForAsset: (assetId: string, settings: LipSyncSettings) => void;
  clearLipSyncForAsset: (assetId: string) => void;
  removeAssetReferences: (assetIds: string[]) => void;
  deleteAssetWithPolicy: (params: {
    assetPath: string;
    assetIds: string[];
    reason?: string;
  }) => Promise<{ success: boolean; reason?: string; blockingRefs?: AssetRef[] }>;
  relinkCutAsset: (sceneId: string, cutId: string, newAsset: Asset) => void;
}

export interface GroupSliceContract {
  createGroup: (sceneId: string, cutIds: string[], name?: string) => string;
  deleteGroup: (sceneId: string, groupId: string) => CutGroup | null;
  toggleGroupCollapsed: (sceneId: string, groupId: string) => void;
  getCutGroup: (sceneId: string, cutId: string) => CutGroup | undefined;
  selectGroup: (groupId: string | null) => void;
  renameGroup: (sceneId: string, groupId: string, name: string) => void;
  addCutsToGroup: (sceneId: string, groupId: string, cutIds: string[]) => void;
  removeCutFromGroup: (sceneId: string, groupId: string, cutId: string) => void;
  updateGroupCutOrder: (sceneId: string, groupId: string, cutIds: string[]) => void;
  getSelectedGroup: () => { scene: Scene; group: CutGroup } | null;
}
