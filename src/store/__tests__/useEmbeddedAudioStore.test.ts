import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../useStore';
import type { Asset } from '../../types';

const BASE_ASSET: Asset = {
  id: 'asset-1',
  name: 'asset.png',
  path: 'C:/vault/assets/asset.png',
  type: 'image',
};

describe('useEmbeddedAudio store behavior', () => {
  const initialState = useStore.getState();

  beforeEach(() => {
    useStore.setState(initialState, true);
    useStore.getState().initializeProject({
      name: 'Test',
      vaultPath: 'C:/vault',
      scenes: [{ id: 'scene-1', name: 'Scene 1', cuts: [], order: 0, notes: [] }],
    });
  });

  it('treats undefined useEmbeddedAudio as true when project is initialized', () => {
    useStore.getState().initializeProject({
      name: 'Legacy',
      vaultPath: 'C:/vault',
      scenes: [{
        id: 'scene-1',
        name: 'Scene 1',
        order: 0,
        notes: [],
        cuts: [{
          id: 'cut-1',
          assetId: 'asset-1',
          displayTime: 1,
          order: 0,
          audioBindings: [],
        } as any],
      }],
    });

    const cut = useStore.getState().scenes[0]?.cuts[0];
    expect(cut?.useEmbeddedAudio).toBe(true);
  });

  it('defaults new cuts to useEmbeddedAudio=true', () => {
    const cutId = useStore.getState().addCutToScene('scene-1', BASE_ASSET);
    const cut = useStore.getState().scenes[0]?.cuts.find((c) => c.id === cutId);
    expect(cut?.useEmbeddedAudio).toBe(true);
  });

  it('updates useEmbeddedAudio for a specific cut', () => {
    const cutId = useStore.getState().addCutToScene('scene-1', BASE_ASSET);
    useStore.getState().setCutUseEmbeddedAudio('scene-1', cutId, false);

    const cut = useStore.getState().scenes[0]?.cuts.find((c) => c.id === cutId);
    expect(cut?.useEmbeddedAudio).toBe(false);
  });

  it('defaults pasted cuts to true when clipboard value is undefined', () => {
    useStore.setState({
      clipboard: [{
        assetId: 'asset-1',
        asset: BASE_ASSET,
        displayTime: 1,
        audioBindings: [],
      }],
    }, false);

    const [cutId] = useStore.getState().pasteCuts('scene-1');
    const cut = useStore.getState().scenes[0]?.cuts.find((c) => c.id === cutId);
    expect(cut?.useEmbeddedAudio).toBe(true);
  });

  it('preserves lip sync flags when pasting cuts', () => {
    useStore.setState({
      clipboard: [{
        assetId: 'asset-1',
        asset: BASE_ASSET,
        displayTime: 1,
        audioBindings: [],
        isLipSync: true,
        lipSyncFrameCount: 4,
      }],
    }, false);

    const [cutId] = useStore.getState().pasteCuts('scene-1');
    const cut = useStore.getState().scenes[0]?.cuts.find((c) => c.id === cutId);
    expect(cut?.isLipSync).toBe(true);
    expect(cut?.lipSyncFrameCount).toBe(4);
  });
});
