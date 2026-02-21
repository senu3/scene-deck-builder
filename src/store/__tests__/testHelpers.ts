import type { Asset } from '../../types';
import { useStore } from '../useStore';

export const TEST_IMAGE_ASSET: Asset = {
  id: 'asset-1',
  name: 'asset.png',
  path: 'C:/vault/assets/asset.png',
  type: 'image',
};

export const TEST_AUDIO_ASSET: Asset = {
  id: 'audio-1',
  name: 'aud_123.wav',
  path: 'C:/vault/assets/aud_123.wav',
  originalPath: 'D:/recordings/voice_take_01.wav',
  type: 'audio',
};

type StoreState = ReturnType<typeof useStore.getState>;

export const resetStoreWithSingleScene = (
  initialState: StoreState,
  options: { projectName?: string; sceneId?: string; sceneName?: string } = {}
): void => {
  const { projectName = 'Test', sceneId = 'scene-1', sceneName = 'Scene 1' } = options;

  useStore.setState(initialState, true);
  useStore.getState().initializeProject({
    name: projectName,
    vaultPath: 'C:/vault',
    scenes: [{ id: sceneId, name: sceneName, cuts: [], order: 0, notes: [] }],
  });
};
