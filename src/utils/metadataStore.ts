/**
 * Metadata store utilities for persisting asset attachments in .metadata.json
 */

import type { MetadataStore, AssetMetadata, Scene, SceneMetadata, SceneAudioBinding, GroupAudioBinding } from '../types';
import { loadProjectFromPathBridge, pathExistsBridge, saveProjectBridge } from '../features/platform/electronGateway';

const METADATA_FILE = '.metadata.json';
const CURRENT_VERSION = 1;

function normalizeLipSyncSettings(lipSync: AssetMetadata['lipSync']): { lipSync: AssetMetadata['lipSync']; changed: boolean } {
  if (!lipSync) return { lipSync, changed: false };
  const hasComposited = Array.isArray(lipSync.compositedFrameAssetIds) && lipSync.compositedFrameAssetIds.length > 0;
  if (hasComposited && lipSync.version === 2) {
    return { lipSync, changed: false };
  }
  const fallbackComposited = [lipSync.baseImageAssetId, ...lipSync.variantAssetIds].filter((id) => typeof id === 'string' && id.length > 0);
  const normalized = {
    ...lipSync,
    compositedFrameAssetIds: hasComposited ? lipSync.compositedFrameAssetIds : fallbackComposited,
    version: 2 as const,
  };
  return {
    lipSync: normalized,
    changed:
      lipSync.version !== 2 ||
      !hasComposited,
  };
}

function normalizeLoadedMetadataStore(store: MetadataStore): MetadataStore {
  let changed = false;
  const nextMetadata: Record<string, AssetMetadata> = {};
  for (const [assetId, metadata] of Object.entries(store.metadata || {})) {
    const normalizedLipSync = normalizeLipSyncSettings(metadata?.lipSync);
    if (normalizedLipSync.changed) {
      changed = true;
      nextMetadata[assetId] = {
        ...metadata,
        lipSync: normalizedLipSync.lipSync,
      };
    } else {
      nextMetadata[assetId] = metadata;
    }
  }
  if (!changed) return store;
  return {
    ...store,
    metadata: nextMetadata,
  };
}

/**
 * Load metadata store from vault
 * @param vaultPath - Path to the vault directory
 * @returns MetadataStore object
 */
export async function loadMetadataStore(vaultPath: string): Promise<MetadataStore> {
  const metadataPath = `${vaultPath}/${METADATA_FILE}`.replace(/\\/g, '/');

  try {
    const exists = await pathExistsBridge(metadataPath);
    if (!exists) {
      return { version: CURRENT_VERSION, metadata: {}, sceneMetadata: {} };
    }

    // Load project from path returns JSON parsed data
    const result = await loadProjectFromPathBridge(metadataPath);
    if (result.kind === 'success' && result.data) {
      const data = result.data as MetadataStore;
      // Ensure version compatibility
      if (typeof data.version === 'number' && typeof data.metadata === 'object') {
        const normalized = normalizeLoadedMetadataStore({
          version: data.version,
          metadata: data.metadata || {},
          sceneMetadata: data.sceneMetadata || {},
        });
        return normalized;
      }
    }
    if (result.kind === 'error') {
      console.warn('[MetadataStore] Failed to load metadata store.', {
        metadataPath,
        code: result.code,
      });
    }
  } catch (error) {
    console.error('Failed to load metadata store:', error);
  }

  return { version: CURRENT_VERSION, metadata: {}, sceneMetadata: {} };
}

/**
 * Save metadata store to vault
 * @param vaultPath - Path to the vault directory
 * @param store - MetadataStore to save
 * @returns true if saved successfully
 */
export async function saveMetadataStore(
  vaultPath: string,
  store: MetadataStore
): Promise<boolean> {
  const metadataPath = `${vaultPath}/${METADATA_FILE}`.replace(/\\/g, '/');

  try {
    // Use saveProject which handles JSON stringification
    const result = await saveProjectBridge(
      JSON.stringify(store, null, 2),
      metadataPath
    );
    return result !== null;
  } catch (error) {
    console.error('Failed to save metadata store:', error);
    return false;
  }
}

