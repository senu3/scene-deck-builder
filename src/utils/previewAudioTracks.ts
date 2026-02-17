import type { Asset, Cut, MetadataStore, SceneAudioBinding } from '../types';
import { buildExportAudioPlan } from './exportAudioPlan';

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
  cuts: Cut[];
  sceneStartAbs: number;
  previewOffsetSec?: number;
  metadataStore: MetadataStore | null;
  getAssetById: (assetId: string) => Asset | undefined;
}

// Thin wrapper: delegate track decision to exportAudioPlan and expose scene tracks for preview use.
export function resolvePreviewAudioTracks(input: ResolvePreviewAudioTracksInput): PreviewAudioTrack[] {
  const { sceneId, cuts, sceneStartAbs, previewOffsetSec = 0, metadataStore, getAssetById } = input;
  if (!sceneId || cuts.length === 0) return [];

  const plan = buildExportAudioPlan({
    cuts,
    metadataStore,
    getAssetById,
    resolveSceneIdByCutId: () => sceneId,
  });

  const tracks: PreviewAudioTrack[] = [];
  for (const event of plan.events) {
    if (event.sourceType !== 'scene-attach') continue;
    if (!event.assetId) continue;
    const asset = getAssetById(event.assetId);
    const binding = metadataStore?.sceneMetadata?.[sceneId]?.attachAudio;
    if (!asset || asset.type !== 'audio' || !asset.path || !binding) continue;
    tracks.push({
      source: 'scene',
      assetId: asset.id,
      asset,
      binding,
      sceneId,
      startAbs: sceneStartAbs + event.timelineStartSec,
      previewOffsetSec,
    });
  }
  return tracks;
}
