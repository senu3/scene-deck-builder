import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../useStore';
import { resetElectronMocks } from '../../test/setup.renderer';

describe('metadataSlice deleteAssetWithPolicy effects flow', () => {
  const initialState = useStore.getState();

  beforeEach(() => {
    resetElectronMocks();
    useStore.setState(initialState, true);
    useStore.getState().initializeProject({
      name: 'Test',
      vaultPath: 'C:/vault',
      scenes: [
        {
          id: 'scene-1',
          name: 'Scene 1',
          order: 0,
          notes: [],
          cuts: [],
        },
      ],
    });

    useStore.setState((state) => ({
      ...state,
      trashPath: 'C:/vault/.trash',
      metadataStore: {
        version: 1,
        metadata: {
          'asset-1': { assetId: 'asset-1' },
        },
        sceneMetadata: {},
      },
      assetCache: new Map([
        ['asset-1', { id: 'asset-1', name: 'a.wav', path: 'C:/vault/assets/a.wav', type: 'audio' }],
      ]),
    }));
  });

  it('keeps metadata when index update fails', async () => {
    (window.electronAPI!.vaultGateway.moveToTrashWithMeta as any).mockResolvedValueOnce({
      success: false,
      trashedPath: 'C:/vault/.trash/a.wav',
      indexUpdated: false,
      reason: 'index-update-failed',
    });

    const result = await useStore.getState().deleteAssetWithPolicy({
      assetPath: 'C:/vault/assets/a.wav',
      assetIds: ['asset-1'],
      reason: 'test-delete',
    });

    expect(result).toMatchObject({
      success: true,
      reason: 'index-sync-failed',
    });
    expect(result.warnings).toBeUndefined();
    expect(useStore.getState().metadataStore?.metadata['asset-1']).toBeDefined();
    expect(useStore.getState().assetCache.has('asset-1')).toBe(true);
  });

  it('removes metadata when all effects succeed', async () => {
    (window.electronAPI!.vaultGateway.moveToTrashWithMeta as any).mockResolvedValueOnce({
      success: true,
      trashedPath: 'C:/vault/.trash/a.wav',
      indexUpdated: true,
    });

    const result = await useStore.getState().deleteAssetWithPolicy({
      assetPath: 'C:/vault/assets/a.wav',
      assetIds: ['asset-1'],
      reason: 'test-delete',
    });

    expect(result).toMatchObject({
      success: true,
    });
    expect(result.warnings).toBeUndefined();
    expect(useStore.getState().metadataStore?.metadata['asset-1']).toBeUndefined();
    expect(useStore.getState().assetCache.has('asset-1')).toBe(false);
  });
});