/**
 * Get metadata for a specific asset
 * @param store - MetadataStore
 * @param assetId - Asset ID to look up
 * @returns AssetMetadata or undefined if not found
 */
export function getAssetMetadata(
  store: MetadataStore,
  assetId: string
): AssetMetadata | undefined {
  return store.metadata[assetId];
}

/**
 * Update metadata for an asset (immutable)
 * @param store - Current MetadataStore
 * @param metadata - AssetMetadata to update/add
 * @returns New MetadataStore with updated metadata
 */
export function updateAssetMetadata(
  store: MetadataStore,
  metadata: AssetMetadata
): MetadataStore {
  return {
    ...store,
    metadata: {
      ...store.metadata,
      [metadata.assetId]: metadata,
    },
  };
}

export function upsertSceneMetadata(
  store: MetadataStore,
  scene: Scene
): MetadataStore {
  const existing = store.sceneMetadata?.[scene.id];
  const sceneMetadata: SceneMetadata = {
    ...(existing || {}),
    id: scene.id,
    name: scene.name,
    notes: scene.notes,
    updatedAt: new Date().toISOString(),
  };

  return {
    ...store,
    sceneMetadata: {
      ...(store.sceneMetadata || {}),
      [scene.id]: sceneMetadata,
    },
  };
}

export function removeSceneMetadata(
  store: MetadataStore,
  sceneId: string
): MetadataStore {
  if (!store.sceneMetadata) return store;
  const { [sceneId]: _, ...remaining } = store.sceneMetadata;
  return {
    ...store,
    sceneMetadata: remaining,
  };
}

export function syncSceneMetadata(
  store: MetadataStore,
  scenes: Scene[]
): MetadataStore {
  const nextSceneMetadata: Record<string, SceneMetadata> = {
    ...(store.sceneMetadata || {}),
  };

  for (const scene of scenes) {
    const existing = nextSceneMetadata[scene.id];
    const validGroupIds = new Set((scene.groups || []).map((group) => group.id));
    const currentGroupBindings = existing?.groupAudioBindings || {};
    const nextGroupBindings: Record<string, GroupAudioBinding> = {};
    for (const [groupId, binding] of Object.entries(currentGroupBindings)) {
      if (!validGroupIds.has(groupId)) continue;
      nextGroupBindings[groupId] = { ...binding, groupId };
    }
    nextSceneMetadata[scene.id] = {
      ...(existing || {}),
      id: scene.id,
      name: scene.name,
      notes: scene.notes,
      updatedAt: new Date().toISOString(),
      groupAudioBindings: Object.keys(nextGroupBindings).length > 0 ? nextGroupBindings : undefined,
    };
  }

  return {
    ...store,
    sceneMetadata: nextSceneMetadata,
  };
}

export function updateSceneAudioBinding(
  store: MetadataStore,
  sceneId: string,
  binding: SceneAudioBinding | null
): MetadataStore {
  const current = store.sceneMetadata?.[sceneId];
  if (!current) return store;

  const nextSceneMetadata: SceneMetadata = binding
    ? { ...current, attachAudio: { ...binding }, updatedAt: new Date().toISOString() }
    : { ...current, attachAudio: undefined, updatedAt: new Date().toISOString() };

  return {
    ...store,
    sceneMetadata: {
      ...(store.sceneMetadata || {}),
      [sceneId]: nextSceneMetadata,
    },
  };
}

export function updateGroupAudioBinding(
  store: MetadataStore,
  sceneId: string,
  groupId: string,
  binding: GroupAudioBinding | null
): MetadataStore {
  const current = store.sceneMetadata?.[sceneId];
  if (!current) return store;

  const currentBindings = current.groupAudioBindings || {};
  const nextBindings = { ...currentBindings };

  if (binding) {
    nextBindings[groupId] = { ...binding, groupId };
  } else {
    delete nextBindings[groupId];
  }

  const nextSceneMetadata: SceneMetadata = {
    ...current,
    groupAudioBindings: Object.keys(nextBindings).length > 0 ? nextBindings : undefined,
    updatedAt: new Date().toISOString(),
  };

  return {
    ...store,
    sceneMetadata: {
      ...(store.sceneMetadata || {}),
      [sceneId]: nextSceneMetadata,
    },
  };
}

