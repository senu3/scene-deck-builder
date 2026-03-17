/**
 * Metadata store utilities for persisting asset attachments in .metadata.json
 */

import type { MetadataStore, AssetMetadata, Scene, SceneMetadata, SceneAudioBinding, GroupAudioBinding } from '../types';
import { loadProjectFromPathBridge, pathExistsBridge, saveProjectBridge } from '../features/platform/electronGateway';

const METADATA_FILE = '.metadata.json';
const CURRENT_VERSION = 1;

export interface MetadataStoreAssessmentOptions {
  sceneIds?: Iterable<string>;
  assetIds?: Iterable<string>;
}

export interface MetadataStoreReport {
  metadataSchemaVersion: number;
  skippedMetadataCount: number;
  orphanMetadataCount: number;
  orphanSceneMetadataCount: number;
  orphanAssetMetadataCount: number;
  invalidRootFallbackCount: number;
  normalized: boolean;
}

export interface MetadataStoreAssessmentResult {
  store: MetadataStore;
  report: MetadataStoreReport;
}

function createEmptyMetadataStore(): MetadataStore {
  return { version: CURRENT_VERSION, metadata: {}, sceneMetadata: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function sanitizeLoadedAssetMetadata(metadata: AssetMetadata): AssetMetadata {
  const { lipSync: _legacyLipSync, ...rest } = metadata as AssetMetadata & { lipSync?: unknown };
  return rest;
}

function sanitizeMetadataStoreEntries(
  metadata: Record<string, AssetMetadata>
): Record<string, AssetMetadata> {
  return Object.fromEntries(
    Object.entries(metadata).map(([assetId, entry]) => [assetId, sanitizeLoadedAssetMetadata(entry)])
  );
}

function buildMetadataStoreReport(
  store: MetadataStore,
  options: MetadataStoreAssessmentOptions = {},
  extras: {
    invalidRootFallbackCount?: number;
  } = {}
): MetadataStoreReport {
  const sceneIds = options.sceneIds ? new Set(options.sceneIds) : null;
  const assetIds = options.assetIds ? new Set(options.assetIds) : null;
  let orphanSceneMetadataCount = 0;
  let orphanAssetMetadataCount = 0;

  if (sceneIds) {
    for (const sceneId of Object.keys(store.sceneMetadata || {})) {
      if (!sceneIds.has(sceneId)) {
        orphanSceneMetadataCount += 1;
      }
    }
  }

  if (assetIds) {
    for (const assetId of Object.keys(store.metadata || {})) {
      if (!assetIds.has(assetId)) {
        orphanAssetMetadataCount += 1;
      }
    }
  }

  const invalidRootFallbackCount = extras.invalidRootFallbackCount ?? 0;
  const orphanMetadataCount = orphanSceneMetadataCount + orphanAssetMetadataCount;

  return {
    metadataSchemaVersion: typeof store.version === 'number' ? store.version : CURRENT_VERSION,
    skippedMetadataCount: invalidRootFallbackCount + orphanMetadataCount,
    orphanMetadataCount,
    orphanSceneMetadataCount,
    orphanAssetMetadataCount,
    invalidRootFallbackCount,
    normalized: false,
  };
}

export function assessMetadataStore(
  rawStore: MetadataStore | null | undefined,
  options: MetadataStoreAssessmentOptions = {}
): MetadataStoreAssessmentResult {
  const baseStore = rawStore
    ? {
        version: typeof rawStore.version === 'number' ? rawStore.version : CURRENT_VERSION,
        metadata: sanitizeMetadataStoreEntries(rawStore.metadata || {}),
        sceneMetadata: rawStore.sceneMetadata || {},
      }
    : createEmptyMetadataStore();

  return {
    store: baseStore,
    report: buildMetadataStoreReport(baseStore, options),
  };
}

/**
 * Load metadata store from vault
 * @param vaultPath - Path to the vault directory
 * @returns MetadataStore object
 */
export async function loadMetadataStoreWithReport(
  vaultPath: string,
  options: MetadataStoreAssessmentOptions = {}
): Promise<MetadataStoreAssessmentResult> {
  const metadataPath = `${vaultPath}/${METADATA_FILE}`.replace(/\\/g, '/');

  try {
    const exists = await pathExistsBridge(metadataPath);
    if (!exists) {
      return assessMetadataStore(createEmptyMetadataStore(), options);
    }

    // Load project from path returns JSON parsed data
    const result = await loadProjectFromPathBridge(metadataPath);
    if (result.kind === 'success' && result.data) {
      const data = result.data as MetadataStore;
      // Ensure version compatibility
      if (typeof data.version === 'number' && isRecord(data.metadata)) {
        return assessMetadataStore({
          version: data.version,
          metadata: data.metadata || {},
          sceneMetadata: isRecord(data.sceneMetadata) ? (data.sceneMetadata as MetadataStore['sceneMetadata']) : {},
        }, options);
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

  return {
    store: createEmptyMetadataStore(),
    report: buildMetadataStoreReport(createEmptyMetadataStore(), options, {
      invalidRootFallbackCount: 1,
    }),
  };
}

export async function loadMetadataStore(vaultPath: string): Promise<MetadataStore> {
  const result = await loadMetadataStoreWithReport(vaultPath);
  return result.store;
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
  const sanitizedStore: MetadataStore = {
    ...store,
    metadata: sanitizeMetadataStoreEntries(store.metadata || {}),
  };

  try {
    // Use saveProject which handles JSON stringification
    const result = await saveProjectBridge(
      JSON.stringify(sanitizedStore, null, 2),
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

    const next: AssetMetadata = { ...metadata };

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
