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

  it('increments clip revision on clip update and clear', () => {
    const cutId = useStore.getState().addCutToScene('scene-1', {
      id: 'asset-video',
      name: 'v.mp4',
      path: '/vault/assets/v.mp4',
      type: 'video',
      duration: 10,
    });

    expect(useStore.getState().getCutRuntime(cutId)?.clipRevision ?? 0).toBe(0);

    useStore.getState().updateCutClipPoints('scene-1', cutId, 1, 3);
    expect(useStore.getState().getCutRuntime(cutId)?.clipRevision).toBe(1);

    useStore.getState().clearCutClipPoints('scene-1', cutId);
    expect(useStore.getState().getCutRuntime(cutId)?.clipRevision).toBe(2);
  });

  it('stores and clears hold runtime without touching persistent cut fields', () => {
    const cutId = useStore.getState().addCutToScene('scene-1', TEST_IMAGE_ASSET);
    useStore.getState().setCutRuntimeHold(cutId, {
      enabled: true,
      mode: 'tail',
      durationMs: 1200,
    });

    expect(useStore.getState().getCutRuntime(cutId)?.hold).toEqual({
      enabled: true,
      mode: 'tail',
      durationMs: 1200,
    });

    useStore.getState().clearCutRuntimeHold(cutId);
    expect(useStore.getState().getCutRuntime(cutId)).toBeUndefined();
  });

});
