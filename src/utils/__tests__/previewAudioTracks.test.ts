import { describe, expect, it } from 'vitest';
import { resolvePreviewAudioTracks } from '../previewAudioTracks';

describe('previewAudioTracks', () => {
  it.each([
    {
      label: 'resolves scene audio track with scene-relative start',
      sceneStartAbs: 12,
      previewOffsetSec: 3,
      enabled: true,
      hasAsset: true,
      expectedLength: 1,
      expectedStartAbs: 12,
      expectedPreviewOffsetSec: 3,
    },
    {
      label: 'returns empty when scene audio is disabled or missing',
      sceneStartAbs: 0,
      previewOffsetSec: undefined,
      enabled: false,
      hasAsset: false,
      expectedLength: 0,
    },
  ])('$label', ({
    sceneStartAbs,
    previewOffsetSec,
    enabled,
    hasAsset,
    expectedLength,
    expectedStartAbs,
    expectedPreviewOffsetSec,
  }) => {
    const tracks = resolvePreviewAudioTracks({
      sceneId: 'scene-1',
      cuts: [{ id: 'cut-1', assetId: 'img-1', displayTime: 5, order: 0 }],
      sceneStartAbs,
      previewOffsetSec,
      metadataStore: {
        version: 1,
        metadata: {},
        sceneMetadata: {
          'scene-1': {
            id: 'scene-1',
            name: 'Scene 1',
            notes: [],
            updatedAt: 't',
            attachAudio: {
              id: 'sa-1',
              audioAssetId: 'aud-1',
              enabled,
              kind: 'scene',
            },
          },
        },
      },
      getAssetById: (id) =>
        hasAsset && id === 'aud-1'
          ? { id: 'aud-1', name: 'bgm.wav', path: 'C:/vault/assets/bgm.wav', type: 'audio' }
          : undefined,
    });

    expect(tracks).toHaveLength(expectedLength);
    if (expectedLength > 0) {
      expect(tracks[0]?.source).toBe('scene');
      expect(tracks[0]?.startAbs).toBe(expectedStartAbs);
      expect(tracks[0]?.previewOffsetSec).toBe(expectedPreviewOffsetSec);
    }
  });
});
