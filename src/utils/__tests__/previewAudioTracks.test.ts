import { describe, expect, it } from 'vitest';
import { resolvePreviewAudioTracks } from '../previewAudioTracks';

describe('previewAudioTracks', () => {
  it('resolves scene audio track with scene-relative start', () => {
    const tracks = resolvePreviewAudioTracks({
      sceneId: 'scene-1',
      sceneStartAbs: 12,
      previewOffsetSec: 3,
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
              enabled: true,
              kind: 'scene',
            },
          },
        },
      },
      getAssetById: (id) =>
        id === 'aud-1'
          ? { id: 'aud-1', name: 'bgm.wav', path: 'C:/vault/assets/bgm.wav', type: 'audio' }
          : undefined,
    });

    expect(tracks).toHaveLength(1);
    expect(tracks[0]?.source).toBe('scene');
    expect(tracks[0]?.startAbs).toBe(12);
    expect(tracks[0]?.previewOffsetSec).toBe(3);
  });

  it('returns empty when scene audio is disabled or missing', () => {
    const tracks = resolvePreviewAudioTracks({
      sceneId: 'scene-1',
      sceneStartAbs: 0,
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
              enabled: false,
              kind: 'scene',
            },
          },
        },
      },
      getAssetById: () => undefined,
    });

    expect(tracks).toEqual([]);
  });
});
