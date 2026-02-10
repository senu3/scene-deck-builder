import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Scene, Cut, Asset, FileItem, FavoriteFolder, PlaybackMode, PreviewMode, SceneNote, SelectionType, Project, SourceViewMode, SourcePanelState, MetadataStore, CutGroup, LipSyncSettings, CutAudioBinding } from '../types';
import { loadMetadataStore, saveMetadataStore, updateAudioAnalysis, updateLipSyncSettings, removeLipSyncSettings, upsertSceneMetadata, removeSceneMetadata, syncSceneMetadata, removeAssetReferences as removeAssetReferencesInStore } from '../utils/metadataStore';
import { analyzeAudioRms } from '../utils/audioUtils';
import { clearThumbnailCache } from '../utils/thumbnailCache';
import type { CutImportSource } from '../utils/cutImport';
import { buildAssetForCut } from '../utils/cutImport';
import { collectAssetRefs, getBlockingRefsForAssetIds, type AssetRef } from '../utils/assetRefs';
import { getScenesAndCutsInTimelineOrder } from '../utils/timelineOrder';

export interface SourceFolder {
  path: string;
  name: string;
  structure: FileItem[];
}

// Clipboard data structure for copy/paste
interface ClipboardCut {
  assetId: string;
  asset: Asset;
  displayTime: number;
  useEmbeddedAudio?: boolean;
  audioBindings?: CutAudioBinding[];
  // Video clip fields
  inPoint?: number;
  outPoint?: number;
  isClip?: boolean;
}

interface AppState {
  // Project state
  projectLoaded: boolean;
  projectPath: string | null;
  vaultPath: string | null;
  trashPath: string | null;
  projectName: string;

  // Metadata store for asset attachments
  metadataStore: MetadataStore | null;

  // Clipboard state
  clipboard: ClipboardCut[];

  // Folder browser state - now supports multiple source folders
  sourceFolders: SourceFolder[];
  rootFolder: { path: string; name: string; structure: FileItem[] } | null; // Legacy, kept for compatibility
  expandedFolders: Set<string>;
  favorites: FavoriteFolder[];
  sourceViewMode: SourceViewMode;

  // Timeline state
  scenes: Scene[];
  selectedSceneId: string | null;
  selectedCutId: string | null;
  selectedCutIds: Set<string>;  // Multi-select support
  lastSelectedCutId: string | null;  // For Shift+click range selection
  selectionType: SelectionType;
  selectedGroupId: string | null;  // Currently selected group

  // Asset cache
  assetCache: Map<string, Asset>;

  // Playback state
  playbackMode: PlaybackMode;
  previewMode: PreviewMode;
  currentPreviewIndex: number;

  // Global volume state (shared between modals)
  globalVolume: number;
  globalMuted: boolean;

  // Video preview modal state
  videoPreviewCutId: string | null;
  sequencePreviewCutId: string | null;

  // Asset importing state (for progress indicator)
  isImportingAsset: string | null;  // Name of asset being imported, null if not importing

  // Asset drawer state
  assetDrawerOpen: boolean;
  // Sidebar state
  sidebarOpen: boolean;
  // Details panel state
  detailsPanelOpen: boolean;

  // Actions - Project
  setProjectLoaded: (loaded: boolean) => void;
  setProjectPath: (path: string | null) => void;
  setVaultPath: (path: string | null) => void;
  setTrashPath: (path: string | null) => void;
  setProjectName: (name: string) => void;
  initializeProject: (project: Partial<Project>) => void;
  clearProject: () => void;
  loadProject: (scenes: Scene[]) => void;

  // Actions - Folder browser
  setRootFolder: (folder: { path: string; name: string; structure: FileItem[] } | null) => void;
  addSourceFolder: (folder: SourceFolder) => void;
  removeSourceFolder: (path: string) => void;
  updateSourceFolder: (path: string, structure: FileItem[]) => void;
  refreshAllSourceFolders: () => Promise<void>;  // Refresh all source folders
  toggleFolderExpanded: (path: string) => void;
  setExpandedFolders: (paths: string[]) => void;
  addFavorite: (folder: FavoriteFolder) => void;
  removeFavorite: (path: string) => void;
  setSourceViewMode: (mode: SourceViewMode) => void;
  initializeSourcePanel: (state: SourcePanelState | undefined, vaultPath: string | null) => void;
  getSourcePanelState: () => SourcePanelState;

  // Actions - Timeline
  addScene: (name?: string) => string;
  removeScene: (sceneId: string) => void;
  renameScene: (sceneId: string, name: string) => void;
  reorderScenes: (fromIndex: number, toIndex: number) => void;
  updateSceneFolderPath: (sceneId: string, folderPath: string) => void;

  // Actions - Scene Notes
  addSceneNote: (sceneId: string, note: Omit<SceneNote, 'id' | 'createdAt'>) => void;
  updateSceneNote: (sceneId: string, noteId: string, content: string) => void;
  removeSceneNote: (sceneId: string, noteId: string) => void;

  // Actions - Cuts
  addCutToScene: (sceneId: string, asset: Asset, insertIndex?: number) => string; // Returns cutId
  addLoadingCutToScene: (sceneId: string, assetId: string, loadingName: string, insertIndex?: number) => string; // Returns cutId for loading cut
  updateCutWithAsset: (sceneId: string, cutId: string, asset: Asset, displayTime?: number) => void; // Update loading cut with actual asset
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
  moveCutsToScene: (cutIds: string[], toSceneId: string, toIndex: number) => void;  // Multi-move

  // Actions - Video Clips
  updateCutClipPoints: (sceneId: string, cutId: string, inPoint: number, outPoint: number) => void;
  clearCutClipPoints: (sceneId: string, cutId: string) => void;
  updateCutAsset: (sceneId: string, cutId: string, assetUpdates: Partial<Asset>) => void;
  updateCutLipSync: (sceneId: string, cutId: string, isLipSync: boolean, frameCount?: number) => void;
  setCutAudioBindings: (sceneId: string, cutId: string, bindings: CutAudioBinding[]) => void;
  setCutUseEmbeddedAudio: (sceneId: string, cutId: string, enabled: boolean) => void;

  // Actions - Selection
  selectScene: (sceneId: string | null) => void;
  selectCut: (cutId: string | null) => void;

  // Multi-select actions
  toggleCutSelection: (cutId: string) => void;  // Ctrl/Cmd + click
  selectCutRange: (cutId: string) => void;  // Shift + click
  selectMultipleCuts: (cutIds: string[]) => void;  // Select specific cuts
  clearCutSelection: () => void;
  isMultiSelected: (cutId: string) => boolean;

