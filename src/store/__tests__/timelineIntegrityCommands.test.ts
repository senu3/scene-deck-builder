import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoveSceneCommand } from '../commands';
import { useStore } from '../useStore';
import type { Asset } from '../../types';

const BASE_ASSET: Asset = {
  id: 'asset-1',
  name: 'asset.png',
  path: 'C:/vault/assets/asset.png',
  type: 'image',
};

describe('timeline integrity commands', () => {
  const initialState = useStore.getState();

  beforeEach(() => {
    useStore.setState(initialState, true);
    useStore.getState().initializeProject({
      name: 'Test',
      vaultPath: 'C:/vault',
      scenes: [
        { id: 'scene-1', name: 'Scene 1', order: 0, notes: [], cuts: [] },
        {
          id: 'scene-2',
          name: 'Scene 2',
          order: 1,
          notes: [],
          cuts: [{ id: 'cut-2-1', assetId: 'asset-1', asset: BASE_ASSET, displayTime: 1, order: 0, audioBindings: [] }],
        },
        { id: 'scene-3', name: 'Scene 3', order: 2, notes: [], cuts: [] },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('restores removed scene at original index on undo', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));

    const command = new RemoveSceneCommand('scene-2');
    await command.execute();
    expect(useStore.getState().scenes.map((scene) => scene.id)).toEqual(['scene-1', 'scene-3']);

    await command.undo();

    const scenes = useStore.getState().scenes;
    expect(scenes.map((scene) => scene.id)).toEqual(['scene-1', 'scene-2', 'scene-3']);
    expect(scenes.map((scene) => scene.order)).toEqual([0, 1, 2]);
    expect(scenes[1].cuts[0]?.id).toBe('cut-2-1');
  });

  it('moves multiple cuts in timeline order regardless of input id order', () => {
    useStore.getState().initializeProject({
      name: 'Move Test',
      vaultPath: 'C:/vault',
      scenes: [
        {
          id: 'scene-a',
          name: 'Scene A',
          order: 0,
          notes: [],
          cuts: [
            { id: 'cut-a1', assetId: 'asset-1', asset: BASE_ASSET, displayTime: 1, order: 0, audioBindings: [] },
            { id: 'cut-a2', assetId: 'asset-1', asset: BASE_ASSET, displayTime: 1, order: 1, audioBindings: [] },
          ],
        },
        {
          id: 'scene-b',
          name: 'Scene B',
          order: 1,
          notes: [],
          cuts: [
            { id: 'cut-b1', assetId: 'asset-1', asset: BASE_ASSET, displayTime: 1, order: 0, audioBindings: [] },
            { id: 'cut-b2', assetId: 'asset-1', asset: BASE_ASSET, displayTime: 1, order: 1, audioBindings: [] },
          ],
        },
      ],
    });

    useStore.getState().moveCutsToScene(['cut-b2', 'cut-a1', 'cut-b1'], 'scene-a', 2);
    const sceneA = useStore.getState().scenes.find((scene) => scene.id === 'scene-a');
    expect(sceneA?.cuts.map((cut) => cut.id)).toEqual(['cut-a2', 'cut-a1', 'cut-b1', 'cut-b2']);
  });
});
