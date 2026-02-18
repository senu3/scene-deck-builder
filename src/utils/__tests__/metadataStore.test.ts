import { describe, expect, it, vi } from 'vitest';
import {
  loadMetadataStore,
  syncSceneMetadata,
  updateLipSyncSettings,
  removeLipSyncSettings,
  removeAssetReferences,
} from '../metadataStore';

const baseStore = {
  version: 1,
  metadata: {},
  sceneMetadata: {},
};

describe('metadataStore', () => {
  it('syncs scene metadata names and notes', () => {
    const scenes = [
      { id: 'scene-1', name: 'Scene 1', notes: [{ id: 'n1', content: 'note', createdAt: 't' }] },
      { id: 'scene-2', name: 'Scene 2', notes: [] },
    ];

    const synced = syncSceneMetadata(baseStore, scenes as any);
    const sceneMetadata = synced.sceneMetadata || {};
    expect(sceneMetadata['scene-1']?.name).toBe('Scene 1');
    expect(sceneMetadata['scene-1']?.notes.length).toBe(1);
    expect(sceneMetadata['scene-2']?.name).toBe('Scene 2');
  });

  it('preserves scene attach audio when syncing scene metadata', () => {
    const store = {
      version: 1,
      metadata: {},
      sceneMetadata: {
        'scene-1': {
          id: 'scene-1',
          name: 'Old',
          notes: [],
          updatedAt: 'old',
          attachAudio: {
            id: 'sa-1',
            audioAssetId: 'aud-1',
            sourceName: 'bgm.wav',
            enabled: true,
            kind: 'scene',
          },
        },
      },
    };
    const scenes = [
      { id: 'scene-1', name: 'Scene 1', notes: [] },
    ];

    const synced = syncSceneMetadata(store as any, scenes as any);
    expect(synced.sceneMetadata?.['scene-1']?.attachAudio?.audioAssetId).toBe('aud-1');
  });

  it('sets and removes lip sync settings', () => {
    const settings = {
      baseImageAssetId: 'img-closed',
      variantAssetIds: ['img-half1', 'img-half2', 'img-open'],
      rmsSourceAudioAssetId: 'aud-1',
      thresholds: { t1: 0.1, t2: 0.2, t3: 0.3 },
      fps: 60,
      version: 1,
    };

    const withLipSync = updateLipSyncSettings(baseStore, 'asset-1', settings as any);
    expect(withLipSync.metadata['asset-1']?.lipSync?.baseImageAssetId).toBe('img-closed');
    expect(withLipSync.metadata['asset-1']?.lipSync?.variantAssetIds.length).toBe(3);

    const removed = removeLipSyncSettings(withLipSync, 'asset-1');
    expect(removed.metadata['asset-1']).toBeUndefined();
  });

  it('removes lip sync metadata when required frame references are deleted', () => {
    const withLipSync = updateLipSyncSettings(baseStore, 'asset-1', {
      baseImageAssetId: 'img-closed',
      variantAssetIds: ['img-half1', 'img-half2', 'img-open'],
      compositedFrameAssetIds: ['img-closed-c', 'img-half1-c', 'img-half2-c', 'img-open-c'],
      maskAssetId: 'mask-1',
      rmsSourceAudioAssetId: 'audio-1',
      thresholds: { t1: 0.1, t2: 0.2, t3: 0.3 },
      fps: 60,
      version: 2,
    } as any);

    const cleaned = removeAssetReferences(withLipSync, ['img-open']);
    expect(cleaned.metadata['asset-1']).toBeUndefined();
  });

  it('keeps lip sync by dropping optional links only', () => {
    const withLipSync = updateLipSyncSettings(baseStore, 'asset-1', {
      baseImageAssetId: 'img-closed',
      variantAssetIds: ['img-half1', 'img-half2', 'img-open'],
      compositedFrameAssetIds: ['img-closed-c', 'img-half1-c', 'img-half2-c', 'img-open-c'],
      maskAssetId: 'mask-1',
      sourceVideoAssetId: 'video-1',
      rmsSourceAudioAssetId: 'audio-1',
      thresholds: { t1: 0.1, t2: 0.2, t3: 0.3 },
      fps: 60,
      version: 2,
    } as any);

    const cleaned = removeAssetReferences(withLipSync, ['mask-1', 'video-1', 'img-open-c']);
    expect(cleaned.metadata['asset-1']?.lipSync).toBeDefined();
    expect(cleaned.metadata['asset-1']?.lipSync?.maskAssetId).toBeUndefined();
    expect(cleaned.metadata['asset-1']?.lipSync?.sourceVideoAssetId).toBeUndefined();
    expect(cleaned.metadata['asset-1']?.lipSync?.compositedFrameAssetIds).toBeUndefined();
  });

  it('clears scene attach audio when referenced asset is removed', () => {
    const store = {
      version: 1,
      metadata: {},
      sceneMetadata: {
        'scene-1': {
          id: 'scene-1',
          name: 'Scene 1',
          notes: [],
          updatedAt: 't',
          attachAudio: {
            id: 'scene-audio-1',
            audioAssetId: 'audio-1',
            enabled: true,
            kind: 'scene',
          },
        },
      },
    };

    const cleaned = removeAssetReferences(store as any, ['audio-1']);
    expect(cleaned.sceneMetadata?.['scene-1']?.attachAudio).toBeUndefined();
  });

  it('normalizes legacy lipSync settings to composited-frame schema on load', async () => {
    const pathExistsMock = vi.spyOn(window.electronAPI!, 'pathExists').mockResolvedValueOnce(true);
    const loadMock = vi.spyOn(window.electronAPI!, 'loadProjectFromPath').mockResolvedValueOnce({
      path: 'C:/vault/.metadata.json',
      data: {
        version: 1,
        metadata: {
          'asset-1': {
            assetId: 'asset-1',
            lipSync: {
              baseImageAssetId: 'img-closed',
              variantAssetIds: ['img-half1', 'img-half2', 'img-open'],
              rmsSourceAudioAssetId: 'audio-1',
              thresholds: { t1: 0.1, t2: 0.2, t3: 0.3 },
              fps: 60,
              version: 1,
            },
          },
        },
        sceneMetadata: {},
      },
    });

    const loaded = await loadMetadataStore('C:/vault');
    expect(loaded.metadata['asset-1']?.lipSync?.compositedFrameAssetIds).toEqual([
      'img-closed',
      'img-half1',
      'img-half2',
      'img-open',
    ]);
    expect(loaded.metadata['asset-1']?.lipSync?.version).toBe(2);

    pathExistsMock.mockRestore();
    loadMock.mockRestore();
  });
});
