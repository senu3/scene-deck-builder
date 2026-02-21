import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../useStore';
import { resetStoreWithSingleScene, TEST_AUDIO_ASSET, TEST_IMAGE_ASSET } from './testHelpers';

describe('audio binding display name', () => {
  const initialState = useStore.getState();

  beforeEach(() => {
    resetStoreWithSingleScene(initialState);
  });

  it('uses original file name as sourceName when attaching audio to cut', () => {
    const cutId = useStore.getState().addCutToScene('scene-1', TEST_IMAGE_ASSET);
    useStore.getState().attachAudioToCut('scene-1', cutId, TEST_AUDIO_ASSET);

    const cut = useStore.getState().scenes[0]?.cuts.find((item) => item.id === cutId);
    expect(cut?.audioBindings?.[0]?.sourceName).toBe('voice_take_01.wav');
  });
});
