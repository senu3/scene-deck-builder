import type { Asset, LipSyncSettings } from '../../types';
import type { StoreEventOperationContext } from '../../store/events';
import { useStore } from '../../store/useStore';

export async function saveLipSyncSettings(
  assetId: string,
  settings: LipSyncSettings,
  options?: {
    sceneId?: string;
    cutId?: string;
    frameCount?: number;
  }
): Promise<void> {
  const store = useStore.getState();
  store.setLipSyncForAsset(assetId, settings);
  if (options?.sceneId && options?.cutId) {
    store.updateCutLipSync(options.sceneId, options.cutId, true, options.frameCount);
  }
  await store.saveMetadata();
}

export async function clearLipSyncSettings(assetId: string): Promise<void> {
  const store = useStore.getState();
  store.clearLipSyncForAsset(assetId);
  await store.saveMetadata();
}

export async function relinkCutAssetWithLipSyncCleanup(
  sceneId: string,
  cutId: string,
  newAsset: Asset,
  options?: { eventContext?: StoreEventOperationContext }
): Promise<void> {
  const store = useStore.getState();
  const previousCut = store.scenes
    .find((scene) => scene.id === sceneId)
    ?.cuts.find((cut) => cut.id === cutId);
  const previousAssetId = previousCut?.assetId;
  const hadLipSyncSettings = !!(previousAssetId && store.metadataStore?.metadata[previousAssetId]?.lipSync);

  store.relinkCutAsset(sceneId, cutId, newAsset, options);

  if (hadLipSyncSettings && previousAssetId && previousAssetId !== newAsset.id) {
    await store.cleanupLipSyncAssetsForDeletedCut(previousAssetId);
  }
}