  // Clipboard actions
  copySelectedCuts: () => void;
  pasteCuts: (targetSceneId: string, targetIndex?: number) => string[];  // Returns new cut IDs
  canPaste: () => boolean;

  // Actions - Playback
  setPlaybackMode: (mode: PlaybackMode) => void;
  setPreviewMode: (mode: PreviewMode) => void;
  setCurrentPreviewIndex: (index: number) => void;

  // Actions - Global volume
  setGlobalVolume: (volume: number) => void;
  setGlobalMuted: (muted: boolean) => void;
  toggleGlobalMute: () => void;

  // Actions - Video preview modal
  openVideoPreview: (cutId: string) => void;
  closeVideoPreview: () => void;
  openSequencePreview: (cutId: string) => void;
  closeSequencePreview: () => void;

  // Actions - Asset importing
  setImportingAsset: (name: string | null) => void;

  // Actions - Asset drawer
  openAssetDrawer: () => void;
  closeAssetDrawer: () => void;
  toggleAssetDrawer: () => void;
  // Actions - Sidebar
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
  // Actions - Details panel
  openDetailsPanel: () => void;
  closeDetailsPanel: () => void;

  // Actions - Asset cache
  cacheAsset: (asset: Asset) => void;
  getAsset: (assetId: string) => Asset | undefined;

  // Actions - Metadata
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

  // Group actions
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

  // Helpers
  getSelectedCut: () => { scene: Scene; cut: Cut } | null;
  getSelectedScene: () => Scene | null;
  getProjectData: () => Project;
  getSelectedCuts: () => Array<{ scene: Scene; cut: Cut }>;
  getSelectedCutIds: () => string[];
}

function normalizeScenesUseEmbeddedAudio(scenes: Scene[]): Scene[] {
  return scenes.map((scene) => ({
    ...scene,
    cuts: scene.cuts.map((cut) => ({
      ...cut,
      useEmbeddedAudio: cut.useEmbeddedAudio ?? true,
    })),
  }));
}

