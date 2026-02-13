import type { Asset, MetadataStore, SceneAudioBinding } from '../types';

export interface PreviewAudioTrack {
  source: 'scene';
  assetId: string;
  asset: Asset;
  binding: SceneAudioBinding;
  sceneId: string;
  startAbs: number;
  previewOffsetSec: number;
}

export interface ResolvePreviewAudioTracksInput {
  sceneId: string | null;
  sceneStartAbs: number;
  previewOffsetSec?: number;
  metadataStore: MetadataStore | null;
  getAssetById: (assetId: string) => Asset | undefined;
}

export function resolvePreviewAudioTracks(input: ResolvePreviewAudioTracksInput): PreviewAudioTrack[] {
  const { sceneId, sceneStartAbs, previewOffsetSec = 0, metadataStore, getAssetById } = input;
  if (!sceneId || !metadataStore?.sceneMetadata) return [];

  const sceneBinding = metadataStore.sceneMetadata[sceneId]?.attachAudio;
  if (!sceneBinding?.audioAssetId || sceneBinding.enabled === false) return [];

  const sceneAudioAsset = getAssetById(sceneBinding.audioAssetId);
  if (!sceneAudioAsset?.path || sceneAudioAsset.type !== 'audio') return [];

  return [{
    source: 'scene',
    assetId: sceneAudioAsset.id,
    asset: sceneAudioAsset,
    binding: sceneBinding,
    sceneId,
    startAbs: sceneStartAbs,
    previewOffsetSec,
  }];
}
