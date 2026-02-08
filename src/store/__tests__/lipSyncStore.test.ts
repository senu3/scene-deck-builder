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
});
