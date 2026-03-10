import { v4 as uuidv4 } from 'uuid';
import type { Scene, Cut, CutRuntimeState } from '../../types';
import { upsertSceneMetadata, removeSceneMetadata } from '../../utils/metadataStore';
import { buildAssetForCut } from '../../utils/cutImport';
import { getScenesAndCutsInTimelineOrder } from '../../utils/timelineOrder';
import { normalizeSceneOrder } from '../../utils/sceneOrder';
import { resolveCutAsset } from '../../utils/assetResolve';
import type { ClipboardCut } from '../stateTypes';
import type { CutTimelineSliceContract } from '../contracts';
import type { AppState } from '../stateTypes';
import type { SliceGet, SliceSet } from './sliceTypes';

export function createCutTimelineSlice(set: SliceSet, get: SliceGet): CutTimelineSliceContract {
  const incrementClipRevision = (
    runtimeById: Record<string, CutRuntimeState>,
    cutId: string,
  ) => {
    const current = runtimeById[cutId];
    const currentRevision = current?.clipRevision ?? 0;
    return {
      ...runtimeById,
      [cutId]: {
        ...(current || {}),
        clipRevision: currentRevision + 1,
      },
    };
  };

  const pruneRuntimeById = (
    runtimeById: Record<string, CutRuntimeState>,
    cutId: string,
    runtime: CutRuntimeState
  ) => {
    const nextRuntimeById = { ...runtimeById };
    const hasRuntimeValue =
      runtime.isLoading !== undefined
      || runtime.loadingName !== undefined
      || runtime.clipRevision !== undefined
      || runtime.hold !== undefined;
    if (hasRuntimeValue) {
      nextRuntimeById[cutId] = runtime;
    } else {
      delete nextRuntimeById[cutId];
    }
    return nextRuntimeById;
  };

  const applyClipMarkerMutation = (
    state: AppState,
    sceneId: string,
    cutId: string,
    mutation: { type: 'set'; inPoint: number; outPoint: number } | { type: 'clear' },
  ) => {
    let didChange = false;
    const scenes = state.scenes.map((scene) => {
      if (scene.id !== sceneId) return scene;
      return {
        ...scene,
        cuts: scene.cuts.map((cut) => {
          if (cut.id !== cutId) return cut;

          if (mutation.type === 'set') {
            const nextDisplayTime = Math.abs(mutation.outPoint - mutation.inPoint);
            const unchanged =
              cut.isClip === true
              && cut.inPoint === mutation.inPoint
              && cut.outPoint === mutation.outPoint
              && cut.displayTime === nextDisplayTime;
            if (unchanged) return cut;
            didChange = true;
            return {
              ...cut,
              inPoint: mutation.inPoint,
              outPoint: mutation.outPoint,
              isClip: true,
              displayTime: nextDisplayTime,
            };
          }

          const resolvedAsset = resolveCutAsset(cut, state.getAsset);
          const restoredDuration =
            typeof resolvedAsset?.duration === 'number'
            && Number.isFinite(resolvedAsset.duration)
            && resolvedAsset.duration > 0
              ? resolvedAsset.duration
              : null;
          const nextDisplayTime = restoredDuration ?? cut.displayTime;
          const unchanged =
            cut.isClip === false
            && cut.inPoint === undefined
            && cut.outPoint === undefined
            && cut.displayTime === nextDisplayTime;
          if (unchanged) return cut;
          didChange = true;
          return {
            ...cut,
            inPoint: undefined,
            outPoint: undefined,
            isClip: false,
            displayTime: nextDisplayTime,
          };
        }),
      };
    });

    if (!didChange) {
      return { scenes: state.scenes, cutRuntimeById: state.cutRuntimeById };
    }

    return {
      scenes,
      cutRuntimeById: incrementClipRevision(state.cutRuntimeById, cutId),
    };
  };

  return {
    addScene: (name?: string) => {
      const id = uuidv4();
      set((state) => {
        const newScene: Scene = {
          id,
          name: name || `Scene ${state.sceneOrder.length + 1}`,
          cuts: [],
          notes: [],
        };
        const currentStore = state.metadataStore || { version: 1, metadata: {}, sceneMetadata: {} };
        const updatedStore = upsertSceneMetadata(currentStore, newScene);
        const scenes = [...state.scenes, newScene];
        const sceneOrder = normalizeSceneOrder([...state.sceneOrder, id], scenes);

        return {
          scenes,
          sceneOrder,
          metadataStore: updatedStore,
        };
      });
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
          scenes: state.scenes.filter((s) => s.id !== sceneId),
          sceneOrder: state.sceneOrder.filter((id) => id !== sceneId),
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
      get().applyStoreEvents();
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
    },

    reorderScenes: (fromIndex, toIndex) =>
      set((state) => {
        const newSceneOrder = [...state.sceneOrder];
        const [removed] = newSceneOrder.splice(fromIndex, 1);
        if (!removed) return state;
        newSceneOrder.splice(toIndex, 0, removed);
        return {
          sceneOrder: normalizeSceneOrder(newSceneOrder, state.scenes),
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
              }
            : s
        ),
      }));

      if (cutToRemove) {
        get().emitStoreEvent({
          type: 'CUT_DELETED',
          sceneId,
          cutId,
          assetId: cutToRemove.assetId,
        });
        get().applyStoreEvents();
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
      set((state) =>
        applyClipMarkerMutation(state, sceneId, cutId, {
          type: 'set',
          inPoint,
          outPoint,
        })),

    clearCutClipPoints: (sceneId, cutId) =>
      set((state) => applyClipMarkerMutation(state, sceneId, cutId, { type: 'clear' })),

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

    moveCutToScene: (fromSceneId, toSceneId, cutId, toIndex) => {
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
      });

      get().emitStoreEvent({
        type: 'CUT_MOVED',
        fromSceneId,
        toSceneId,
        cutIds: [cutId],
      });
      get().applyStoreEvents();
    },

    moveCutsToScene: (cutIds, toSceneId, toIndex) => {
      const movedByScene = new Map<string, string[]>();
      set((state) => {
        const cutsToMove: Cut[] = [];
        const cutIdSet = new Set(cutIds);

        const orderedScenes = getScenesAndCutsInTimelineOrder(state.scenes, state.sceneOrder);
        for (const scene of orderedScenes) {
          const matchedCutIds = scene.cuts.filter((cut) => cutIdSet.has(cut.id)).map((cut) => cut.id);
          if (matchedCutIds.length > 0) {
            movedByScene.set(scene.id, matchedCutIds);
          }
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

            if (s.id === toSceneId) {
              const newCuts = [...remainingCuts];
              newCuts.splice(Math.min(toIndex, newCuts.length), 0, ...cutsToMove);
              return {
                ...s,
                cuts: newCuts.map((c, idx) => ({ ...c, order: idx })),
              };
            }

            if (remainingCuts.length !== s.cuts.length) {
              return {
                ...s,
                cuts: remainingCuts.map((c, idx) => ({ ...c, order: idx })),
              };
            }

            return s;
          }),
          selectedCutIds: new Set<string>(),
          selectedCutId: null,
          lastSelectedCutId: null,
        };
      });

      for (const [fromSceneId, movedCutIds] of movedByScene.entries()) {
        get().emitStoreEvent({
          type: 'CUT_MOVED',
          fromSceneId,
          toSceneId,
          cutIds: movedCutIds,
        });
      }
      get().applyStoreEvents();
    },

    setCutRuntime: (cutId, runtime) =>
      set((state) => ({
        cutRuntimeById: { ...state.cutRuntimeById, [cutId]: runtime },
      })),

    setCutRuntimeHold: (cutId, hold) =>
      set((state) => {
        const current = state.cutRuntimeById[cutId] || {};
        return {
          cutRuntimeById: {
            ...state.cutRuntimeById,
            [cutId]: {
              ...current,
              hold: { ...hold },
            },
          },
        };
      }),

    clearCutRuntimeHold: (cutId) =>
      set((state) => {
        const current = state.cutRuntimeById[cutId];
        if (!current?.hold) return state;
        const { hold: _removed, ...rest } = current;
        return {
          cutRuntimeById: pruneRuntimeById(state.cutRuntimeById, cutId, rest),
        };
      }),

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
        const hold = state.getCutRuntime(cut.id)?.hold;
        acc.push({
          assetId: cut.assetId,
          asset: resolveCutAsset(cut, state.getAsset) ?? undefined,
          displayTime: cut.displayTime,
          hold: hold ? { ...hold } : undefined,
          useEmbeddedAudio: cut.useEmbeddedAudio,
          audioBindings: cut.audioBindings?.map((binding) => ({ ...binding })),
          inPoint: cut.inPoint,
          outPoint: cut.outPoint,
          isClip: cut.isClip,
          isLipSync: cut.isLipSync,
          lipSyncFrameCount: cut.lipSyncFrameCount,
        });
        return acc;
      }, []);

      set({ clipboard: clipboardData });
    },

    pasteCuts: (targetSceneId, targetIndex) => {
      const state = get();
      if (state.clipboard.length === 0) return [];

      const targetScene = state.scenes.find((s) => s.id === targetSceneId);
      if (!targetScene) return [];

      const insertIndex = targetIndex ?? targetScene.cuts.length;
      const newCutIds: string[] = [];
      const pastedHoldByCutId: Record<string, NonNullable<ClipboardCut['hold']>> = {};

      const newCuts: Cut[] = state.clipboard.map((clipCut, idx) => {
        const newId = uuidv4();
        newCutIds.push(newId);
        if (clipCut.hold) {
          pastedHoldByCutId[newId] = { ...clipCut.hold };
        }
        const resolvedAsset = state.getAsset(clipCut.assetId) || clipCut.asset;
        return {
          id: newId,
          assetId: clipCut.assetId,
          asset: resolvedAsset,
          displayTime: clipCut.displayTime,
          order: insertIndex + idx,
          useEmbeddedAudio: clipCut.useEmbeddedAudio ?? true,
          audioBindings: clipCut.audioBindings?.map((binding) => ({ ...binding })),
          inPoint: clipCut.inPoint,
          outPoint: clipCut.outPoint,
          isClip: clipCut.isClip,
          isLipSync: clipCut.isLipSync,
          lipSyncFrameCount: clipCut.isLipSync ? clipCut.lipSyncFrameCount : undefined,
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
        cutRuntimeById: (() => {
          if (Object.keys(pastedHoldByCutId).length === 0) {
            return currentState.cutRuntimeById;
          }
          const next = { ...currentState.cutRuntimeById };
          for (const [cutId, hold] of Object.entries(pastedHoldByCutId)) {
            next[cutId] = {
              ...(next[cutId] || {}),
              hold: { ...hold },
            };
          }
          return next;
        })(),
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
