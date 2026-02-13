import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../useStore';
import type { Asset } from '../../types';

const IMAGE_ASSET: Asset = {
  id: 'asset-1',
  name: 'asset.png',
  path: 'C:/vault/assets/asset.png',
  type: 'image',
};

const AUDIO_ASSET: Asset = {
  id: 'audio-1',
  name: 'aud_123.wav',
  path: 'C:/vault/assets/aud_123.wav',
  originalPath: 'D:/recordings/voice_take_01.wav',
  type: 'audio',
};

describe('audio binding display name', () => {
  const initialState = useStore.getState();

  beforeEach(() => {
    useStore.setState(initialState, true);
    useStore.getState().initializeProject({
      name: 'Test',
      vaultPath: 'C:/vault',
      scenes: [{ id: 'scene-1', name: 'Scene 1', cuts: [], order: 0, notes: [] }],
    });
  });

  it('uses original file name as sourceName when attaching audio to cut', () => {
    const cutId = useStore.getState().addCutToScene('scene-1', IMAGE_ASSET);
    useStore.getState().attachAudioToCut('scene-1', cutId, AUDIO_ASSET);

    const cut = useStore.getState().scenes[0]?.cuts.find((item) => item.id === cutId);
    expect(cut?.audioBindings?.[0]?.sourceName).toBe('voice_take_01.wav');
  });
});
