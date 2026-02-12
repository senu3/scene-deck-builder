import { v4 as uuidv4 } from 'uuid';
import type { Scene, Cut } from '../../types';
import { upsertSceneMetadata, removeSceneMetadata } from '../../utils/metadataStore';
import { buildAssetForCut } from '../../utils/cutImport';
import { getScenesAndCutsInTimelineOrder } from '../../utils/timelineOrder';
import { removeCutIdsFromGroups } from '../../utils/cutGroupOps';
import type { ClipboardCut } from '../useStore';
import type { CutTimelineSliceContract } from '../contracts';
import type { SliceGet, SliceSet } from './sliceTypes';

export function createCutTimelineSlice(set: SliceSet, get: SliceGet): CutTimelineSliceContract {
  return {
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
      void get().saveMetadata();
      return id;
    },

    removeScene: (sceneId) => {
      const removedCuts = get()
        .scenes.find((s) => s.id === sceneId)
        ?.cuts.map((cut) => ({ cutId: cut.id, assetId: cut.assetId })) || [];
      set((state) => {
        const currentStore = state.metadataStore || { version: 1, metadata: {}, sceneMetadata: {} };
        const updatedStore = removeSceneMetadata(currentStore, sceneId);
        const clearedSelection = state.selectedSceneId === sceneId;
        const targetScene = state.scenes.find((s) => s.id === sceneId);
        const nextCutRuntimeById = { ...state.cutRuntimeById };
        for (const cut of targetScene?.cuts || []) {
          delete nextCutRuntimeById[cut.id];
        }
        return {
          scenes: state.scenes
            .filter((s) => s.id !== sceneId)
            .map((s, idx) => ({ ...s, order: idx })),
          cutRuntimeById: nextCutRuntimeById,
          selectedSceneId: state.selectedSceneId === sceneId ? null : state.selectedSceneId,
          selectionType: state.selectedSceneId === sceneId ? null : state.selectionType,
          detailsPanelOpen: clearedSelection ? false : state.detailsPanelOpen,
          metadataStore: updatedStore,
        };
      });
      for (const removed of removedCuts) {
        get().emitStoreEvent({
          type: 'CUT_DELETED',
          sceneId,
          cutId: removed.cutId,
          assetId: removed.assetId,
        });
      }
      void get().saveMetadata();
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
      void get().saveMetadata();
    },

    reorderScenes: (fromIndex, toIndex) =>
      set((state) => {
        const newScenes = [...state.scenes];
        const [removed] = newScenes.splice(fromIndex, 1);
        newScenes.splice(toIndex, 0, removed);
        return {
          scenes: newScenes.map((s, idx) => ({ ...s, order: idx })),
        };
      }),

    updateSceneFolderPath: (sceneId, folderPath) =>
      set((state) => ({
        scenes: state.scenes.map((s) => (s.id === sceneId ? { ...s, folderPath } : s)),
      })),

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
      void get().saveMetadata();
    },

    updateSceneNote: (sceneId, noteId, content) => {
      set((state) => {
        let updatedScene: Scene | null = null;
        const scenes = state.scenes.map((s) =>
          s.id === sceneId
            ? (updatedScene = {
                ...s,
                notes: s.notes.map((n) => (n.id === noteId ? { ...n, content } : n)),
              })
            : s
        );
        const currentStore = state.metadataStore || { version: 1, metadata: {}, sceneMetadata: {} };
        const updatedStore = updatedScene ? upsertSceneMetadata(currentStore, updatedScene) : currentStore;
        return { scenes, metadataStore: updatedStore };
      });
      void get().saveMetadata();
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
      void get().saveMetadata();
    },

    addCutToScene: (sceneId, asset, insertIndex) => {
      const scene = get().scenes.find((s) => s.id === sceneId);
      if (!scene) return '';

      const cutId = uuidv4();
      const actualIndex = insertIndex !== undefined ? insertIndex : scene.cuts.length;
      const newCut: Cut = {
        id: cutId,
        assetId: asset.id,
        asset,
        displayTime: 1,
        order: actualIndex,
        useEmbeddedAudio: true,
        audioBindings: [],
      };

      set((state) => {
        const newCache = new Map(state.assetCache);
        newCache.set(asset.id, asset);

        return {
          scenes: state.scenes.map((s) => {
            if (s.id !== sceneId) return s;

            const newCuts = [...s.cuts];
            newCuts.splice(actualIndex, 0, newCut);
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

    addLoadingCutToScene: (sceneId, assetId, loadingName, insertIndex) => {
      const scene = get().scenes.find((s) => s.id === sceneId);
      if (!scene) return '';

      const cutId = uuidv4();
      const actualIndex = insertIndex !== undefined ? insertIndex : scene.cuts.length;
      const newCut: Cut = {
        id: cutId,
        assetId,
        asset: undefined,
        displayTime: 1,
        order: actualIndex,
        useEmbeddedAudio: true,
        audioBindings: [],
      };

      set((state) => {
        const nextCutRuntimeById = { ...state.cutRuntimeById, [cutId]: { isLoading: true, loadingName } };
        return {
          scenes: state.scenes.map((s) => {
            if (s.id !== sceneId) return s;

            const newCuts = [...s.cuts];
            newCuts.splice(actualIndex, 0, newCut);
            return {
              ...s,
              cuts: newCuts.map((c, i) => ({ ...c, order: i })),
            };
          }),
          cutRuntimeById: nextCutRuntimeById,
        };
      });

      return cutId;
    },

    updateCutWithAsset: (sceneId, cutId, asset, displayTime) => {
      set((state) => {
        const newCache = new Map(state.assetCache);
        newCache.set(asset.id, asset);
        const nextCutRuntimeById = { ...state.cutRuntimeById };
        delete nextCutRuntimeById[cutId];

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
                        }
                      : c
                  ),
                }
              : s
          ),
          assetCache: newCache,
          cutRuntimeById: nextCutRuntimeById,
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

      set((currentState) => ({
        cutRuntimeById: (() => {
          const next = { ...currentState.cutRuntimeById };
          delete next[cutId];
          return next;
        })(),
        scenes: currentState.scenes.map((s) =>
          s.id === sceneId
            ? {
                ...s,
                cuts: s.cuts
                  .filter((c) => c.id !== cutId)
                  .map((c, idx) => ({ ...c, order: idx })),
                groups: removeCutIdsFromGroups(s.groups, [cutId]),
              }
            : s
        ),
        selectedCutId: currentState.selectedCutId === cutId ? null : currentState.selectedCutId,
        selectionType: currentState.selectedCutId === cutId ? null : currentState.selectionType,
        detailsPanelOpen: currentState.selectedCutId === cutId ? false : currentState.detailsPanelOpen,
      }));

      if (cutToRemove) {
        get().emitStoreEvent({
          type: 'CUT_DELETED',
          sceneId,
          cutId,
          assetId: cutToRemove.assetId,
        });
      }

      return cutToRemove;
    },

    updateCutDisplayTime: (sceneId, cutId, time) =>
      set((state) => ({
        scenes: state.scenes.map((s) =>
          s.id === sceneId
            ? {
                ...s,
                cuts: s.cuts.map((c) => (c.id === cutId ? { ...c, displayTime: time } : c)),
              }
            : s
        ),
      })),

    updateCutClipPoints: (sceneId, cutId, inPoint, outPoint) =>
      set((state) => ({
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
                        displayTime: Math.abs(outPoint - inPoint),
                      }
                    : c
                ),
              }
            : s
        ),
      })),

    clearCutClipPoints: (sceneId, cutId) =>
      set((state) => ({
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
                        displayTime: c.asset?.duration ?? c.displayTime,
                      }
                    : c
                ),
              }
            : s
        ),
      })),

    updateCutAsset: (sceneId, cutId, assetUpdates) =>
      set((state) => ({
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

    updateCutLipSync: (sceneId, cutId, isLipSync, frameCount) =>
      set((state) => ({
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

    setCutAudioBindings: (sceneId, cutId, bindings) =>
      set((state) => ({
        scenes: state.scenes.map((s) =>
          s.id === sceneId
            ? {
                ...s,
                cuts: s.cuts.map((c) =>
                  c.id === cutId ? { ...c, audioBindings: bindings.map((binding) => ({ ...binding })) } : c
                ),
              }
            : s
        ),
      })),

    setCutUseEmbeddedAudio: (sceneId, cutId, enabled) =>
      set((state) => ({
        scenes: state.scenes.map((s) =>
          s.id === sceneId
            ? {
                ...s,
                cuts: s.cuts.map((c) => (c.id === cutId ? { ...c, useEmbeddedAudio: enabled } : c)),
              }
            : s
        ),
      })),

    reorderCuts: (sceneId, _cutId, newIndex, _fromSceneId, oldIndex) =>
      set((state) => {
        const scene = state.scenes.find((s) => s.id === sceneId);
        if (!scene) return state;

        const newCuts = [...scene.cuts];
        const [removed] = newCuts.splice(oldIndex, 1);
        newCuts.splice(newIndex, 0, removed);

        return {
          scenes: state.scenes.map((s) =>
            s.id === sceneId ? { ...s, cuts: newCuts.map((c, idx) => ({ ...c, order: idx })) } : s
          ),
        };
      }),

    moveCutToScene: (fromSceneId, toSceneId, cutId, toIndex) =>
      set((state) => {
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
                groups: removeCutIdsFromGroups(s.groups, [cutId]),
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

    moveCutsToScene: (cutIds, toSceneId, toIndex) =>
      set((state) => {
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

        return {
          scenes: state.scenes.map((s) => {
            const remainingCuts = s.cuts.filter((c) => !cutIdSet.has(c.id));
            const nextGroups = removeCutIdsFromGroups(s.groups, cutIds);

            if (s.id === toSceneId) {
              const newCuts = [...remainingCuts];
              newCuts.splice(Math.min(toIndex, newCuts.length), 0, ...cutsToMove);
              return {
                ...s,
                cuts: newCuts.map((c, idx) => ({ ...c, order: idx })),
                groups: nextGroups,
              };
            }

            if (remainingCuts.length !== s.cuts.length) {
              return {
                ...s,
                cuts: remainingCuts.map((c, idx) => ({ ...c, order: idx })),
                groups: nextGroups,
              };
            }

            return s;
          }),
          selectedCutIds: new Set<string>(),
          selectedCutId: null,
          lastSelectedCutId: null,
        };
      }),

    setCutRuntime: (cutId, runtime) =>
      set((state) => ({
        cutRuntimeById: { ...state.cutRuntimeById, [cutId]: runtime },
      })),

    clearCutRuntime: (cutId) =>
      set((state) => {
        const next = { ...state.cutRuntimeById };
        delete next[cutId];
        return { cutRuntimeById: next };
      }),

    getCutRuntime: (cutId) => get().cutRuntimeById[cutId],

    copySelectedCuts: () => {
      const state = get();
      const selectedCuts = state.getSelectedCuts();

      if (selectedCuts.length === 0) return;

      const clipboardData = selectedCuts.reduce<ClipboardCut[]>((acc, { cut }) => {
        const resolvedAsset = state.getAsset(cut.assetId) || cut.asset;
        if (!resolvedAsset) return acc;
        acc.push({
          assetId: cut.assetId,
          asset: resolvedAsset,
          displayTime: cut.displayTime,
          useEmbeddedAudio: cut.useEmbeddedAudio,
          audioBindings: cut.audioBindings?.map((binding) => ({ ...binding })),
          inPoint: cut.inPoint,
          outPoint: cut.outPoint,
          isClip: cut.isClip,
        });
        return acc;
      }, []);

      if (clipboardData.length === 0) return;

      set({ clipboard: clipboardData });
    },

    pasteCuts: (targetSceneId, targetIndex) => {
      const state = get();
      if (state.clipboard.length === 0) return [];

      const targetScene = state.scenes.find((s) => s.id === targetSceneId);
      if (!targetScene) return [];

      const insertIndex = targetIndex ?? targetScene.cuts.length;
      const newCutIds: string[] = [];

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
          inPoint: clipCut.inPoint,
          outPoint: clipCut.outPoint,
          isClip: clipCut.isClip,
        };
      });

      set((currentState) => ({
        scenes: currentState.scenes.map((s) => {
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
  };
}