/**
 * Update audio analysis for an asset (immutable)
 * @param store - Current MetadataStore
 * @param assetId - Audio asset ID
 * @param analysis - AudioAnalysis data
 * @returns New MetadataStore with updated audio analysis
 */
export function updateAudioAnalysis(
  store: MetadataStore,
  assetId: string,
  analysis: AssetMetadata['audioAnalysis']
): MetadataStore {
  const existing = store.metadata[assetId] || { assetId };
  return updateAssetMetadata(store, {
    ...existing,
    audioAnalysis: analysis,
  });
}

/**
 * Update lip sync settings for an asset (immutable)
 * @param store - Current MetadataStore
 * @param assetId - Target asset ID
 * @param lipSync - Lip sync settings
 * @returns New MetadataStore with updated lip sync settings
 */
export function updateLipSyncSettings(
  store: MetadataStore,
  assetId: string,
  lipSync: AssetMetadata['lipSync']
): MetadataStore {
  const existing = store.metadata[assetId] || { assetId };
  return updateAssetMetadata(store, {
    ...existing,
    lipSync,
  });
}

/**
 * Remove lip sync settings for an asset (immutable)
 * @param store - Current MetadataStore
 * @param assetId - Target asset ID
 * @returns New MetadataStore with lip sync settings removed
 */
export function removeLipSyncSettings(
  store: MetadataStore,
  assetId: string
): MetadataStore {
  const existing = store.metadata[assetId];
  if (!existing) return store;

  const { lipSync: _, ...rest } = existing;

  if (Object.keys(rest).length <= 1) {
    return removeAssetMetadata(store, assetId);
  }

  return updateAssetMetadata(store, rest as AssetMetadata);
}

/**
 * Remove metadata for an asset (immutable)
 * @param store - Current MetadataStore
 * @param assetId - Asset ID to remove metadata for
 * @returns New MetadataStore with metadata removed
 */
export function removeAssetMetadata(
  store: MetadataStore,
  assetId: string
): MetadataStore {
  const { [assetId]: _, ...remaining } = store.metadata;
  return {
    ...store,
    metadata: remaining,
  };
}

function isMetadataEntryEmpty(metadata: AssetMetadata): boolean {
  return Object.keys(metadata).every((key) => key === 'assetId');
}

/**
 * Remove references to deleted assets from metadata store.
 * - Drops metadata entries whose own assetId is deleted
 * - Clears/removes LipSync settings when required frame/audio references are deleted
 */
