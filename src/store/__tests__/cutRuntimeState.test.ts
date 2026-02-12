import { beforeEach, describe, expect, it } from 'vitest';
import type { Asset } from '../../types';
import { useStore } from '../useStore';

const IMAGE_ASSET: Asset = {
  id: 'asset-1',
  name: 'image.png',
  path: 'C:/vault/assets/image.png',
  type: 'image',
};

describe('cut runtime state', () => {
  const initialState = useStore.getState();

  beforeEach(() => {
    useStore.setState(initialState, true);
    useStore.getState().initializeProject({
      name: 'Runtime Test',
      vaultPath: 'C:/vault',
      scenes: [
        { id: 'scene-1', name: 'Scene 1', order: 0, notes: [], cuts: [] },
      ],
    });
  });

  it('stores loading flags in runtime map instead of persistent cut fields', () => {
    const cutId = useStore.getState().addLoadingCutToScene('scene-1', 'asset-loading', 'loading.mp4');
    const scene = useStore.getState().scenes.find((s) => s.id === 'scene-1');
    const cut = scene?.cuts.find((c) => c.id === cutId);
    const cutRecord = (cut || {}) as Record<string, unknown>;

    expect(cut).toBeTruthy();
    expect('isLoading' in cutRecord).toBe(false);
    expect('loadingName' in cutRecord).toBe(false);
    expect(useStore.getState().getCutRuntime(cutId)).toEqual({ isLoading: true, loadingName: 'loading.mp4' });
  });

  it('clears runtime loading state when loading cut is resolved', () => {
    const cutId = useStore.getState().addLoadingCutToScene('scene-1', 'asset-loading', 'loading.mp4');
    useStore.getState().updateCutWithAsset('scene-1', cutId, IMAGE_ASSET, 2);

    expect(useStore.getState().getCutRuntime(cutId)).toBeUndefined();
    const scene = useStore.getState().scenes.find((s) => s.id === 'scene-1');
    const cut = scene?.cuts.find((c) => c.id === cutId);
    expect(cut?.assetId).toBe('asset-1');
    expect(cut?.displayTime).toBe(2);
  });
});
