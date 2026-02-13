import { v4 as uuidv4 } from 'uuid';
import type { Scene, Cut } from '../../types';
import { clearThumbnailCache } from '../../utils/thumbnailCache';
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

export function createProjectSlice(set: SliceSet, get: SliceGet): ProjectSliceContract {
  return {
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
        metadataStore: null,
        scenes: [],
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

    loadProject: (scenes) => set({ scenes: normalizeScenesUseEmbeddedAudio(scenes), cutRuntimeById: {} }),

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
