import { v4 as uuidv4 } from 'uuid';
import type { LipSyncSettings } from '../../types';
import {
  loadMetadataStore,
  updateAudioAnalysis,
  updateLipSyncSettings,
  removeLipSyncSettings,
  syncSceneMetadata,
  updateSceneAudioBinding,
  updateGroupAudioBinding,
  removeAssetReferences as removeAssetReferencesInStore,
} from '../../utils/metadataStore';
import { analyzeAudioRms } from '../../utils/audioUtils';
import { collectAssetRefs, getBlockingRefsForAssetIds } from '../../utils/assetRefs';
import { hydrateAssetsByIdsFromIndex } from '../../features/metadata/provider';
import {
  type AppEffect,
  createFilesDeleteEffect,
  createIndexUpdateEffect,
  createMetadataDeleteEffect,
  createSaveMetadataEffect,
  dispatchAppEffects,
} from '../../features/platform/effects';
import type { MetadataStore } from '../../types';
import type { MetadataSliceContract } from '../contracts';
import type { SliceGet, SliceSet } from './sliceTypes';

function getAssetDisplayName(audioAsset: { name: string; originalPath?: string }): string {
  if (audioAsset.originalPath) {
    const originalName = audioAsset.originalPath.split(/[/\\]/).pop();
    if (originalName) return originalName;
  }
  return audioAsset.name;
}

function collectSceneAudioAssetIds(store: MetadataStore | null): string[] {
  if (!store?.sceneMetadata) return [];
  const ids = new Set<string>();
  for (const sceneMetadata of Object.values(store.sceneMetadata)) {
    const sceneAssetId = sceneMetadata?.attachAudio?.audioAssetId;
    if (sceneAssetId) ids.add(sceneAssetId);
    for (const binding of Object.values(sceneMetadata?.groupAudioBindings || {})) {
      if (binding?.audioAssetId) ids.add(binding.audioAssetId);
    }
  }
  return Array.from(ids);
}

