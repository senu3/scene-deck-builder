import { describe, expect, it } from 'vitest';
import { useStore } from '../useStore';
import { resetElectronMocks } from '../../test/setup.renderer';

describe('lip sync store integration', () => {
  it('persists lip sync settings to metadata store payload', () => {
    resetElectronMocks();
    const initialState = useStore.getState();

    useStore.setState({
      ...initialState,
      vaultPath: 'C:/vault',
      metadataStore: { version: 1, metadata: {}, sceneMetadata: {} },
    }, false);

    const settings = {
      baseImageAssetId: 'img-closed',
      variantAssetIds: ['img-half1', 'img-half2', 'img-open'],
      rmsSourceAudioAssetId: 'aud-1',
      thresholds: { t1: 0.1, t2: 0.2, t3: 0.3 },
      fps: 60,
      version: 1,
    };

    useStore.getState().setLipSyncForAsset('asset-1', settings as any);

    const store = useStore.getState();
    expect(store.metadataStore?.metadata['asset-1']?.lipSync?.baseImageAssetId).toBe('img-closed');

    const saveProject = window.electronAPI?.saveProject as unknown as { mock: { calls: any[] } };
    expect(saveProject?.mock.calls.length).toBeGreaterThan(0);
    const lastPayload = saveProject.mock.calls.at(-1)?.[0];
    const parsed = JSON.parse(lastPayload);
    expect(parsed.metadata['asset-1'].lipSync.rmsSourceAudioAssetId).toBe('aud-1');

    useStore.setState(initialState, true);
  });

  it('tracks orphaned generated assets when lip sync bundle is updated', () => {
    resetElectronMocks();
    const initialState = useStore.getState();

    useStore.setState({
      ...initialState,
      vaultPath: 'C:/vault',
      metadataStore: { version: 1, metadata: {}, sceneMetadata: {} },
    }, false);

    useStore.getState().setLipSyncForAsset('asset-1', {
      baseImageAssetId: 'img-closed',
      variantAssetIds: ['img-half1', 'img-half2', 'img-open'],
      maskAssetId: 'mask-old',
      compositedFrameAssetIds: ['cmp-old-1', 'cmp-old-2', 'cmp-old-3', 'cmp-old-4'],
      ownerAssetId: 'asset-1',
      ownedGeneratedAssetIds: ['mask-old', 'cmp-old-1', 'cmp-old-2', 'cmp-old-3', 'cmp-old-4'],
      rmsSourceAudioAssetId: 'aud-1',
      thresholds: { t1: 0.1, t2: 0.2, t3: 0.3 },
      fps: 60,
      version: 2,
    });

    useStore.getState().setLipSyncForAsset('asset-1', {
      baseImageAssetId: 'img-closed',
      variantAssetIds: ['img-half1', 'img-half2', 'img-open'],
      maskAssetId: 'mask-new',
      compositedFrameAssetIds: ['cmp-new-1', 'cmp-new-2', 'cmp-new-3', 'cmp-new-4'],
      ownerAssetId: 'asset-1',
      ownedGeneratedAssetIds: ['mask-new', 'cmp-new-1', 'cmp-new-2', 'cmp-new-3', 'cmp-new-4'],
      rmsSourceAudioAssetId: 'aud-1',
      thresholds: { t1: 0.1, t2: 0.2, t3: 0.3 },
      fps: 60,
      version: 2,
    });

    const latest = useStore.getState().metadataStore?.metadata['asset-1']?.lipSync;
    expect(latest?.orphanedGeneratedAssetIds?.includes('mask-old')).toBe(true);
    expect(latest?.orphanedGeneratedAssetIds?.includes('cmp-old-4')).toBe(true);

    useStore.setState(initialState, true);
  });

  it('keeps lip sync settings and generated assets when a lip sync cut is deleted', async () => {
    resetElectronMocks();
    const initialState = useStore.getState();

    useStore.setState({
      ...initialState,
      vaultPath: 'C:/vault',
      trashPath: 'C:/vault/.trash',
      scenes: [{
        id: 'scene-1',
        name: 'Scene 1',
        order: 0,
        notes: [],
        cuts: [{
          id: 'cut-1',
          assetId: 'asset-1',
          displayTime: 1,
          order: 0,
          isLipSync: true,
          lipSyncFrameCount: 4,
          useEmbeddedAudio: true,
          audioBindings: [],
        }],
      }],
      assetCache: new Map([
        ['asset-1', { id: 'asset-1', name: 'owner.mp4', path: 'C:/vault/assets/owner.mp4', type: 'video' }],
        ['mask-1', { id: 'mask-1', name: 'mask.png', path: 'C:/vault/assets/mask.png', type: 'image' }],
        ['cmp-1', { id: 'cmp-1', name: 'cmp-1.png', path: 'C:/vault/assets/cmp-1.png', type: 'image' }],
      ]),
      metadataStore: {
        version: 1,
        sceneMetadata: {},
        metadata: {
          'asset-1': {
            assetId: 'asset-1',
            lipSync: {
              baseImageAssetId: 'base-1',
              variantAssetIds: ['v1', 'v2', 'v3'],
              ownerAssetId: 'asset-1',
              ownedGeneratedAssetIds: ['mask-1', 'cmp-1'],
              rmsSourceAudioAssetId: 'aud-1',
              thresholds: { t1: 0.1, t2: 0.2, t3: 0.3 },
              fps: 60,
              version: 2,
            },
          },
        },
      },
    }, false);

    useStore.getState().removeCut('scene-1', 'cut-1');
    await new Promise((resolve) => setTimeout(resolve, 0));

    const latest = useStore.getState();
    expect(latest.metadataStore?.metadata['asset-1']?.lipSync).toBeDefined();
    const moveToTrash = window.electronAPI?.vaultGateway.moveToTrashWithMeta as unknown as { mock: { calls: any[] } };
    expect(moveToTrash.mock.calls.length).toBe(0);

    useStore.setState(initialState, true);
  });

  it('cleans up generated lip sync assets when a lip sync cut is relinked', async () => {
    resetElectronMocks();
    const initialState = useStore.getState();

    useStore.setState({
      ...initialState,
      vaultPath: 'C:/vault',
      trashPath: 'C:/vault/.trash',
      scenes: [{
        id: 'scene-1',
        name: 'Scene 1',
        order: 0,
        notes: [],
        cuts: [{
          id: 'cut-1',
          assetId: 'asset-1',
          displayTime: 1,
          order: 0,
          isLipSync: true,
          lipSyncFrameCount: 4,
          useEmbeddedAudio: true,
          audioBindings: [],
          asset: { id: 'asset-1', name: 'owner.mp4', path: 'C:/vault/assets/owner.mp4', type: 'video' },
        }],
      }],
      assetCache: new Map([
        ['asset-1', { id: 'asset-1', name: 'owner.mp4', path: 'C:/vault/assets/owner.mp4', type: 'video' }],
        ['asset-new', { id: 'asset-new', name: 'replacement.png', path: 'C:/vault/assets/replacement.png', type: 'image' }],
        ['mask-1', { id: 'mask-1', name: 'mask.png', path: 'C:/vault/assets/mask.png', type: 'image' }],
        ['cmp-1', { id: 'cmp-1', name: 'cmp-1.png', path: 'C:/vault/assets/cmp-1.png', type: 'image' }],
      ]),
      metadataStore: {
        version: 1,
        sceneMetadata: {},
        metadata: {
          'asset-1': {
            assetId: 'asset-1',
            lipSync: {
              baseImageAssetId: 'base-1',
              variantAssetIds: ['v1', 'v2', 'v3'],
              ownerAssetId: 'asset-1',
              ownedGeneratedAssetIds: ['mask-1', 'cmp-1'],
              rmsSourceAudioAssetId: 'aud-1',
              thresholds: { t1: 0.1, t2: 0.2, t3: 0.3 },
              fps: 60,
              version: 2,
            },
          },
        },
      },
    }, false);

    useStore.getState().relinkCutAsset('scene-1', 'cut-1', {
      id: 'asset-new',
      name: 'replacement.png',
      path: 'C:/vault/assets/replacement.png',
      type: 'image',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const latest = useStore.getState();
    const cut = latest.scenes[0]?.cuts[0];
    expect(cut?.assetId).toBe('asset-new');
    expect(cut?.isLipSync).toBe(false);
    expect(latest.metadataStore?.metadata['asset-1']?.lipSync).toBeUndefined();
    const moveToTrash = window.electronAPI?.vaultGateway.moveToTrashWithMeta as unknown as { mock: { calls: any[] } };
    expect(moveToTrash.mock.calls.length).toBe(2);

    useStore.setState(initialState, true);
  });
});
