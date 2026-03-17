import { describe, expect, it, vi } from 'vitest';
import {
  assessMetadataStore,
  loadMetadataStore,
  loadMetadataStoreWithReport,
  removeAssetReferences,
  saveMetadataStore,
  syncSceneMetadata,
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
    const scenes = [{ id: 'scene-1', name: 'Scene 1', notes: [] }];

    const synced = syncSceneMetadata(store as any, scenes as any);
    expect(synced.sceneMetadata?.['scene-1']?.attachAudio?.audioAssetId).toBe('aud-1');
  });

  it('preserves valid group audio bindings and prunes missing groups on sync', () => {
    const store = {
      version: 1,
      metadata: {},
      sceneMetadata: {
        'scene-1': {
          id: 'scene-1',
          name: 'Old',
          notes: [],
          updatedAt: 'old',
          groupAudioBindings: {
            'group-1': {
              id: 'ga-1',
              groupId: 'group-1',
              audioAssetId: 'aud-g1',
              enabled: true,
              kind: 'group',
            },
            'group-missing': {
              id: 'ga-2',
              groupId: 'group-missing',
              audioAssetId: 'aud-g2',
              enabled: true,
              kind: 'group',
            },
          },
        },
      },
    };
    const scenes = [
      {
        id: 'scene-1',
        name: 'Scene 1',
        notes: [],
        groups: [{ id: 'group-1', cutIds: ['cut-1'], isCollapsed: true }],
      },
    ];

    const synced = syncSceneMetadata(store as any, scenes as any);
    expect(synced.sceneMetadata?.['scene-1']?.groupAudioBindings?.['group-1']?.audioAssetId).toBe('aud-g1');
    expect(synced.sceneMetadata?.['scene-1']?.groupAudioBindings?.['group-missing']).toBeUndefined();
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

  it('clears group audio binding when referenced asset is removed', () => {
    const store = {
      version: 1,
      metadata: {},
      sceneMetadata: {
        'scene-1': {
          id: 'scene-1',
          name: 'Scene 1',
          notes: [],
          updatedAt: 't',
          groupAudioBindings: {
            'group-1': {
              id: 'group-audio-1',
              groupId: 'group-1',
              audioAssetId: 'audio-1',
              enabled: true,
              kind: 'group',
            },
          },
        },
      },
    };

    const cleaned = removeAssetReferences(store as any, ['audio-1']);
    expect(cleaned.sceneMetadata?.['scene-1']?.groupAudioBindings?.['group-1']).toBeUndefined();
  });

  it('ignores legacy lipSync metadata on load', async () => {
    const pathExistsMock = vi.spyOn(window.electronAPI!, 'pathExists').mockResolvedValueOnce(true);
    const loadMock = vi.spyOn(window.electronAPI!, 'loadProjectFromPath').mockResolvedValueOnce({
      kind: 'success',
      path: 'C:/vault/.metadata.json',
      data: {
        version: 1,
        metadata: {
          'asset-1': {
            assetId: 'asset-1',
            lipSync: {
              baseImageAssetId: 'img-closed',
              variantAssetIds: ['img-half1', 'img-half2', 'img-open'],
            },
          },
        },
        sceneMetadata: {},
      },
    });

    const loaded = await loadMetadataStore('C:/vault');
    expect(loaded.metadata['asset-1']).toEqual({ assetId: 'asset-1' });

    pathExistsMock.mockRestore();
    loadMock.mockRestore();
  });

  it('does not write lipSync to metadata save output', async () => {
    const saveSpy = vi.spyOn(window.electronAPI!, 'saveProject').mockResolvedValueOnce('C:/vault/.metadata.json');

    await saveMetadataStore('C:/vault', {
      version: 1,
      metadata: {
        'asset-1': {
          assetId: 'asset-1',
          displayTime: 2,
          lipSync: { legacy: true },
        } as any,
      },
      sceneMetadata: {},
    });

    expect(saveSpy).toHaveBeenCalledTimes(1);
    const payload = saveSpy.mock.calls[0]?.[0];
    expect(payload).toContain('"displayTime": 2');
    expect(payload).not.toContain('lipSync');

    saveSpy.mockRestore();
  });

  it('reports orphan metadata during dry-run assessment', () => {
    const assessed = assessMetadataStore({
      version: 1,
      metadata: {
        'asset-live': { assetId: 'asset-live' },
        'asset-orphan': { assetId: 'asset-orphan' },
      },
      sceneMetadata: {
        'scene-live': {
          id: 'scene-live',
          name: 'Scene Live',
          notes: [],
          updatedAt: 't',
        },
        'scene-orphan': {
          id: 'scene-orphan',
          name: 'Scene Orphan',
          notes: [],
          updatedAt: 't',
        },
      },
    }, {
      sceneIds: ['scene-live'],
      assetIds: ['asset-live'],
    });

    expect(assessed.report.orphanMetadataCount).toBe(2);
    expect(assessed.report.orphanSceneMetadataCount).toBe(1);
    expect(assessed.report.orphanAssetMetadataCount).toBe(1);
    expect(assessed.report.normalized).toBe(false);
  });

  it('reports invalid metadata roots without failing load', async () => {
    vi.spyOn(window.electronAPI!, 'pathExists').mockResolvedValueOnce(true);
    vi.spyOn(window.electronAPI!, 'loadProjectFromPath').mockResolvedValueOnce({
      kind: 'success',
      path: 'C:/vault/.metadata.json',
      data: null,
    });

    const result = await loadMetadataStoreWithReport('C:/vault', {
      sceneIds: ['scene-1'],
      assetIds: ['asset-1'],
    });

    expect(result.store).toEqual({
      version: 1,
      metadata: {},
      sceneMetadata: {},
    });
    expect(result.report.invalidRootFallbackCount).toBe(1);
    expect(result.report.skippedMetadataCount).toBe(1);
  });
});