export function createMetadataSlice(set: SliceSet, get: SliceGet): MetadataSliceContract {
  const persistMetadataStore = async () => {
    const state = get();
    if (!state.vaultPath || !state.metadataStore) {
      return;
    }

    const syncedStore = syncSceneMetadata(state.metadataStore, state.scenes);
    set({ metadataStore: syncedStore });

    const { warnings } = await dispatchAppEffects([
      createSaveMetadataEffect({
        vaultPath: state.vaultPath,
        store: syncedStore,
      }),
    ], {
      origin: 'store',
    });
    for (const warning of warnings) {
      console.warn('[metadata] save warning', warning);
    }
  };

  return {
    cacheAsset: (asset) =>
      set((state) => {
        const newCache = new Map(state.assetCache);
        newCache.set(asset.id, asset);
        return { assetCache: newCache };
      }),

    getAsset: (assetId) => get().assetCache.get(assetId),

    loadMetadata: async (vaultPath) => {
      const store = await loadMetadataStore(vaultPath);
      const attachAudioIds = collectSceneAudioAssetIds(store);
      if (attachAudioIds.length > 0) {
        const state = get();
        const missingIds = attachAudioIds.filter((assetId) => !state.assetCache.has(assetId));
        if (missingIds.length > 0) {
          try {
            const hydratedAssets = await hydrateAssetsByIdsFromIndex(vaultPath, missingIds);

            if (hydratedAssets.length > 0) {
              set((currentState) => {
                const nextCache = new Map(currentState.assetCache);
                for (const asset of hydratedAssets) {
                  nextCache.set(asset.id, asset);
                }
                return {
                  metadataStore: store,
                  assetCache: nextCache,
                };
              });
              return;
            }
          } catch (error) {
            console.warn('[metadata] Failed to hydrate scene attach audio assets from index:', error);
          }
        }
      }

      set({ metadataStore: store });
    },

    saveMetadata: async () => {
      await persistMetadataStore();
    },

    attachAudioToCut: (sceneId, cutId, audioAsset, offset = 0) => {
      get().cacheAsset(audioAsset);
      get().setCutAudioBindings(sceneId, cutId, [
        {
          id: uuidv4(),
          audioAssetId: audioAsset.id,
          sourceName: getAssetDisplayName(audioAsset),
          offsetSec: offset,
          gain: 1,
          enabled: true,
          kind: 'se',
        },
      ]);

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

      await persistMetadataStore();
    },

    detachAudioFromCut: (sceneId, cutId) => {
      get().setCutAudioBindings(sceneId, cutId, []);
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
      const scene = get().scenes.find((s) => s.id === sceneId);
      const cut = scene?.cuts.find((c) => c.id === cutId);
      const current = cut?.audioBindings || [];
      if (current.length === 0) return;
      get().setCutAudioBindings(sceneId, cutId, [{ ...current[0], offsetSec: offset }, ...current.slice(1)]);
    },

    setSceneAudioBinding: (sceneId, binding) => {
      set((state) => {
        const baseStore = state.metadataStore || { version: 1, metadata: {}, sceneMetadata: {} };
        const store = baseStore.sceneMetadata?.[sceneId]
          ? baseStore
          : syncSceneMetadata(baseStore, state.scenes);
        return {
          metadataStore: updateSceneAudioBinding(
            store,
            sceneId,
            binding ? { ...binding } : null
          ),
        };
      });
    },

    attachAudioToScene: (sceneId, audioAsset) => {
      get().cacheAsset(audioAsset);
      get().setSceneAudioBinding(sceneId, {
        id: uuidv4(),
        audioAssetId: audioAsset.id,
        sourceName: getAssetDisplayName(audioAsset),
        gain: 1,
        enabled: true,
        kind: 'scene',
      });
    },

    detachAudioFromScene: (sceneId) => {
      get().setSceneAudioBinding(sceneId, null);
    },

    getSceneAudioBinding: (sceneId) => {
      const state = get();
      return state.metadataStore?.sceneMetadata?.[sceneId]?.attachAudio;
    },

    getAttachedAudioForScene: (sceneId) => {
      const state = get();
      const binding = state.metadataStore?.sceneMetadata?.[sceneId]?.attachAudio;
      if (!binding?.audioAssetId) return undefined;
      return state.assetCache.get(binding.audioAssetId);
    },

    setGroupAudioBinding: (sceneId, groupId, binding) => {
      set((state) => {
        const baseStore = state.metadataStore || { version: 1, metadata: {}, sceneMetadata: {} };
        const store = baseStore.sceneMetadata?.[sceneId]
          ? baseStore
          : syncSceneMetadata(baseStore, state.scenes);
        return {
          metadataStore: updateGroupAudioBinding(
            store,
            sceneId,
            groupId,
            binding ? { ...binding } : null
          ),
        };
      });
    },

    attachAudioToGroup: (sceneId, groupId, audioAsset) => {
      get().cacheAsset(audioAsset);
      get().setGroupAudioBinding(sceneId, groupId, {
        id: uuidv4(),
        groupId,
        audioAssetId: audioAsset.id,
        sourceName: getAssetDisplayName(audioAsset),
        gain: 1,
        enabled: true,
        kind: 'group',
      });
    },

    detachAudioFromGroup: (sceneId, groupId) => {
      get().setGroupAudioBinding(sceneId, groupId, null);
    },

    getGroupAudioBinding: (sceneId, groupId) => {
      const state = get();
      return state.metadataStore?.sceneMetadata?.[sceneId]?.groupAudioBindings?.[groupId];
    },

    getAttachedAudioForGroup: (sceneId, groupId) => {
      const state = get();
      const binding = state.metadataStore?.sceneMetadata?.[sceneId]?.groupAudioBindings?.[groupId];
      if (!binding?.audioAssetId) return undefined;
      return state.assetCache.get(binding.audioAssetId);
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
          ? previous.ownedGeneratedAssetIds && previous.ownedGeneratedAssetIds.length > 0
            ? previous.ownedGeneratedAssetIds
            : [
                ...(previous.maskAssetId ? [previous.maskAssetId] : []),
                ...(previous.compositedFrameAssetIds || []),
              ]
          : [];
        const nextOwned = nextSettings.ownedGeneratedAssetIds || [];
        const inheritedOrphans = previousIsSameOwner ? previous.orphanedGeneratedAssetIds || [] : [];
        const nextOrphans = Array.from(
          new Set([...inheritedOrphans, ...previousOwned.filter((id) => !nextOwned.includes(id))])
        ).filter((id) => !nextOwned.includes(id));

        if (nextOrphans.length > 0) {
          nextSettings.orphanedGeneratedAssetIds = nextOrphans;
        } else {
          delete nextSettings.orphanedGeneratedAssetIds;
        }

        const updated = updateLipSyncSettings(store, assetId, nextSettings);
        return { metadataStore: updated };
      });

      void persistMetadataStore();
    },

    clearLipSyncForAsset: (assetId) => {
      set((state) => {
        if (!state.metadataStore) return state;
        const updated = removeLipSyncSettings(state.metadataStore, assetId);
        return { metadataStore: updated };
      });

      void persistMetadataStore();
    },

    cleanupLipSyncAssetsForDeletedCut: async (assetId) => {
      const state = get();
      if (!assetId || !state.metadataStore) return;

      const hasRemainingLipSyncCut = state.scenes.some((scene) =>
        scene.cuts.some((cut) => cut.assetId === assetId && !!cut.isLipSync)
      );
      if (hasRemainingLipSyncCut) return;

      const lipSync = state.metadataStore.metadata[assetId]?.lipSync;
      if (!lipSync) return;

      const generatedAssetIds = Array.from(new Set([
        ...(lipSync.ownedGeneratedAssetIds || []),
        ...(lipSync.orphanedGeneratedAssetIds || []),
      ])).filter(Boolean);

      // Remove lipsync metadata first so generated assets are no longer treated as in-use references.
      get().clearLipSyncForAsset(assetId);

      if (generatedAssetIds.length === 0) {
        return;
      }

      const latestState = get();
      const assetPathById = new Map<string, string>();

      for (const generatedId of generatedAssetIds) {
        const cached = latestState.getAsset(generatedId);
        if (cached?.path) {
          assetPathById.set(generatedId, cached.path);
        }
      }

      if (latestState.vaultPath) {
        try {
          const unresolvedAssetIds = generatedAssetIds.filter((id) => !assetPathById.has(id));
          const hydratedAssets = await hydrateAssetsByIdsFromIndex(latestState.vaultPath, unresolvedAssetIds);
          for (const asset of hydratedAssets) {
            if (!asset.path || assetPathById.has(asset.id)) continue;
            assetPathById.set(asset.id, asset.path);
          }
        } catch (error) {
          console.warn('[LipSync] Failed to resolve generated asset paths from index:', error);
        }
      }

      for (const generatedId of generatedAssetIds) {
        const generatedPath = assetPathById.get(generatedId);
        if (!generatedPath) continue;
        const result = await get().deleteAssetWithPolicy({
          assetPath: generatedPath,
          assetIds: [generatedId],
          reason: 'lipsync-generated-cleanup',
        });
        if (!result.success || result.reason === 'index-sync-failed') {
          const level = result.success ? 'warning' : 'failed';
          console.warn(`[LipSync] Generated asset cleanup ${level}:`, result.reason, generatedId);
        }
      }
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
        void persistMetadataStore();
      }
    },

    deleteAssetWithPolicy: async ({ assetPath, assetIds, reason }) => {
      const state = get();

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

      const effects: AppEffect[] = [
        createFilesDeleteEffect({
          assetPath,
          trashPath: targetTrashPath,
          assetIds: targetAssetIds,
          reason,
        }),
      ];
      if (state.vaultPath) {
        effects.push(createIndexUpdateEffect({
          vaultPath: state.vaultPath,
          assetIds: targetAssetIds,
        }));
      }
      effects.push(createMetadataDeleteEffect({
        assetIds: targetAssetIds,
      }));

      const { results, warnings } = await dispatchAppEffects(effects, {
        origin: 'store',
      });
      const warningResult = warnings.length > 0 ? { warnings } : {};
      const failed = results.find((entry) => !entry.success);
      if (!failed) {
        return { success: true, ...warningResult };
      }

      if (failed.effect.type === 'FILES_DELETE') {
        return {
          success: false,
          reason: failed.reason || 'trash-move-failed',
          ...warningResult,
        };
      }
      if (failed.effect.type === 'INDEX_UPDATE') {
        return {
          success: true,
          reason: 'index-sync-failed',
          ...warningResult,
        };
      }
      return {
        success: false,
        reason: failed.reason || 'metadata-delete-failed',
        ...warningResult,
      };
    },

    relinkCutAsset: (sceneId, cutId, newAsset, options) => {
      const state = get();
      const previousCut = state.scenes
        .find((s) => s.id === sceneId)
        ?.cuts.find((c) => c.id === cutId);
      const previousAssetId = previousCut?.assetId;
      const hadLipSyncSettings = !!(previousAssetId && state.metadataStore?.metadata[previousAssetId]?.lipSync);

      get().cacheAsset(newAsset);
      get().updateCutWithAsset(sceneId, cutId, newAsset);

      if (previousCut?.isLipSync) {
        get().updateCutLipSync(sceneId, cutId, false);
      }

      const emit = () =>
        get().emitCutRelinked({
          sceneId,
          cutId,
          previousAssetId,
          nextAssetId: newAsset.id,
        });
      const context = options?.eventContext;
      if (context) {
        void get().runWithStoreEventContext(context, emit);
      } else {
        emit();
      }

      if (hadLipSyncSettings && previousAssetId && previousAssetId !== newAsset.id) {
        void get().cleanupLipSyncAssetsForDeletedCut(previousAssetId);
      }

      if (!previousCut) return;
      if (previousCut.asset?.type !== 'video' || newAsset.type !== 'video') {
        get().clearCutClipPoints(sceneId, cutId);
      }
    },
  };
}
