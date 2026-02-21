import type { Asset, MetadataStore } from '../../types';

export const mapAssetsById = (assets: Asset[]): Map<string, Asset> =>
  new Map(assets.map((asset) => [asset.id, asset]));

export const createSceneAttachMetadataStore = (
  sceneId: string,
  audioAssetId: string,
  enabled = true,
  sceneName = 'S1'
): MetadataStore => ({
  version: 1,
  metadata: {},
  sceneMetadata: {
    [sceneId]: {
      id: sceneId,
      name: sceneName,
      notes: [],
      updatedAt: 't',
      attachAudio: {
        id: `sa-${sceneId}`,
        audioAssetId,
        enabled,
        kind: 'scene',
      },
    },
  },
});
