import { v4 as uuidv4 } from 'uuid';
import type { LipSyncSettings } from '../../types';
import {
  loadMetadataStore,
  saveMetadataStore,
  updateAudioAnalysis,
  updateLipSyncSettings,
  removeLipSyncSettings,
  syncSceneMetadata,
  updateSceneAudioBinding,
  removeAssetReferences as removeAssetReferencesInStore,
} from '../../utils/metadataStore';
import { analyzeAudioRms } from '../../utils/audioUtils';
import { collectAssetRefs, getBlockingRefsForAssetIds } from '../../utils/assetRefs';
import type { MetadataSliceContract } from '../contracts';
import type { SliceGet, SliceSet } from './sliceTypes';

function getAssetDisplayName(audioAsset: { name: string; originalPath?: string }): string {
  if (audioAsset.originalPath) {
    const originalName = audioAsset.originalPath.split(/[/\\]/).pop();
    if (originalName) return originalName;
  }
  return audioAsset.name;
}

export function createMetadataSlice(set: SliceSet, get: SliceGet): MetadataSliceContract {
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

      await get().saveMetadata();
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

      void get().saveMetadata();
    },

    clearLipSyncForAsset: (assetId) => {
      set((state) => {
        if (!state.metadataStore) return state;
        const updated = removeLipSyncSettings(state.metadataStore, assetId);
        return { metadataStore: updated };
      });

      void get().saveMetadata();
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

      if (generatedAssetIds.length === 0 || !window.electronAPI?.loadAssetIndex) {
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
          const index = await window.electronAPI.loadAssetIndex(latestState.vaultPath);
          for (const entry of index.assets) {
            if (!generatedAssetIds.includes(entry.id)) continue;
            if (assetPathById.has(entry.id)) continue;
            assetPathById.set(entry.id, `${latestState.vaultPath}/assets/${entry.filename}`);
          }
        } catch (error) {
          console.warn('[LipSync] Failed to resolve generated asset paths from index:', error);
        }
      }

      for (const generatedId of generatedAssetIds) {
        const generatedPath = assetPathById.get(generatedId);
        if (!generatedPath) continue;
        await get().deleteAssetWithPolicy({
          assetPath: generatedPath,
          assetIds: [generatedId],
          reason: 'lipsync-generated-cleanup',
        });
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
        void get().saveMetadata();
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

      get().emitStoreEvent({
        type: 'CUT_RELINKED',
        sceneId,
        cutId,
        previousAssetId,
        nextAssetId: newAsset.id,
      });

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