export function removeAssetReferences(
  store: MetadataStore,
  removedAssetIds: string[]
): MetadataStore {
  const removed = new Set(removedAssetIds.filter(Boolean));
  if (removed.size === 0) return store;

  let changed = false;
  const nextMetadata: Record<string, AssetMetadata> = {};

  for (const [assetId, metadata] of Object.entries(store.metadata)) {
    if (removed.has(assetId)) {
      changed = true;
      continue;
    }

    let next: AssetMetadata = { ...metadata };

    const lipSync = next.lipSync;
    if (lipSync) {
      const baseRemoved = removed.has(lipSync.baseImageAssetId);
      const variantRemoved = lipSync.variantAssetIds.some((id) => removed.has(id));
      const rmsRemoved = removed.has(lipSync.rmsSourceAudioAssetId);

      if (baseRemoved || variantRemoved || rmsRemoved) {
        const { lipSync: _, ...rest } = next;
        next = rest as AssetMetadata;
        changed = true;
      } else {
        const nextLipSync = { ...lipSync };
        let lipSyncChanged = false;

        if (nextLipSync.maskAssetId && removed.has(nextLipSync.maskAssetId)) {
          delete nextLipSync.maskAssetId;
          lipSyncChanged = true;
        }

        if (nextLipSync.sourceVideoAssetId && removed.has(nextLipSync.sourceVideoAssetId)) {
          delete nextLipSync.sourceVideoAssetId;
          lipSyncChanged = true;
        }

        if (Array.isArray(nextLipSync.compositedFrameAssetIds) && nextLipSync.compositedFrameAssetIds.length > 0) {
          const filtered = nextLipSync.compositedFrameAssetIds.filter((id) => !removed.has(id));
          if (filtered.length !== nextLipSync.compositedFrameAssetIds.length) {
            const requiredLength = 1 + nextLipSync.variantAssetIds.length;
            if (filtered.length === requiredLength) {
              nextLipSync.compositedFrameAssetIds = filtered;
            } else {
              delete nextLipSync.compositedFrameAssetIds;
            }
            lipSyncChanged = true;
          }
        }

        if (Array.isArray(nextLipSync.ownedGeneratedAssetIds) && nextLipSync.ownedGeneratedAssetIds.length > 0) {
          const filteredOwned = nextLipSync.ownedGeneratedAssetIds.filter((id) => !removed.has(id));
          if (filteredOwned.length !== nextLipSync.ownedGeneratedAssetIds.length) {
            if (filteredOwned.length > 0) {
              nextLipSync.ownedGeneratedAssetIds = filteredOwned;
            } else {
              delete nextLipSync.ownedGeneratedAssetIds;
            }
            lipSyncChanged = true;
          }
        }

        if (Array.isArray(nextLipSync.orphanedGeneratedAssetIds) && nextLipSync.orphanedGeneratedAssetIds.length > 0) {
          const filteredOrphan = nextLipSync.orphanedGeneratedAssetIds.filter((id) => !removed.has(id));
          if (filteredOrphan.length !== nextLipSync.orphanedGeneratedAssetIds.length) {
            if (filteredOrphan.length > 0) {
              nextLipSync.orphanedGeneratedAssetIds = filteredOrphan;
            } else {
              delete nextLipSync.orphanedGeneratedAssetIds;
            }
            lipSyncChanged = true;
          }
        }

        if (lipSyncChanged) {
          next.lipSync = nextLipSync;
          changed = true;
        }
      }
    }

    if (!isMetadataEntryEmpty(next)) {
      nextMetadata[assetId] = next;
    } else {
      changed = true;
    }
  }

  const nextSceneMetadata: Record<string, SceneMetadata> = {
    ...(store.sceneMetadata || {}),
  };

  for (const [sceneId, sceneMeta] of Object.entries(nextSceneMetadata)) {
    if (!sceneMeta.attachAudio?.audioAssetId) continue;
    if (!removed.has(sceneMeta.attachAudio.audioAssetId)) continue;
    nextSceneMetadata[sceneId] = {
      ...sceneMeta,
      attachAudio: undefined,
      updatedAt: new Date().toISOString(),
    };
    changed = true;
  }

  for (const [sceneId, sceneMeta] of Object.entries(nextSceneMetadata)) {
    const groupBindings = sceneMeta.groupAudioBindings;
    if (!groupBindings || Object.keys(groupBindings).length === 0) continue;
    let sceneChanged = false;
    const nextGroupBindings: Record<string, GroupAudioBinding> = {};
    for (const [groupId, binding] of Object.entries(groupBindings)) {
      if (binding?.audioAssetId && removed.has(binding.audioAssetId)) {
        sceneChanged = true;
        changed = true;
        continue;
      }
      nextGroupBindings[groupId] = binding;
    }
    if (!sceneChanged) continue;
    nextSceneMetadata[sceneId] = {
      ...sceneMeta,
      groupAudioBindings: Object.keys(nextGroupBindings).length > 0 ? nextGroupBindings : undefined,
      updatedAt: new Date().toISOString(),
    };
  }

  if (!changed) return store;

  return {
    ...store,
    metadata: nextMetadata,
    sceneMetadata: nextSceneMetadata,
  };
}
