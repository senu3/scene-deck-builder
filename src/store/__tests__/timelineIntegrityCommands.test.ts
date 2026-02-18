import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AutoClipSimpleCommand,
  RemoveCutFromGroupCommand,
  RemoveSceneCommand,
  ReorderCutsWithGroupSyncCommand,
  SetSceneAttachAudioCommand,
  UpdateGroupCutOrderCommand,
} from '../commands';
import { useStore } from '../useStore';
import type { Asset } from '../../types';

const BASE_ASSET: Asset = {
  id: 'asset-1',
  name: 'asset.png',
  path: 'C:/vault/assets/asset.png',
  type: 'image',
};

const VIDEO_ASSET: Asset = {
  id: 'video-1',
  name: 'clip.mp4',
  path: 'C:/vault/assets/clip.mp4',
  type: 'video',
  duration: 5,
};

const AUDIO_ASSET: Asset = {
  id: 'audio-1',
  name: 'bgm.wav',
  path: 'C:/vault/assets/bgm.wav',
  originalPath: 'D:/source/original-bgm.wav',
  type: 'audio',
  duration: 12,
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

    const state = useStore.getState();
    expect(state.sceneOrder).toEqual(['scene-1', 'scene-2', 'scene-3']);
    const restored = state.scenes.find((scene) => scene.id === 'scene-2');
    expect(restored?.cuts[0]?.id).toBe('cut-2-1');
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

  it('cleans up group memberships when moving multiple cuts across scenes', () => {
    useStore.getState().initializeProject({
      name: 'Move Group Test',
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
          groups: [{ id: 'group-a', name: 'GA', cutIds: ['cut-a1'], isCollapsed: true }],
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
          groups: [{ id: 'group-b', name: 'GB', cutIds: ['cut-b1', 'cut-b2'], isCollapsed: true }],
        },
      ],
    });

    useStore.getState().moveCutsToScene(['cut-a1', 'cut-b1'], 'scene-a', 1);

    const sceneA = useStore.getState().scenes.find((scene) => scene.id === 'scene-a');
    const sceneB = useStore.getState().scenes.find((scene) => scene.id === 'scene-b');

    expect(sceneA?.cuts.map((cut) => cut.id)).toEqual(['cut-a2', 'cut-a1', 'cut-b1']);
    expect(sceneA?.groups).toEqual([]);
    expect(sceneB?.cuts.map((cut) => cut.id)).toEqual(['cut-b2']);
    expect(sceneB?.groups).toEqual([{ id: 'group-b', name: 'GB', cutIds: ['cut-b2'], isCollapsed: true }]);
  });

  it('restores cut index when undoing remove from group', async () => {
    useStore.getState().initializeProject({
      name: 'Group Undo Test',
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
            { id: 'cut-a3', assetId: 'asset-1', asset: BASE_ASSET, displayTime: 1, order: 2, audioBindings: [] },
          ],
          groups: [{ id: 'group-a', name: 'GA', cutIds: ['cut-a1', 'cut-a2', 'cut-a3'], isCollapsed: true }],
        },
      ],
    });

    const command = new RemoveCutFromGroupCommand('scene-a', 'group-a', 'cut-a2');
    await command.execute();
    expect(useStore.getState().scenes[0]?.groups?.[0]?.cutIds).toEqual(['cut-a1', 'cut-a3']);

    await command.undo();
    expect(useStore.getState().scenes[0]?.groups?.[0]?.cutIds).toEqual(['cut-a1', 'cut-a2', 'cut-a3']);
  });

  it('restores previous group order on undo', async () => {
    useStore.getState().initializeProject({
      name: 'Group Order Undo Test',
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
          groups: [{ id: 'group-a', name: 'GA', cutIds: ['cut-a1', 'cut-a2'], isCollapsed: true }],
        },
      ],
    });

    const command = new UpdateGroupCutOrderCommand('scene-a', 'group-a', ['cut-a2', 'cut-a1']);
    await command.execute();
    expect(useStore.getState().scenes[0]?.groups?.[0]?.cutIds).toEqual(['cut-a2', 'cut-a1']);

    await command.undo();
    expect(useStore.getState().scenes[0]?.groups?.[0]?.cutIds).toEqual(['cut-a1', 'cut-a2']);
  });

  it('reorders cut and syncs group order in one command', async () => {
    useStore.getState().initializeProject({
      name: 'Group Reorder Sync Test',
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
            { id: 'cut-a3', assetId: 'asset-1', asset: BASE_ASSET, displayTime: 1, order: 2, audioBindings: [] },
          ],
          groups: [{ id: 'group-a', name: 'GA', cutIds: ['cut-a1', 'cut-a2', 'cut-a3'], isCollapsed: false }],
        },
      ],
    });

    const command = new ReorderCutsWithGroupSyncCommand('scene-a', ['cut-a1'], 2, 'group-a');
    await command.execute();

    const sceneAfterExecute = useStore.getState().scenes[0];
    expect(sceneAfterExecute?.cuts.map((cut) => cut.id)).toEqual(['cut-a2', 'cut-a3', 'cut-a1']);
    expect(sceneAfterExecute?.groups?.[0]?.cutIds).toEqual(['cut-a2', 'cut-a3', 'cut-a1']);

    await command.undo();

    const sceneAfterUndo = useStore.getState().scenes[0];
    expect(sceneAfterUndo?.cuts.map((cut) => cut.id)).toEqual(['cut-a1', 'cut-a2', 'cut-a3']);
    expect(sceneAfterUndo?.groups?.[0]?.cutIds).toEqual(['cut-a1', 'cut-a2', 'cut-a3']);
  });

  it('reorders multiple selected cuts in one command and keeps group timeline order', async () => {
    useStore.getState().initializeProject({
      name: 'Group Multi Reorder Sync Test',
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
            { id: 'cut-a3', assetId: 'asset-1', asset: BASE_ASSET, displayTime: 1, order: 2, audioBindings: [] },
            { id: 'cut-a4', assetId: 'asset-1', asset: BASE_ASSET, displayTime: 1, order: 3, audioBindings: [] },
          ],
          groups: [{ id: 'group-a', name: 'GA', cutIds: ['cut-a1', 'cut-a2', 'cut-a3', 'cut-a4'], isCollapsed: false }],
        },
      ],
    });

    const command = new ReorderCutsWithGroupSyncCommand('scene-a', ['cut-a2', 'cut-a3'], 4, 'group-a');
    await command.execute();

    const sceneAfterExecute = useStore.getState().scenes[0];
    expect(sceneAfterExecute?.cuts.map((cut) => cut.id)).toEqual(['cut-a1', 'cut-a4', 'cut-a2', 'cut-a3']);
    expect(sceneAfterExecute?.groups?.[0]?.cutIds).toEqual(['cut-a1', 'cut-a4', 'cut-a2', 'cut-a3']);

    await command.undo();
    const sceneAfterUndo = useStore.getState().scenes[0];
    expect(sceneAfterUndo?.cuts.map((cut) => cut.id)).toEqual(['cut-a1', 'cut-a2', 'cut-a3', 'cut-a4']);
    expect(sceneAfterUndo?.groups?.[0]?.cutIds).toEqual(['cut-a1', 'cut-a2', 'cut-a3', 'cut-a4']);
  });

  it('applies scene audio and clears only video cut audio states in one command', async () => {
    useStore.getState().initializeProject({
      name: 'Scene Audio Test',
      vaultPath: 'C:/vault',
      scenes: [{
        id: 'scene-a',
        name: 'Scene A',
        order: 0,
        notes: [],
        cuts: [
          {
            id: 'cut-video',
            assetId: VIDEO_ASSET.id,
            asset: VIDEO_ASSET,
            displayTime: 2,
            order: 0,
            useEmbeddedAudio: true,
            audioBindings: [{ id: 'b1', audioAssetId: 'audio-x', offsetSec: 0, enabled: true, kind: 'se' }],
          },
          {
            id: 'cut-image',
            assetId: BASE_ASSET.id,
            asset: BASE_ASSET,
            displayTime: 1,
            order: 1,
            useEmbeddedAudio: true,
            audioBindings: [{ id: 'b2', audioAssetId: 'audio-y', offsetSec: 0, enabled: true, kind: 'se' }],
          },
        ],
      }],
    });

    useStore.setState({
      metadataStore: {
        version: 1,
        metadata: {},
        sceneMetadata: {
          'scene-a': {
            id: 'scene-a',
            name: 'Scene A',
            notes: [],
            updatedAt: 't',
          },
        },
      },
    }, false);

    const command = new SetSceneAttachAudioCommand('scene-a', AUDIO_ASSET);
    await command.execute();

    const state = useStore.getState();
    expect(state.metadataStore?.sceneMetadata?.['scene-a']?.attachAudio?.audioAssetId).toBe('audio-1');
    expect(state.metadataStore?.sceneMetadata?.['scene-a']?.attachAudio?.sourceName).toBe('original-bgm.wav');

    const videoCut = state.scenes[0]?.cuts.find((cut) => cut.id === 'cut-video');
    const imageCut = state.scenes[0]?.cuts.find((cut) => cut.id === 'cut-image');
    expect(videoCut?.audioBindings).toEqual([]);
    expect(videoCut?.useEmbeddedAudio).toBe(false);
    expect(imageCut?.audioBindings?.length).toBe(1);
    expect(imageCut?.useEmbeddedAudio).toBe(true);

    await command.undo();
    const restored = useStore.getState();
    expect(restored.metadataStore?.sceneMetadata?.['scene-a']?.attachAudio).toBeUndefined();
    const restoredVideo = restored.scenes[0]?.cuts.find((cut) => cut.id === 'cut-video');
    expect(restoredVideo?.audioBindings?.length).toBe(1);
    expect(restoredVideo?.useEmbeddedAudio).toBe(true);
  });

  it('creates simple auto clips, keeps source cut as plain clips, and supports undo/redo', async () => {
    useStore.getState().initializeProject({
      name: 'Simple AutoClip Test',
      vaultPath: 'C:/vault',
      scenes: [{
        id: 'scene-auto',
        name: 'Scene Auto',
        order: 0,
        notes: [],
        cuts: [{
          id: 'cut-auto',
          assetId: VIDEO_ASSET.id,
          asset: { ...VIDEO_ASSET, duration: 12, path: 'C:/vault/assets/clip.mp4' },
          displayTime: 12,
          order: 0,
          audioBindings: [],
        }],
      }],
    });

    const command = new AutoClipSimpleCommand('scene-auto', 'cut-auto', 'default', {
      analyzeRms: async () => null,
    });
    await command.execute();

    const sceneAfterExecute = useStore.getState().scenes.find((scene) => scene.id === 'scene-auto');
    expect(command.getOutcome()).toBe('created');
    expect(command.getCreatedCount()).toBeGreaterThan(0);
    expect(command.getCreatedCount()).toBeLessThanOrEqual(12);
    expect(sceneAfterExecute?.cuts[0]?.id).toBe('cut-auto');
    expect(sceneAfterExecute?.cuts.length).toBe(1 + command.getCreatedCount());
    expect(sceneAfterExecute?.cuts.slice(1).every((cut) => cut.isClip)).toBe(true);
    expect(sceneAfterExecute?.cuts.slice(1).every((cut) => cut.displayTime >= 1)).toBe(true);
    expect(sceneAfterExecute?.groups?.length ?? 0).toBe(0);

    await command.undo();
    const sceneAfterUndo = useStore.getState().scenes.find((scene) => scene.id === 'scene-auto');
    expect(sceneAfterUndo?.cuts.map((cut) => cut.id)).toEqual(['cut-auto']);
    expect(sceneAfterUndo?.groups?.length ?? 0).toBe(0);

    await command.execute();
    const sceneAfterRedo = useStore.getState().scenes.find((scene) => scene.id === 'scene-auto');
    expect(sceneAfterRedo?.cuts.length).toBe(1 + command.getCreatedCount());
  });

  it('caps aggressive simple auto clip generation to maxCuts', async () => {
    useStore.getState().initializeProject({
      name: 'Simple AutoClip maxCuts',
      vaultPath: 'C:/vault',
      scenes: [{
        id: 'scene-auto-max',
        name: 'Scene Auto Max',
        order: 0,
        notes: [],
        cuts: [{
          id: 'cut-auto-max',
          assetId: VIDEO_ASSET.id,
          asset: { ...VIDEO_ASSET, duration: 80, path: 'C:/vault/assets/clip-long.mp4' },
          displayTime: 80,
          order: 0,
          audioBindings: [],
        }],
      }],
    });

    const command = new AutoClipSimpleCommand('scene-auto-max', 'cut-auto-max', 'aggressive', {
      analyzeRms: async () => null,
    });
    await command.execute();

    expect(command.getOutcome()).toBe('created');
    expect(command.getCreatedCount()).toBe(16);
  });

  it('falls back to fixed split when analysis fails', async () => {
    useStore.getState().initializeProject({
      name: 'Simple AutoClip fallback',
      vaultPath: 'C:/vault',
      scenes: [{
        id: 'scene-auto-fallback',
        name: 'Scene Auto Fallback',
        order: 0,
        notes: [],
        cuts: [{
          id: 'cut-auto-fallback',
          assetId: VIDEO_ASSET.id,
          asset: { ...VIDEO_ASSET, duration: 10, path: 'C:/vault/assets/clip-fallback.mp4' },
          displayTime: 10,
          order: 0,
          audioBindings: [],
        }],
      }],
    });

    const command = new AutoClipSimpleCommand('scene-auto-fallback', 'cut-auto-fallback', 'default', {
      analyzeRms: async () => {
        throw new Error('decode failed');
      },
    });
    await command.execute();

    expect(command.getOutcome()).toBe('created');
    expect(command.getCreatedCount()).toBeGreaterThan(0);
  });
});
