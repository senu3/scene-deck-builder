import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../useStore';
import { resetStoreWithSingleScene, TEST_IMAGE_ASSET } from './testHelpers';

describe('cut runtime state', () => {
  const initialState = useStore.getState();

  beforeEach(() => {
    resetStoreWithSingleScene(initialState, { projectName: 'Runtime Test' });
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
    useStore.getState().updateCutWithAsset('scene-1', cutId, TEST_IMAGE_ASSET, 2);

    expect(useStore.getState().getCutRuntime(cutId)).toBeUndefined();
    const scene = useStore.getState().scenes.find((s) => s.id === 'scene-1');
    const cut = scene?.cuts.find((c) => c.id === cutId);
    expect(cut?.assetId).toBe(TEST_IMAGE_ASSET.id);
    expect(cut?.displayTime).toBe(2);
  });
});
