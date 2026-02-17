import { v4 as uuidv4 } from 'uuid';
import type { Scene, Cut, Asset } from '../../types';
import { clearThumbnailCache } from '../../utils/thumbnailCache';
import { normalizeSceneOrder } from '../../utils/sceneOrder';
import { resolveCutAsset } from '../../utils/assetResolve';
import type { SourceFolder } from '../stateTypes';
import type { ProjectSliceContract } from '../contracts';
import type { SliceGet, SliceSet } from './sliceTypes';

function normalizeScenesUseEmbeddedAudio(scenes: Scene[]): Scene[] {
  return scenes.map((scene) => ({
    ...scene,
    cuts: scene.cuts.map((cut) => {
      const {
        isLoading: _isLoading,
        loadingName: _loadingName,
        ...rest
      } = cut as Cut & { isLoading?: boolean; loadingName?: string };
      return {
        ...rest,
        useEmbeddedAudio: cut.useEmbeddedAudio ?? true,
      };
    }),
  }));
}

function buildAssetCacheFromScenes(scenes: Scene[]): Map<string, Asset> {
  const cache = new Map<string, Asset>();
  for (const scene of scenes) {
    for (const cut of scene.cuts) {
      const cutAsset = resolveCutAsset(cut, () => undefined);
      if (!cutAsset) continue;
      const lookupId = cut.assetId || cutAsset.id;
      if (lookupId) {
        cache.set(lookupId, { ...cutAsset, id: lookupId });
      }
      if (cutAsset.id && cutAsset.id !== lookupId) {
        cache.set(cutAsset.id, cutAsset);
      }
    }
  }
  return cache;
}