export const useStore = create<AppState>((set, get) => ({
  // Initial state
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
  sourceViewMode: 'list' as SourceViewMode,
  scenes: [],
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

  // Project actions
  setProjectLoaded: (loaded) => set({ projectLoaded: loaded }),
  setProjectPath: (path) => set({ projectPath: path }),
  setVaultPath: (path) => set({ vaultPath: path }),
  setTrashPath: (path) => set({ trashPath: path }),
  setProjectName: (name) => set({ projectName: name }),

  initializeProject: (project) => {
    clearThumbnailCache();
    const defaultScenes: Scene[] = [
      { id: uuidv4(), name: 'Scene 1', cuts: [], order: 0, notes: [] },
      { id: uuidv4(), name: 'Scene 2', cuts: [], order: 1, notes: [] },
      { id: uuidv4(), name: 'Scene 3', cuts: [], order: 2, notes: [] },
    ];

    set({
      projectLoaded: true,
      projectPath: project.vaultPath ? `${project.vaultPath}/project.sdp` : null,
      vaultPath: project.vaultPath || null,
      trashPath: project.vaultPath ? `${project.vaultPath}/.trash` : null,
      projectName: project.name || 'Untitled Project',
      scenes: normalizeScenesUseEmbeddedAudio(project.scenes || defaultScenes),
      selectedSceneId: null,
      selectedCutId: null,
      selectedCutIds: new Set(),
      lastSelectedCutId: null,
      selectionType: null,
      detailsPanelOpen: false,
    });
  },

  clearProject: () => {
    clearThumbnailCache();
    return set({
      projectLoaded: false,
      projectPath: null,
      vaultPath: null,
      trashPath: null,
    projectName: 'Untitled Project',
    metadataStore: null,
    scenes: [],
    selectedSceneId: null,
    selectedCutId: null,
    selectedCutIds: new Set(),
    lastSelectedCutId: null,
    selectionType: null,
    rootFolder: null,
    sourceFolders: [],
    assetCache: new Map(),
    selectedGroupId: null,
    detailsPanelOpen: false,
    });
  },

  loadProject: (scenes) => set({ scenes: normalizeScenesUseEmbeddedAudio(scenes) }),

  // Folder browser actions
  setRootFolder: (folder) => set((state) => {
    // Also add to sourceFolders if not already present
    if (folder && !state.sourceFolders.some(f => f.path === folder.path)) {
      return {
        rootFolder: folder,
        sourceFolders: [...state.sourceFolders, folder]
      };
    }
    return { rootFolder: folder };
  }),

  addSourceFolder: (folder) => set((state) => {
    // Don't add if already exists
    if (state.sourceFolders.some(f => f.path === folder.path)) {
      return state;
    }
    return { sourceFolders: [...state.sourceFolders, folder] };
  }),

  removeSourceFolder: (path) => set((state) => ({
    sourceFolders: state.sourceFolders.filter(f => f.path !== path),
    // Also clear rootFolder if it matches
    rootFolder: state.rootFolder?.path === path ? null : state.rootFolder,
  })),

  updateSourceFolder: (path, structure) => set((state) => ({
    sourceFolders: state.sourceFolders.map(f =>
      f.path === path ? { ...f, structure } : f
    ),
  })),

  refreshAllSourceFolders: async () => {
    const state = get();
    if (!window.electronAPI) return;

    for (const folder of state.sourceFolders) {
      try {
        const structure = await window.electronAPI.getFolderContents(folder.path);
        set((state) => ({
          sourceFolders: state.sourceFolders.map(f =>
            f.path === folder.path ? { ...f, structure } : f
          ),
        }));
      } catch (error) {
        console.error('Failed to refresh folder:', folder.path, error);
      }
    }
  },

  toggleFolderExpanded: (path) => set((state) => {
    const newExpanded = new Set(state.expandedFolders);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    return { expandedFolders: newExpanded };
  }),

  setExpandedFolders: (paths) => set({ expandedFolders: new Set(paths) }),

  addFavorite: (folder) => set((state) => ({
    favorites: [...state.favorites, folder],
  })),

  removeFavorite: (path) => set((state) => ({
    favorites: state.favorites.filter((f) => f.path !== path),
  })),

  setSourceViewMode: (mode) => set({ sourceViewMode: mode }),

  initializeSourcePanel: async (state, vaultPath) => {
    // Build path for vault assets folder to exclude
    const vaultAssetsPath = vaultPath ? `${vaultPath}/assets`.replace(/\\/g, '/') : null;

    if (state) {
      // Restore from project state, excluding vault/assets (now handled by AssetDrawer)
      const folders: SourceFolder[] = [];
      for (const folderState of state.folders) {
        // Skip vault/assets folder - it's now handled by AssetDrawer
        const normalizedPath = folderState.path.replace(/\\/g, '/');
        if (vaultAssetsPath && normalizedPath === vaultAssetsPath) {
          continue;
        }

        // Load folder contents
        if (window.electronAPI) {
          try {
            const structure = await window.electronAPI.getFolderContents(folderState.path);
            folders.push({
              path: folderState.path,
              name: folderState.name,
              structure,
            });
          } catch {
            // Folder may not exist anymore, skip
          }
        }
      }
      set({
        sourceFolders: folders,
        expandedFolders: new Set(state.expandedPaths),
        sourceViewMode: state.viewMode || 'list',
      });
    } else if (vaultPath) {
      // Default: no source folders - vault/assets is handled by AssetDrawer
      set({
        sourceFolders: [],
        expandedFolders: new Set(),
        sourceViewMode: 'list',
      });
      // Note: vault/assets is now handled exclusively by AssetDrawer
      const _assetsPath = `${vaultPath}/assets`.replace(/\\/g, '/');
      if (window.electronAPI) {
        try {
          // Just verify assets folder exists, don't add to sourceFolders
          await window.electronAPI.pathExists(_assetsPath);
        } catch {
          // Ignore errors
        }
      }
    }
  },

  getSourcePanelState: () => {
    const state = get();
    return {
      folders: state.sourceFolders.map(f => ({ path: f.path, name: f.name })),
      expandedPaths: Array.from(state.expandedFolders),
      viewMode: state.sourceViewMode,
    };
  },

  // Timeline actions
  addScene: (name?: string) => {
    const id = uuidv4();
    set((state) => {
      const newOrder = state.scenes.length;
      const newScene: Scene = {
        id,
        name: name || `Scene ${newOrder + 1}`,
        cuts: [],
        order: newOrder,
        notes: [],
      };
      const currentStore = state.metadataStore || { version: 1, metadata: {}, sceneMetadata: {} };
      const updatedStore = upsertSceneMetadata(currentStore, newScene);

      return {
        scenes: [...state.scenes, newScene],
        metadataStore: updatedStore,
      };
    });
    get().saveMetadata();
    return id;
  },

  removeScene: (sceneId) => {
    set((state) => {
      const currentStore = state.metadataStore || { version: 1, metadata: {}, sceneMetadata: {} };
      const updatedStore = removeSceneMetadata(currentStore, sceneId);
      const clearedSelection = state.selectedSceneId === sceneId;
      return {
        scenes: state.scenes
          .filter((s) => s.id !== sceneId)
          .map((s, idx) => ({ ...s, order: idx })),
        selectedSceneId: state.selectedSceneId === sceneId ? null : state.selectedSceneId,
        selectionType: state.selectedSceneId === sceneId ? null : state.selectionType,
        detailsPanelOpen: clearedSelection ? false : state.detailsPanelOpen,
        metadataStore: updatedStore,
      };
    });
    get().saveMetadata();
  },

  renameScene: (sceneId, name) => {
    set((state) => {
      let updatedScene: Scene | null = null;
      const scenes = state.scenes.map((s) => {
        if (s.id !== sceneId) return s;
        updatedScene = { ...s, name };
        return updatedScene;
      });
      const currentStore = state.metadataStore || { version: 1, metadata: {}, sceneMetadata: {} };
      const updatedStore = updatedScene ? upsertSceneMetadata(currentStore, updatedScene) : currentStore;
      return { scenes, metadataStore: updatedStore };
    });
    get().saveMetadata();
  },

  reorderScenes: (fromIndex, toIndex) => set((state) => {
    const newScenes = [...state.scenes];
    const [removed] = newScenes.splice(fromIndex, 1);
    newScenes.splice(toIndex, 0, removed);
    return {
      scenes: newScenes.map((s, idx) => ({ ...s, order: idx })),
    };
  }),

  updateSceneFolderPath: (sceneId, folderPath) => set((state) => ({
    scenes: state.scenes.map((s) =>
      s.id === sceneId ? { ...s, folderPath } : s
    ),
  })),

  // Scene notes actions
  addSceneNote: (sceneId, note) => {
    set((state) => {
      let updatedScene: Scene | null = null;
      const scenes = state.scenes.map((s) =>
        s.id === sceneId
          ? (updatedScene = {
              ...s,
              notes: [
                ...s.notes,
                {
                  ...note,
                  id: uuidv4(),
                  createdAt: new Date().toISOString(),
                },
              ],
            })
          : s
      );
      const currentStore = state.metadataStore || { version: 1, metadata: {}, sceneMetadata: {} };
      const updatedStore = updatedScene ? upsertSceneMetadata(currentStore, updatedScene) : currentStore;
      return { scenes, metadataStore: updatedStore };
    });
    get().saveMetadata();
  },

  updateSceneNote: (sceneId, noteId, content) => {
    set((state) => {
      let updatedScene: Scene | null = null;
      const scenes = state.scenes.map((s) =>
        s.id === sceneId
          ? (updatedScene = {
              ...s,
              notes: s.notes.map((n) =>
                n.id === noteId ? { ...n, content } : n
              ),
            })
          : s
      );
      const currentStore = state.metadataStore || { version: 1, metadata: {}, sceneMetadata: {} };
      const updatedStore = updatedScene ? upsertSceneMetadata(currentStore, updatedScene) : currentStore;
      return { scenes, metadataStore: updatedStore };
    });
    get().saveMetadata();
  },

  removeSceneNote: (sceneId, noteId) => {
    set((state) => {
      let updatedScene: Scene | null = null;
      const scenes = state.scenes.map((s) =>
        s.id === sceneId
          ? (updatedScene = {
              ...s,
              notes: s.notes.filter((n) => n.id !== noteId),
            })
          : s
      );
      const currentStore = state.metadataStore || { version: 1, metadata: {}, sceneMetadata: {} };
      const updatedStore = updatedScene ? upsertSceneMetadata(currentStore, updatedScene) : currentStore;
      return { scenes, metadataStore: updatedStore };
    });
    get().saveMetadata();
  },

  // Cut actions
  addCutToScene: (sceneId, asset, insertIndex) => {
    const scene = get().scenes.find((s) => s.id === sceneId);
    if (!scene) return '';

    const cutId = uuidv4();
    const actualIndex = insertIndex !== undefined ? insertIndex : scene.cuts.length;
    const newCut: Cut = {
      id: cutId,
      assetId: asset.id,
      asset,
      displayTime: 1.0,
      order: actualIndex,
      useEmbeddedAudio: true,
      audioBindings: [],
    };

    set((state) => {
      // Cache the asset
      const newCache = new Map(state.assetCache);
      newCache.set(asset.id, asset);

      return {
        scenes: state.scenes.map((s) => {
          if (s.id !== sceneId) return s;

          const newCuts = [...s.cuts];
          newCuts.splice(actualIndex, 0, newCut);
          // Update order for all cuts
          return {
            ...s,
            cuts: newCuts.map((c, i) => ({ ...c, order: i })),
          };
        }),
        assetCache: newCache,
      };
    });

    return cutId;
  },

  // Add a loading cut (empty placeholder while file is being imported)
  addLoadingCutToScene: (sceneId, assetId, loadingName, insertIndex) => {
    const scene = get().scenes.find((s) => s.id === sceneId);
    if (!scene) return '';

    const cutId = uuidv4();
    const actualIndex = insertIndex !== undefined ? insertIndex : scene.cuts.length;
    const newCut: Cut = {
      id: cutId,
      assetId,
      asset: undefined,
      displayTime: 1.0,
      order: actualIndex,
      useEmbeddedAudio: true,
      audioBindings: [],
      isLoading: true,
      loadingName,
    };

    set((state) => ({
      scenes: state.scenes.map((s) => {
        if (s.id !== sceneId) return s;

        const newCuts = [...s.cuts];
        newCuts.splice(actualIndex, 0, newCut);
        // Update order for all cuts
        return {
          ...s,
          cuts: newCuts.map((c, i) => ({ ...c, order: i })),
        };
      }),
    }));

    return cutId;
  },

  // Update a loading cut with the actual asset data
  updateCutWithAsset: (sceneId, cutId, asset, displayTime) => {
    set((state) => {
      // Cache the asset
      const newCache = new Map(state.assetCache);
      newCache.set(asset.id, asset);

      return {
        scenes: state.scenes.map((s) =>
          s.id === sceneId
            ? {
                ...s,
                cuts: s.cuts.map((c) =>
                  c.id === cutId
                    ? {
                        ...c,
                        asset,
                        assetId: asset.id,
                        displayTime: displayTime ?? c.displayTime,
                        isLoading: false,
                        loadingName: undefined,
                      }
                    : c
                ),
              }
            : s
        ),
        assetCache: newCache,
      };
    });
  },

  createCutFromImport: async (sceneId, source, insertIndex, vaultPathOverride) => {
    const cutId = get().addLoadingCutToScene(sceneId, source.assetId, source.name, insertIndex);
    try {
      const vaultPath = vaultPathOverride ?? get().vaultPath;
      const { asset, displayTime } = await buildAssetForCut(source, vaultPath);
      get().updateCutWithAsset(sceneId, cutId, asset, displayTime);
    } catch (error) {
      console.error('Failed to import file:', error);
      get().removeCut(sceneId, cutId);
      throw error;
    }
    return cutId;
  },

  removeCut: (sceneId, cutId) => {
    const state = get();
    const scene = state.scenes.find((s) => s.id === sceneId);
    const cutToRemove = scene?.cuts.find((c) => c.id === cutId) || null;

    set((state) => ({
      scenes: state.scenes.map((s) =>
        s.id === sceneId
          ? {
              ...s,
              cuts: s.cuts
                .filter((c) => c.id !== cutId)
                .map((c, idx) => ({ ...c, order: idx })),
              // Remove cut from any groups and clean up empty groups
              groups: (s.groups || [])
                .map((g) => ({
                  ...g,
                  cutIds: g.cutIds.filter((id) => id !== cutId),
                }))
                .filter((g) => g.cutIds.length > 0),
            }
          : s
      ),
      selectedCutId: state.selectedCutId === cutId ? null : state.selectedCutId,
      selectionType: state.selectedCutId === cutId ? null : state.selectionType,
      detailsPanelOpen: state.selectedCutId === cutId ? false : state.detailsPanelOpen,
    }));

    return cutToRemove;
  },

  updateCutDisplayTime: (sceneId, cutId, time) => set((state) => ({
    scenes: state.scenes.map((s) =>
      s.id === sceneId
        ? {
            ...s,
            cuts: s.cuts.map((c) =>
              c.id === cutId ? { ...c, displayTime: time } : c
            ),
          }
        : s
    ),
  })),

  // Video clip actions
  updateCutClipPoints: (sceneId, cutId, inPoint, outPoint) => set((state) => ({
    scenes: state.scenes.map((s) =>
      s.id === sceneId
        ? {
            ...s,
            cuts: s.cuts.map((c) =>
              c.id === cutId
                ? {
                    ...c,
                    inPoint,
                    outPoint,
                    isClip: true,
                    // Update displayTime to match clip duration
                    displayTime: Math.abs(outPoint - inPoint),
                  }
                : c
            ),
          }
        : s
    ),
  })),

  clearCutClipPoints: (sceneId, cutId) => set((state) => ({
    scenes: state.scenes.map((s) =>
      s.id === sceneId
        ? {
            ...s,
            cuts: s.cuts.map((c) =>
              c.id === cutId
                ? {
                    ...c,
                    inPoint: undefined,
                    outPoint: undefined,
                    isClip: false,
                    // Restore displayTime to original video duration
                    displayTime: c.asset?.duration ?? c.displayTime,
                  }
                : c
            ),
          }
        : s
    ),
  })),

  updateCutAsset: (sceneId, cutId, assetUpdates) => set((state) => ({
    scenes: state.scenes.map((s) =>
      s.id === sceneId
        ? {
            ...s,
            cuts: s.cuts.map((c) =>
              c.id === cutId && c.asset
                ? {
                    ...c,
                    asset: { ...c.asset, ...assetUpdates },
                  }
                : c
            ),
          }
        : s
    ),
  })),

  updateCutLipSync: (sceneId, cutId, isLipSync, frameCount) => set((state) => ({
    scenes: state.scenes.map((s) =>
      s.id === sceneId
        ? {
            ...s,
            cuts: s.cuts.map((c) =>
              c.id === cutId
                ? {
                    ...c,
                    isLipSync,
                    lipSyncFrameCount: isLipSync ? frameCount : undefined,
                  }
                : c
            ),
          }
        : s
    ),
  })),

  setCutAudioBindings: (sceneId, cutId, bindings) => set((state) => ({
    scenes: state.scenes.map((s) =>
      s.id === sceneId
        ? {
            ...s,
            cuts: s.cuts.map((c) =>
              c.id === cutId
                ? { ...c, audioBindings: bindings.map((binding) => ({ ...binding })) }
                : c
            ),
          }
        : s
    ),
  })),

  setCutUseEmbeddedAudio: (sceneId, cutId, enabled) => set((state) => ({
    scenes: state.scenes.map((s) =>
      s.id === sceneId
        ? {
            ...s,
            cuts: s.cuts.map((c) =>
              c.id === cutId
                ? { ...c, useEmbeddedAudio: enabled }
                : c
            ),
          }
        : s
    ),
  })),

  reorderCuts: (sceneId, _cutId, newIndex, _fromSceneId, oldIndex) => set((state) => {
    const scene = state.scenes.find((s) => s.id === sceneId);
    if (!scene) return state;

    const newCuts = [...scene.cuts];
    const [removed] = newCuts.splice(oldIndex, 1);
    newCuts.splice(newIndex, 0, removed);

    return {
      scenes: state.scenes.map((s) =>
        s.id === sceneId
          ? { ...s, cuts: newCuts.map((c, idx) => ({ ...c, order: idx })) }
          : s
      ),
    };
  }),

  moveCutToScene: (fromSceneId, toSceneId, cutId, toIndex) => set((state) => {
    const fromScene = state.scenes.find((s) => s.id === fromSceneId);
    if (!fromScene) return state;

    const cutToMove = fromScene.cuts.find((c) => c.id === cutId);
    if (!cutToMove) return state;

    return {
      scenes: state.scenes.map((s) => {
        if (s.id === fromSceneId) {
          return {
            ...s,
            cuts: s.cuts
              .filter((c) => c.id !== cutId)
              .map((c, idx) => ({ ...c, order: idx })),
            // Remove cut from any groups when moving to another scene
            groups: (s.groups || [])
              .map((g) => ({
                ...g,
                cutIds: g.cutIds.filter((id) => id !== cutId),
              }))
              .filter((g) => g.cutIds.length > 0),
          };
        }
        if (s.id === toSceneId) {
          const newCuts = [...s.cuts];
          newCuts.splice(toIndex, 0, cutToMove);
          return {
            ...s,
            cuts: newCuts.map((c, idx) => ({ ...c, order: idx })),
          };
        }
        return s;
      }),
    };
  }),

  // Move multiple cuts to a scene (always preserves timeline order)
  moveCutsToScene: (cutIds, toSceneId, toIndex) => set((state) => {
    // Collect cuts in current timeline order (scene order -> cut order)
    const cutsToMove: Cut[] = [];
    const cutIdSet = new Set(cutIds);

    const orderedScenes = getScenesAndCutsInTimelineOrder(state.scenes);
    for (const scene of orderedScenes) {
      for (const cut of scene.cuts) {
        if (cutIdSet.has(cut.id)) {
          cutsToMove.push(cut);
        }
      }
    }

    if (cutsToMove.length === 0) return state;

    // Remove cuts from all scenes and add to target scene
    return {
      scenes: state.scenes.map((s) => {
        // Remove any selected cuts from this scene
        const remainingCuts = s.cuts.filter((c) => !cutIdSet.has(c.id));

        if (s.id === toSceneId) {
          // Insert all cuts at the target position
          const newCuts = [...remainingCuts];
          newCuts.splice(Math.min(toIndex, newCuts.length), 0, ...cutsToMove);
          return {
            ...s,
            cuts: newCuts.map((c, idx) => ({ ...c, order: idx })),
          };
        }

        // Other scenes: just remove the cuts
        if (remainingCuts.length !== s.cuts.length) {
          return {
            ...s,
            cuts: remainingCuts.map((c, idx) => ({ ...c, order: idx })),
          };
        }

        return s;
      }),
      // Clear selection after move
      selectedCutIds: new Set<string>(),
      selectedCutId: null,
      lastSelectedCutId: null,
    };
  }),

  // Selection actions
  selectScene: (sceneId) => set({
    selectedSceneId: sceneId,
    selectedCutId: null,
    selectedCutIds: new Set(),
    lastSelectedCutId: null,
    selectedGroupId: null,  // Clear group selection
    selectionType: sceneId ? 'scene' : null,
    detailsPanelOpen: !!sceneId,
  }),

  selectCut: (cutId) => set((state) => {
    // Find the scene containing this cut
    let sceneId: string | null = null;
    for (const scene of state.scenes) {
      if (scene.cuts.some((c) => c.id === cutId)) {
        sceneId = scene.id;
        break;
      }
    }
    // Single selection clears multi-select and group selection
    return {
      selectedCutId: cutId,
      selectedSceneId: sceneId,
      selectedCutIds: cutId ? new Set([cutId]) : new Set(),
      lastSelectedCutId: cutId,
      selectedGroupId: null,  // Clear group selection
      selectionType: cutId ? 'cut' : null,
      detailsPanelOpen: !!cutId,
    };
  }),

  // Multi-select actions
  toggleCutSelection: (cutId) => set((state) => {
    const newSelectedIds = new Set(state.selectedCutIds);
    if (newSelectedIds.has(cutId)) {
      newSelectedIds.delete(cutId);
    } else {
      newSelectedIds.add(cutId);
    }

    // Find scene for the cut
    let sceneId: string | null = state.selectedSceneId;
    for (const scene of state.scenes) {
      if (scene.cuts.some((c) => c.id === cutId)) {
        sceneId = scene.id;
        break;
      }
    }

    // If only one item selected, set it as selectedCutId for backwards compatibility
    const selectedCutId = newSelectedIds.size === 1
      ? Array.from(newSelectedIds)[0]
      : (newSelectedIds.size > 0 ? cutId : null);

    return {
      selectedCutIds: newSelectedIds,
      selectedCutId,
      lastSelectedCutId: cutId,
      selectedSceneId: sceneId,
      selectedGroupId: null,  // Clear group selection
      selectionType: newSelectedIds.size > 0 ? 'cut' : null,
      detailsPanelOpen: newSelectedIds.size > 0,
    };
  }),

  selectCutRange: (cutId) => set((state) => {
    if (!state.lastSelectedCutId) {
      // No previous selection, treat as single select
      let sceneId: string | null = null;
      for (const scene of state.scenes) {
        if (scene.cuts.some((c) => c.id === cutId)) {
          sceneId = scene.id;
          break;
        }
      }
      return {
        selectedCutIds: new Set([cutId]),
        selectedCutId: cutId,
        lastSelectedCutId: cutId,
        selectedSceneId: sceneId,
        selectedGroupId: null,  // Clear group selection
        selectionType: 'cut',
        detailsPanelOpen: true,
      };
    }

    // Find all cuts in order (across all scenes)
    const allCuts: Array<{ cutId: string; sceneId: string }> = [];
    for (const scene of state.scenes) {
      for (const cut of scene.cuts) {
        allCuts.push({ cutId: cut.id, sceneId: scene.id });
      }
    }

    // Find indices
    const startIndex = allCuts.findIndex(c => c.cutId === state.lastSelectedCutId);
    const endIndex = allCuts.findIndex(c => c.cutId === cutId);

    if (startIndex === -1 || endIndex === -1) {
      return state;
    }

    // Select range
    const minIndex = Math.min(startIndex, endIndex);
    const maxIndex = Math.max(startIndex, endIndex);
    const rangeIds = allCuts.slice(minIndex, maxIndex + 1).map(c => c.cutId);

    const newSelectedIds = new Set(rangeIds);

    return {
      selectedCutIds: newSelectedIds,
      selectedCutId: cutId,
      selectedSceneId: allCuts[endIndex]?.sceneId || state.selectedSceneId,
      selectedGroupId: null,  // Clear group selection
      selectionType: 'cut',
      detailsPanelOpen: newSelectedIds.size > 0,
      // Don't update lastSelectedCutId to allow extending the range
    };
  }),

  selectMultipleCuts: (cutIds) => set((state) => {
    const newSelectedIds = new Set(cutIds);
    const firstCutId = cutIds[0] || null;

    // Find scene for first cut
    let sceneId: string | null = null;
    if (firstCutId) {
      for (const scene of state.scenes) {
        if (scene.cuts.some((c) => c.id === firstCutId)) {
          sceneId = scene.id;
          break;
        }
      }
    }

    return {
      selectedCutIds: newSelectedIds,
      selectedCutId: firstCutId,
      lastSelectedCutId: firstCutId,
      selectedSceneId: sceneId,
      selectionType: cutIds.length > 0 ? 'cut' : null,
      detailsPanelOpen: cutIds.length > 0,
    };
  }),

  clearCutSelection: () => set({
    selectedCutIds: new Set(),
    selectedCutId: null,
    lastSelectedCutId: null,
    selectionType: null,
    detailsPanelOpen: false,
  }),

  isMultiSelected: (cutId) => get().selectedCutIds.has(cutId),

  // Clipboard actions
  copySelectedCuts: () => {
    const state = get();
    const selectedCuts = state.getSelectedCuts();

    if (selectedCuts.length === 0) return;

    // Store cut data (without IDs, as new IDs will be generated on paste)
    const clipboardData: ClipboardCut[] = selectedCuts.map(({ cut }) => ({
      assetId: cut.assetId,
      asset: cut.asset!,
      displayTime: cut.displayTime,
      useEmbeddedAudio: cut.useEmbeddedAudio,
      audioBindings: cut.audioBindings?.map((binding) => ({ ...binding })),
      // Include clip points
      inPoint: cut.inPoint,
      outPoint: cut.outPoint,
      isClip: cut.isClip,
    }));

    set({ clipboard: clipboardData });
  },

  pasteCuts: (targetSceneId, targetIndex) => {
    const state = get();
    if (state.clipboard.length === 0) return [];

    const targetScene = state.scenes.find(s => s.id === targetSceneId);
    if (!targetScene) return [];

    const insertIndex = targetIndex ?? targetScene.cuts.length;
    const newCutIds: string[] = [];

    // Create new cuts with unique IDs
    const newCuts: Cut[] = state.clipboard.map((clipCut, idx) => {
      const newId = uuidv4();
      newCutIds.push(newId);
      return {
        id: newId,
        assetId: clipCut.assetId,
        asset: clipCut.asset,
        displayTime: clipCut.displayTime,
        order: insertIndex + idx,
        useEmbeddedAudio: clipCut.useEmbeddedAudio ?? true,
        audioBindings: clipCut.audioBindings?.map((binding) => ({ ...binding })),
        // Include clip points
        inPoint: clipCut.inPoint,
        outPoint: clipCut.outPoint,
        isClip: clipCut.isClip,
      };
    });

    set((state) => ({
      scenes: state.scenes.map((s) => {
        if (s.id === targetSceneId) {
          const updatedCuts = [...s.cuts];
          updatedCuts.splice(insertIndex, 0, ...newCuts);
          return {
            ...s,
            cuts: updatedCuts.map((c, idx) => ({ ...c, order: idx })),
          };
        }
        return s;
      }),
      // Select the newly pasted cuts
      selectedCutIds: new Set(newCutIds),
      selectedCutId: newCutIds[0] || null,
      lastSelectedCutId: newCutIds[newCutIds.length - 1] || null,
      selectedSceneId: targetSceneId,
      selectionType: 'cut',
      detailsPanelOpen: newCutIds.length > 0,
    }));

    return newCutIds;
  },

  canPaste: () => get().clipboard.length > 0,

  // Playback actions
  setPlaybackMode: (mode) => set({ playbackMode: mode }),
  setPreviewMode: (mode) => set({ previewMode: mode }),
  setCurrentPreviewIndex: (index) => set({ currentPreviewIndex: index }),

  // Global volume actions
  setGlobalVolume: (volume) => set({ globalVolume: volume, globalMuted: volume === 0 }),
  setGlobalMuted: (muted) => set({ globalMuted: muted }),
  toggleGlobalMute: () => set((state) => ({ globalMuted: !state.globalMuted })),

  // Video preview modal actions
  openVideoPreview: (cutId) => set({ videoPreviewCutId: cutId }),
  closeVideoPreview: () => set({ videoPreviewCutId: null }),
  openSequencePreview: (cutId) => set({ sequencePreviewCutId: cutId }),
  closeSequencePreview: () => set({ sequencePreviewCutId: null }),

  // Asset importing actions
  setImportingAsset: (name) => set({ isImportingAsset: name }),

  // Asset drawer actions
  openAssetDrawer: () => set({ assetDrawerOpen: true }),
  closeAssetDrawer: () => set({ assetDrawerOpen: false }),
  toggleAssetDrawer: () => set((state) => ({ assetDrawerOpen: !state.assetDrawerOpen })),
  // Sidebar actions
  openSidebar: () => set({ sidebarOpen: true }),
  closeSidebar: () => set({ sidebarOpen: false }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  // Details panel actions
  openDetailsPanel: () => set({ detailsPanelOpen: true }),
  closeDetailsPanel: () => set({ detailsPanelOpen: false }),

  // Asset cache actions
  cacheAsset: (asset) => set((state) => {
    const newCache = new Map(state.assetCache);
    newCache.set(asset.id, asset);
    return { assetCache: newCache };
  }),

  getAsset: (assetId) => get().assetCache.get(assetId),

  // Metadata actions
  loadMetadata: async (vaultPath) => {
    const store = await loadMetadataStore(vaultPath);
    set({ metadataStore: store });
  },

  saveMetadata: async () => {
    const state = get();
    if (state.vaultPath && state.metadataStore) {
      const syncedStore = syncSceneMetadata(state.metadataStore, state.scenes);
      set({ metadataStore: syncedStore });
      await saveMetadataStore(state.vaultPath, syncedStore);
    }
  },

  attachAudioToCut: (sceneId, cutId, audioAsset, offset = 0) => {
    set((state) => {
      const newCache = new Map(state.assetCache);
      newCache.set(audioAsset.id, audioAsset);

      return {
        scenes: state.scenes.map((scene) =>
          scene.id === sceneId
            ? {
                ...scene,
                cuts: scene.cuts.map((cut) =>
                  cut.id === cutId
                    ? {
                        ...cut,
                        audioBindings: [
                          {
                            id: uuidv4(),
                            audioAssetId: audioAsset.id,
                            sourceName: audioAsset.name,
                            offsetSec: offset,
                            gain: 1,
                            enabled: true,
                            kind: 'se',
                          },
                        ],
                      }
                    : cut
                ),
              }
            : scene
        ),
        assetCache: newCache,
      };
    });

    void get().analyzeAudioAsset(audioAsset, 60);
  },

  analyzeAudioAsset: async (audioAsset, fps = 60) => {
    if (!audioAsset.path || audioAsset.type !== 'audio') return;

    const state = get();
    const currentStore = state.metadataStore || { version: 1, metadata: {}, sceneMetadata: {} };
    const existing = currentStore.metadata[audioAsset.id]?.audioAnalysis;

    if (existing && audioAsset.hash && existing.hash === audioAsset.hash && existing.fps === fps) {
      return;
    }

    const analysis = await analyzeAudioRms(audioAsset.path, fps, audioAsset.hash);
    if (!analysis) return;

    set((s) => {
      const store = s.metadataStore || { version: 1, metadata: {}, sceneMetadata: {} };
      const updated = updateAudioAnalysis(store, audioAsset.id, analysis);
      return { metadataStore: updated };
    });

    await get().saveMetadata();
  },

  detachAudioFromCut: (sceneId, cutId) => {
    set((state) => {
      return {
        scenes: state.scenes.map((scene) =>
          scene.id === sceneId
            ? {
                ...scene,
                cuts: scene.cuts.map((cut) =>
                  cut.id === cutId
                    ? { ...cut, audioBindings: [] }
                    : cut
                ),
              }
            : scene
        ),
      };
    });
  },

  getAttachedAudioForCut: (sceneId, cutId) => {
    const state = get();
    const scene = state.scenes.find((s) => s.id === sceneId);
    const cut = scene?.cuts.find((c) => c.id === cutId);
    const primaryBinding = cut?.audioBindings?.[0];
    if (!primaryBinding?.audioAssetId) return undefined;
    return state.assetCache.get(primaryBinding.audioAssetId);
  },

  updateCutAudioOffset: (sceneId, cutId, offset) => {
    set((state) => {
      return {
        scenes: state.scenes.map((scene) =>
          scene.id === sceneId
            ? {
                ...scene,
                cuts: scene.cuts.map((cut) => {
                  if (cut.id !== cutId) return cut;
                  const current = cut.audioBindings || [];
                  if (current.length === 0) return cut;
                  return {
                    ...cut,
                    audioBindings: [
                      { ...current[0], offsetSec: offset },
                      ...current.slice(1),
                    ],
                  };
                }),
              }
            : scene
        ),
      };
    });
  },

  setLipSyncForAsset: (assetId, settings) => {
    set((state) => {
      const store = state.metadataStore || { version: 1, metadata: {}, sceneMetadata: {} };
      const previous = store.metadata[assetId]?.lipSync;
      const nextSettings: LipSyncSettings = {
        ...settings,
        ownerAssetId: settings.ownerAssetId || assetId,
      };

      const previousIsSameOwner = !!previous && (!previous.ownerAssetId || previous.ownerAssetId === assetId);
      const previousOwned = previousIsSameOwner
        ? (
          previous.ownedGeneratedAssetIds && previous.ownedGeneratedAssetIds.length > 0
            ? previous.ownedGeneratedAssetIds
            : [
              ...(previous.maskAssetId ? [previous.maskAssetId] : []),
              ...(previous.compositedFrameAssetIds || []),
            ]
        )
        : [];
      const nextOwned = nextSettings.ownedGeneratedAssetIds || [];
      const inheritedOrphans = previousIsSameOwner
        ? (previous.orphanedGeneratedAssetIds || [])
        : [];
      const nextOrphans = Array.from(new Set([
        ...inheritedOrphans,
        ...previousOwned.filter((id) => !nextOwned.includes(id)),
      ])).filter((id) => !nextOwned.includes(id));

      if (nextOrphans.length > 0) {
        nextSettings.orphanedGeneratedAssetIds = nextOrphans;
      } else {
        delete nextSettings.orphanedGeneratedAssetIds;
      }

      const updated = updateLipSyncSettings(store, assetId, nextSettings);
      return { metadataStore: updated };
    });

    get().saveMetadata();
  },

  clearLipSyncForAsset: (assetId) => {
    set((state) => {
      if (!state.metadataStore) return state;
      const updated = removeLipSyncSettings(state.metadataStore, assetId);
      return { metadataStore: updated };
    });

    get().saveMetadata();
  },

  removeAssetReferences: (assetIds) => {
    const targets = Array.from(new Set(assetIds.filter(Boolean)));
    if (targets.length === 0) return;

    const previousMetadataStore = get().metadataStore;
    set((state) => {
      let metadataStore = state.metadataStore;
      if (metadataStore) {
        metadataStore = removeAssetReferencesInStore(metadataStore, targets);
      }

      const removedSet = new Set(targets);
      const scenes = state.scenes.map((scene) => ({
        ...scene,
        cuts: scene.cuts.map((cut) => ({
          ...cut,
          audioBindings: (cut.audioBindings || []).filter((binding) => !removedSet.has(binding.audioAssetId)),
        })),
      }));

      const nextCache = new Map(state.assetCache);
      for (const assetId of targets) {
        nextCache.delete(assetId);
      }

      return {
        scenes,
        metadataStore,
        assetCache: nextCache,
      };
    });

    if (previousMetadataStore !== get().metadataStore) {
      get().saveMetadata();
    }
  },

  deleteAssetWithPolicy: async ({ assetPath, assetIds, reason }) => {
    const state = get();
    if (!window.electronAPI?.vaultGateway) {
      return { success: false, reason: 'electron-unavailable' };
    }

    const targetAssetIds = Array.from(new Set(assetIds.filter(Boolean)));
    if (targetAssetIds.length === 0) {
      return { success: false, reason: 'missing-asset-ids' };
    }

    const refs = collectAssetRefs(state.scenes, state.metadataStore);
    const blockingRefs = getBlockingRefsForAssetIds(refs, targetAssetIds);
    if (blockingRefs.length > 0) {
      return { success: false, reason: 'asset-in-use', blockingRefs };
    }

    const targetTrashPath = state.trashPath || (state.vaultPath ? `${state.vaultPath}/.trash` : null);
    if (!targetTrashPath) {
      return { success: false, reason: 'trash-path-missing' };
    }

    const moved = await window.electronAPI.vaultGateway.moveToTrashWithMeta(assetPath, targetTrashPath, {
      assetId: targetAssetIds[0],
      reason: reason || 'asset-delete-policy',
    });
    if (!moved) {
      return { success: false, reason: 'trash-move-failed' };
    }

    if (state.vaultPath) {
      try {
        const index = await window.electronAPI.loadAssetIndex(state.vaultPath);
        const deletedIds = new Set(targetAssetIds);
        const updatedAssets = index.assets.filter((entry) => !deletedIds.has(entry.id));
        if (updatedAssets.length !== index.assets.length) {
          await window.electronAPI.vaultGateway.saveAssetIndex(state.vaultPath, {
            ...index,
            assets: updatedAssets,
          });
        }
      } catch (error) {
        console.error('Failed to update asset index during delete policy:', error);
      }
    }

    get().removeAssetReferences(targetAssetIds);
    return { success: true };
  },

  relinkCutAsset: (sceneId, cutId, newAsset) => {
    set((state) => {
      // Cache the new asset
      const newCache = new Map(state.assetCache);
      newCache.set(newAsset.id, newAsset);

      return {
        scenes: state.scenes.map((s) =>
          s.id === sceneId
            ? {
                ...s,
                cuts: s.cuts.map((c) =>
                  c.id === cutId
                    ? {
                        ...c,
                        asset: newAsset,
                        assetId: newAsset.id,
                        // Preserve clip points only if both assets are videos
                        inPoint: c.asset?.type === 'video' && newAsset.type === 'video' ? c.inPoint : undefined,
                        outPoint: c.asset?.type === 'video' && newAsset.type === 'video' ? c.outPoint : undefined,
                        isClip: c.asset?.type === 'video' && newAsset.type === 'video' ? c.isClip : false,
                      }
                    : c
                ),
              }
            : s
        ),
        assetCache: newCache,
      };
    });
  },

  // Helpers
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

  // Group actions
  createGroup: (sceneId, cutIds, name) => {
    const groupId = uuidv4();
    const groupName = name || `Group ${Date.now()}`;

    set((state) => ({
      scenes: state.scenes.map((s) =>
        s.id === sceneId
          ? {
              ...s,
              groups: [...(s.groups || []), { id: groupId, name: groupName, cutIds, isCollapsed: true }],
            }
          : s
      ),
    }));

    return groupId;
  },

  deleteGroup: (sceneId, groupId) => {
    const state = get();
    const scene = state.scenes.find((s) => s.id === sceneId);
    const groupToDelete = scene?.groups?.find((g) => g.id === groupId) || null;

    set((state) => ({
      scenes: state.scenes.map((s) =>
        s.id === sceneId
          ? {
              ...s,
              groups: (s.groups || []).filter((g) => g.id !== groupId),
            }
          : s
      ),
      selectedGroupId: state.selectedGroupId === groupId ? null : state.selectedGroupId,
    }));

    return groupToDelete;
  },

  toggleGroupCollapsed: (sceneId, groupId) => {
    set((state) => ({
      scenes: state.scenes.map((s) =>
        s.id === sceneId
          ? {
              ...s,
              groups: (s.groups || []).map((g) =>
                g.id === groupId ? { ...g, isCollapsed: !g.isCollapsed } : g
              ),
            }
          : s
      ),
    }));
  },

  getCutGroup: (sceneId, cutId) => {
    const state = get();
    const scene = state.scenes.find((s) => s.id === sceneId);
    return scene?.groups?.find((g) => g.cutIds.includes(cutId));
  },

  selectGroup: (groupId) => {
    set({
      selectedGroupId: groupId,
      selectedCutId: null,
      selectedCutIds: new Set(),
      lastSelectedCutId: null,
      selectionType: groupId ? 'cut' : null, // Use 'cut' type for details panel
      detailsPanelOpen: !!groupId,
    });
  },

  renameGroup: (sceneId, groupId, name) => {
    set((state) => ({
      scenes: state.scenes.map((s) =>
        s.id === sceneId
          ? {
              ...s,
              groups: (s.groups || []).map((g) =>
                g.id === groupId ? { ...g, name } : g
              ),
            }
          : s
      ),
    }));
  },

  addCutsToGroup: (sceneId, groupId, cutIds) => {
    set((state) => ({
      scenes: state.scenes.map((s) =>
        s.id === sceneId
          ? {
              ...s,
              groups: (s.groups || []).map((g) =>
                g.id === groupId
                  ? { ...g, cutIds: [...g.cutIds, ...cutIds.filter((id) => !g.cutIds.includes(id))] }
                  : g
              ),
            }
          : s
      ),
    }));
  },

  removeCutFromGroup: (sceneId, groupId, cutId) => {
    set((state) => ({
      scenes: state.scenes.map((s) =>
        s.id === sceneId
          ? {
              ...s,
              groups: (s.groups || []).map((g) =>
                g.id === groupId
                  ? { ...g, cutIds: g.cutIds.filter((id) => id !== cutId) }
                  : g
              ).filter((g) => g.cutIds.length > 0), // Remove empty groups
            }
          : s
      ),
    }));
  },

  updateGroupCutOrder: (sceneId, groupId, cutIds) => {
    set((state) => ({
      scenes: state.scenes.map((s) =>
        s.id === sceneId
          ? {
              ...s,
              groups: (s.groups || []).map((g) =>
                g.id === groupId ? { ...g, cutIds } : g
              ),
            }
          : s
      ),
    }));
  },

  getSelectedGroup: () => {
    const state = get();
    if (!state.selectedGroupId) return null;

    for (const scene of state.scenes) {
      const group = scene.groups?.find((g) => g.id === state.selectedGroupId);
      if (group) {
        return { scene, group };
      }
    }
    return null;
  },
}));
