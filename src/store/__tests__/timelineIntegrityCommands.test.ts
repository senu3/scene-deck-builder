import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AutoClipVideoCutCommand,
  RemoveCutFromGroupCommand,
  RemoveSceneCommand,
  ReorderCutsWithGroupSyncCommand,
  SetSceneAttachAudioCommand,
  UpdateCutSubtitleCommand,
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

  it('updates cut subtitle and restores on undo', async () => {
    useStore.getState().initializeProject({
      name: 'Subtitle command test',
      vaultPath: 'C:/vault',
      scenes: [{
        id: 'scene-sub',
        name: 'Scene Subtitle',
        order: 0,
        notes: [],
        cuts: [{
          id: 'cut-sub',
          assetId: BASE_ASSET.id,
          asset: BASE_ASSET,
          displayTime: 2,
          order: 0,
          audioBindings: [],
        }],
      }],
    });

    const command = new UpdateCutSubtitleCommand('scene-sub', 'cut-sub', {
      text: 'line1\nline2',
      range: { start: 0.2, end: 1.4 },
    });
    await command.execute();

    const updatedCut = useStore.getState().scenes[0]?.cuts[0];
    expect(updatedCut?.subtitle?.text).toBe('line1\nline2');
    expect(updatedCut?.subtitle?.range).toEqual({ start: 0.2, end: 1.4 });

    await command.undo();
    const restoredCut = useStore.getState().scenes[0]?.cuts[0];
    expect(restoredCut?.subtitle).toBeUndefined();
  });

  it('auto clips source cut, creates collapsed group, and restores on undo', async () => {
    useStore.getState().initializeProject({
      name: 'AutoClip Command Test',
      vaultPath: 'C:/vault',
      scenes: [
        {
          id: 'scene-1',
          name: 'Scene 1',
          order: 0,
          notes: [],
          cuts: [
            {
              id: 'cut-source',
              assetId: VIDEO_ASSET.id,
              asset: VIDEO_ASSET,
              displayTime: 10,
              order: 0,
              isClip: false,
              useEmbeddedAudio: true,
              audioBindings: [],
            },
          ],
          groups: [],
        },
      ],
    });

    const command = new AutoClipVideoCutCommand(
      'scene-1',
      'cut-source',
      [
        { inPoint: 0, outPoint: 2 },
        { inPoint: 2, outPoint: 5 },
      ],
      true
    );
    await command.execute();

    const afterExecute = useStore.getState().scenes[0];
    expect(afterExecute?.cuts.length).toBe(3);
    expect(afterExecute?.cuts[0]?.id).toBe('cut-source');
    expect(afterExecute?.cuts[1]?.isClip).toBe(true);
    expect(afterExecute?.cuts[1]?.inPoint).toBe(0);
    expect(afterExecute?.cuts[1]?.outPoint).toBe(2);
    expect(afterExecute?.groups?.length).toBe(1);
    expect(afterExecute?.groups?.[0]?.isCollapsed).toBe(true);
    expect(afterExecute?.groups?.[0]?.cutIds[0]).toBe('cut-source');

    await command.undo();

    const afterUndo = useStore.getState().scenes[0];
    expect(afterUndo?.cuts.map((cut) => cut.id)).toEqual(['cut-source']);
    expect(afterUndo?.groups ?? []).toEqual([]);
  });
});