export function createProjectSlice(set: SliceSet, get: SliceGet): ProjectSliceContract {
  return {
    setProjectLoaded: (loaded) => set({ projectLoaded: loaded }),
    setProjectPath: (path) => set({ projectPath: path }),
    setVaultPath: (path) => set({ vaultPath: path }),
    setTrashPath: (path) => set({ trashPath: path }),
    setProjectName: (name) => set({ projectName: name }),
    setTargetTotalDurationSec: (seconds) =>
      set({
        targetTotalDurationSec:
          Number.isFinite(seconds) && (seconds as number) > 0 ? Math.floor(seconds as number) : undefined,
      }),

    initializeProject: (project) => {
      clearThumbnailCache();
      const defaultScenes: Scene[] = [
        { id: uuidv4(), name: 'Scene 1', cuts: [], notes: [] },
        { id: uuidv4(), name: 'Scene 2', cuts: [], notes: [] },
        { id: uuidv4(), name: 'Scene 3', cuts: [], notes: [] },
      ];
      const nextScenes = normalizeScenesUseEmbeddedAudio(project.scenes || defaultScenes);
      const nextSceneOrder = normalizeSceneOrder(project.sceneOrder, nextScenes);

      set({
        projectLoaded: true,
        projectPath: project.vaultPath ? `${project.vaultPath}/project.sdp` : null,
        vaultPath: project.vaultPath || null,
        trashPath: project.vaultPath ? `${project.vaultPath}/.trash` : null,
        projectName: project.name || 'Untitled Project',
        targetTotalDurationSec:
          Number.isFinite(project.targetTotalDurationSec) && (project.targetTotalDurationSec as number) > 0
            ? Math.floor(project.targetTotalDurationSec as number)
            : undefined,
        scenes: nextScenes,
        sceneOrder: nextSceneOrder,
        assetCache: buildAssetCacheFromScenes(nextScenes),
        cutRuntimeById: {},
        selectedSceneId: null,
        selectedCutId: null,
        selectedCutIds: new Set(),
        lastSelectedCutId: null,
        selectionType: null,
        detailsPanelOpen: false,
        pendingSubtitleModalCutId: null,
      });
    },

    clearProject: () => {
      clearThumbnailCache();
      set({
        projectLoaded: false,
        projectPath: null,
        vaultPath: null,
        trashPath: null,
        projectName: 'Untitled Project',
        targetTotalDurationSec: undefined,
        metadataStore: null,
        scenes: [],
        sceneOrder: [],
        selectedSceneId: null,
        selectedCutId: null,
        selectedCutIds: new Set(),
        cutRuntimeById: {},
        lastSelectedCutId: null,
        selectionType: null,
        rootFolder: null,
        sourceFolders: [],
        assetCache: new Map(),
        selectedGroupId: null,
        detailsPanelOpen: false,
        pendingSubtitleModalCutId: null,
      });
    },

    loadProject: (scenes, sceneOrder) => {
      const nextScenes = normalizeScenesUseEmbeddedAudio(scenes);
      set({
        scenes: nextScenes,
        sceneOrder: normalizeSceneOrder(sceneOrder, nextScenes),
        assetCache: buildAssetCacheFromScenes(nextScenes),
        cutRuntimeById: {},
      });
    },

    setRootFolder: (folder) =>
      set((state) => {
        if (folder && !state.sourceFolders.some((f) => f.path === folder.path)) {
          return {
            rootFolder: folder,
            sourceFolders: [...state.sourceFolders, folder],
          };
        }
        return { rootFolder: folder };
      }),

    addSourceFolder: (folder) =>
      set((state) => {
        if (state.sourceFolders.some((f) => f.path === folder.path)) {
          return state;
        }
        return { sourceFolders: [...state.sourceFolders, folder] };
      }),

    removeSourceFolder: (path) =>
      set((state) => ({
        sourceFolders: state.sourceFolders.filter((f) => f.path !== path),
        rootFolder: state.rootFolder?.path === path ? null : state.rootFolder,
      })),

    updateSourceFolder: (path, structure) =>
      set((state) => ({
        sourceFolders: state.sourceFolders.map((f) => (f.path === path ? { ...f, structure } : f)),
      })),

    refreshAllSourceFolders: async () => {
      const state = get();
      if (!window.electronAPI) return;

      for (const folder of state.sourceFolders) {
        try {
          const structure = await window.electronAPI.getFolderContents(folder.path);
          set((currentState) => ({
            sourceFolders: currentState.sourceFolders.map((f) =>
              f.path === folder.path ? { ...f, structure } : f
            ),
          }));
        } catch (error) {
          console.error('Failed to refresh folder:', folder.path, error);
        }
      }
    },

    toggleFolderExpanded: (path) =>
      set((state) => {
        const newExpanded = new Set(state.expandedFolders);
        if (newExpanded.has(path)) {
          newExpanded.delete(path);
        } else {
          newExpanded.add(path);
        }
        return { expandedFolders: newExpanded };
      }),

    setExpandedFolders: (paths) => set({ expandedFolders: new Set(paths) }),

    addFavorite: (folder) =>
      set((state) => ({
        favorites: [...state.favorites, folder],
      })),

    removeFavorite: (path) =>
      set((state) => ({
        favorites: state.favorites.filter((f) => f.path !== path),
      })),

    setSourceViewMode: (mode) => set({ sourceViewMode: mode }),

    initializeSourcePanel: async (state, vaultPath) => {
      const vaultAssetsPath = vaultPath ? `${vaultPath}/assets`.replace(/\\/g, '/') : null;

      if (state) {
        const folders: SourceFolder[] = [];
        for (const folderState of state.folders) {
          const normalizedPath = folderState.path.replace(/\\/g, '/');
          if (vaultAssetsPath && normalizedPath === vaultAssetsPath) {
            continue;
          }

          if (window.electronAPI) {
            try {
              const structure = await window.electronAPI.getFolderContents(folderState.path);
              folders.push({
                path: folderState.path,
                name: folderState.name,
                structure,
              });
            } catch {
              // Folder may not exist anymore.
            }
          }
        }
        set({
          sourceFolders: folders,
          expandedFolders: new Set(state.expandedPaths),
          sourceViewMode: state.viewMode || 'list',
        });
      } else if (vaultPath) {
        set({
          sourceFolders: [],
          expandedFolders: new Set(),
          sourceViewMode: 'list',
        });
        const assetsPath = `${vaultPath}/assets`.replace(/\\/g, '/');
        if (window.electronAPI) {
          try {
            await window.electronAPI.pathExists(assetsPath);
          } catch {
            // Ignore errors.
          }
        }
      }
    },

    getSourcePanelState: () => {
      const state = get();
      return {
        folders: state.sourceFolders.map((f) => ({ path: f.path, name: f.name })),
        expandedPaths: Array.from(state.expandedFolders),
        viewMode: state.sourceViewMode,
      };
    },
  };
}
