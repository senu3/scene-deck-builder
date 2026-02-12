import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type {
  Scene,
  Cut,
  Asset,
  FileItem,
  FavoriteFolder,
  PlaybackMode,
  PreviewMode,
  SceneNote,
  SelectionType,
  Project,
  SourceViewMode,
  SourcePanelState,
  MetadataStore,
  CutGroup,
  LipSyncSettings,
  CutAudioBinding,
  CutRuntimeState,
} from '../types';
import type { CutImportSource } from '../utils/cutImport';
import type { AssetRef } from '../utils/assetRefs';
import type { StoreEvent } from './events';
import { createProjectSlice } from './slices/projectSlice';
import { createCutTimelineSlice } from './slices/cutTimelineSlice';
import { createSelectionUiSlice } from './slices/selectionUiSlice';
import { createMetadataSlice } from './slices/metadataSlice';
import { createGroupSlice } from './slices/groupSlice';

export interface SourceFolder {
  path: string;
  name: string;
  structure: FileItem[];
}

export interface ClipboardCut {
  assetId: string;
  asset: Asset;
  displayTime: number;
  useEmbeddedAudio?: boolean;
  audioBindings?: CutAudioBinding[];
  inPoint?: number;
  outPoint?: number;
  isClip?: boolean;
}

export interface AppState {
  projectLoaded: boolean;
  projectPath: string | null;
  vaultPath: string | null;
  trashPath: string | null;
  projectName: string;

  metadataStore: MetadataStore | null;

  clipboard: ClipboardCut[];

  sourceFolders: SourceFolder[];
  rootFolder: { path: string; name: string; structure: FileItem[] } | null;
  expandedFolders: Set<string>;
  favorites: FavoriteFolder[];
  sourceViewMode: SourceViewMode;

  scenes: Scene[];
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

  setProjectLoaded: (loaded: boolean) => void;
  setProjectPath: (path: string | null) => void;
  setVaultPath: (path: string | null) => void;
  setTrashPath: (path: string | null) => void;
  setProjectName: (name: string) => void;
  initializeProject: (project: Partial<Project>) => void;
  clearProject: () => void;
  loadProject: (scenes: Scene[]) => void;

  setRootFolder: (folder: { path: string; name: string; structure: FileItem[] } | null) => void;
  addSourceFolder: (folder: SourceFolder) => void;
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
  reorderCuts: (sceneId: string, cutId: string, newIndex: number, fromSceneId: string, oldIndex: number) => void;
  moveCutToScene: (fromSceneId: string, toSceneId: string, cutId: string, toIndex: number) => void;
  moveCutsToScene: (cutIds: string[], toSceneId: string, toIndex: number) => void;
  setCutRuntime: (cutId: string, runtime: CutRuntimeState) => void;
  clearCutRuntime: (cutId: string) => void;
  getCutRuntime: (cutId: string) => CutRuntimeState | undefined;

  updateCutClipPoints: (sceneId: string, cutId: string, inPoint: number, outPoint: number) => void;
  clearCutClipPoints: (sceneId: string, cutId: string) => void;
  updateCutAsset: (sceneId: string, cutId: string, assetUpdates: Partial<Asset>) => void;
  updateCutLipSync: (sceneId: string, cutId: string, isLipSync: boolean, frameCount?: number) => void;
  setCutAudioBindings: (sceneId: string, cutId: string, bindings: CutAudioBinding[]) => void;
  setCutUseEmbeddedAudio: (sceneId: string, cutId: string, enabled: boolean) => void;

  selectScene: (sceneId: string | null) => void;
  selectCut: (cutId: string | null) => void;

  toggleCutSelection: (cutId: string) => void;
  selectCutRange: (cutId: string) => void;
  selectMultipleCuts: (cutIds: string[]) => void;
  clearCutSelection: () => void;
  isMultiSelected: (cutId: string) => boolean;

  copySelectedCuts: () => void;
  pasteCuts: (targetSceneId: string, targetIndex?: number) => string[];
  canPaste: () => boolean;

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
  emitStoreEvent: (event: Omit<StoreEvent, 'occurredAt'>) => void;
  drainStoreEvents: () => StoreEvent[];

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

  getSelectedCut: () => { scene: Scene; cut: Cut } | null;
  getSelectedScene: () => Scene | null;
  getProjectData: () => Project;
  getSelectedCuts: () => Array<{ scene: Scene; cut: Cut }>;
  getSelectedCutIds: () => string[];
}

export const useStore = create<AppState>((set, get) => ({
  projectLoaded: false,
  projectPath: null,
  vaultPath: null,
  trashPath: null,
  projectName: 'Untitled Project',
  metadataStore: null,

  clipboard: [],

  sourceFolders: [],
  rootFolder: null,
  expandedFolders: new Set(),
  favorites: [],
  sourceViewMode: 'list',

  scenes: [],
  cutRuntimeById: {},
  selectedSceneId: null,
  selectedCutId: null,
  selectedCutIds: new Set(),
  lastSelectedCutId: null,
  selectionType: null,
  selectedGroupId: null,

  assetCache: new Map(),

  playbackMode: 'stopped',
  previewMode: 'all',
  currentPreviewIndex: 0,

  globalVolume: 1,
  globalMuted: false,

  videoPreviewCutId: null,
  sequencePreviewCutId: null,

  isImportingAsset: null,

  assetDrawerOpen: false,
  sidebarOpen: false,
  detailsPanelOpen: false,
  storeEvents: [],

  ...createProjectSlice(set, get),
  ...createCutTimelineSlice(set, get),
  ...createSelectionUiSlice(set, get),
  ...createMetadataSlice(set, get),
  ...createGroupSlice(set, get),

  emitStoreEvent: (event) =>
    set((state) => ({
      storeEvents: [...state.storeEvents, { ...event, occurredAt: new Date().toISOString() }],
    })),

  drainStoreEvents: () => {
    const events = get().storeEvents;
    if (events.length > 0) {
      set({ storeEvents: [] });
    }
    return events;
  },

  getSelectedCut: () => {
    const state = get();
    if (!state.selectedCutId) return null;

    for (const scene of state.scenes) {
      const cut = scene.cuts.find((c) => c.id === state.selectedCutId);
      if (cut) {
        return { scene, cut };
      }
    }
    return null;
  },

  getSelectedScene: () => {
    const state = get();
    if (!state.selectedSceneId) return null;
    return state.scenes.find((s) => s.id === state.selectedSceneId) || null;
  },

  getProjectData: () => {
    const state = get();
    return {
      id: uuidv4(),
      name: state.projectName,
      vaultPath: state.vaultPath || '',
      scenes: state.scenes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 3,
      sourcePanel: state.getSourcePanelState(),
    };
  },

  getSelectedCuts: () => {
    const state = get();
    const result: Array<{ scene: Scene; cut: Cut }> = [];

    for (const scene of state.scenes) {
      for (const cut of scene.cuts) {
        if (state.selectedCutIds.has(cut.id)) {
          result.push({ scene, cut });
        }
      }
    }
    return result;
  },

  getSelectedCutIds: () => Array.from(get().selectedCutIds),
}));
