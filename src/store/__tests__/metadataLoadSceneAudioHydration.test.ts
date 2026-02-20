import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../useStore';
import { resetElectronMocks } from '../../test/setup.renderer';

describe('metadata load scene-audio hydration', () => {
  const initialState = useStore.getState();

  beforeEach(() => {
    resetElectronMocks();
    useStore.setState(initialState, true);
    useStore.getState().initializeProject({
      name: 'Test',
      vaultPath: 'C:/vault',
      scenes: [{ id: 'scene-1', name: 'Scene 1', cuts: [], notes: [] }],
    });
  });

  it('hydrates scene attachAudio assets into assetCache from index on load', async () => {
    (window.electronAPI!.pathExists as any).mockResolvedValue(true);
    (window.electronAPI!.loadProjectFromPath as any).mockResolvedValue({
      data: {
        version: 1,
        metadata: {},
        sceneMetadata: {
          'scene-1': {
            id: 'scene-1',
            name: 'Scene 1',
            notes: [],
            updatedAt: 't',
            attachAudio: {
              id: 'sa-1',
              audioAssetId: 'aud-1',
              enabled: true,
              kind: 'scene',
            },
          },
        },
      },
      path: 'C:/vault/.metadata.json',
    });
    (window.electronAPI!.loadAssetIndex as any).mockResolvedValue({
      version: 1,
      assets: [
        {
          id: 'aud-1',
          hash: 'hash-aud-1',
          filename: 'aud_1.wav',
          originalName: 'bgm.wav',
          originalPath: 'imports/bgm.wav',
          type: 'audio',
          fileSize: 1024,
          importedAt: '2026-02-20T00:00:00.000Z',
        },
      ],
    });
    (window.electronAPI!.resolveVaultPath as any).mockResolvedValue({
      absolutePath: 'C:/vault/assets/aud_1.wav',
      exists: true,
    });

    await useStore.getState().loadMetadata('C:/vault');

    const state = useStore.getState();
    const binding = state.getSceneAudioBinding('scene-1');
    const attached = state.getAttachedAudioForScene('scene-1');
    expect(binding?.audioAssetId).toBe('aud-1');
    expect(attached?.id).toBe('aud-1');
    expect(attached?.type).toBe('audio');
    expect(attached?.path).toBe('C:/vault/assets/aud_1.wav');
  });
});
