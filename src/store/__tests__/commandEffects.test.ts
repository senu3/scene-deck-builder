import { beforeEach, describe, expect, it } from 'vitest';
import { createMetadataDeleteEffect } from '../../features/platform/effects';
import { createCommandApplyResult } from '../commandCore';
import { AddSceneCommand, DeleteGroupCommand, SetSceneAttachAudioCommand } from '../commands';
import { useHistoryStore, type Command } from '../historyStore';
import { useStore } from '../useStore';
import { resetElectronMocks } from '../../test/setup.renderer';

describe('command apply effects', () => {
  const initialState = useStore.getState();

  beforeEach(() => {
    resetElectronMocks();
    useHistoryStore.getState().clear();
    useStore.setState(initialState, true);
    useStore.getState().initializeProject({
      name: 'Test',
      vaultPath: 'C:/vault',
      scenes: [
        {
          id: 'scene-1',
          name: 'Scene 1',
          order: 0,
          notes: [],
          cuts: [],
        },
      ],
    });

    useStore.setState((state) => ({
      ...state,
      metadataStore: {
        version: 1,
        metadata: {
          'asset-1': { assetId: 'asset-1' },
        },
        sceneMetadata: {},
      },
      assetCache: new Map([
        ['asset-1', { id: 'asset-1', name: 'a.wav', path: 'C:/vault/assets/a.wav', type: 'audio' }],
      ]),
    }));
  });

  it('dispatches apply effects after command execution', async () => {
    const command: Command = {
      type: 'TEST_METADATA_DELETE',
      description: 'delete metadata through apply',
      apply: async () => createCommandApplyResult([
        createMetadataDeleteEffect({
          assetIds: ['asset-1'],
        }),
      ]),
      execute: async () => undefined,
      undo: async () => undefined,
    };

    await useHistoryStore.getState().executeCommand(command);

    expect(useStore.getState().metadataStore?.metadata['asset-1']).toBeUndefined();
    expect(useStore.getState().assetCache.has('asset-1')).toBe(false);
    expect(useHistoryStore.getState().canUndo()).toBe(true);
  });

  it('evaluates apply after execute so scene metadata save can use updated state', async () => {
    const initialSceneCount = useStore.getState().scenes.length;
    await useHistoryStore.getState().executeCommand(new AddSceneCommand('Scene 2'));

    expect(window.electronAPI?.saveProject).toHaveBeenCalledTimes(1);
    expect(useStore.getState().scenes).toHaveLength(initialSceneCount + 1);
    expect(useStore.getState().metadataStore).not.toBeNull();
    expect(Object.keys(useStore.getState().metadataStore?.sceneMetadata || {})).not.toHaveLength(0);
  });

  it('saves scene audio metadata on execute but not on undo', async () => {
    await useHistoryStore.getState().executeCommand(new SetSceneAttachAudioCommand('scene-1', {
      id: 'audio-2',
      name: 'scene.wav',
      originalPath: 'D:/source/scene.wav',
      path: 'C:/vault/assets/scene.wav',
      type: 'audio',
    }));

    expect(window.electronAPI?.saveProject).toHaveBeenCalledTimes(1);
    expect(useStore.getState().getSceneAudioBinding('scene-1')?.audioAssetId).toBe('audio-2');

    await useHistoryStore.getState().undo();

    expect(window.electronAPI?.saveProject).toHaveBeenCalledTimes(1);
    expect(useStore.getState().getSceneAudioBinding('scene-1')).toBeUndefined();
  });

  it('saves group metadata clearing on execute but restores only state on undo', async () => {
    useStore.setState((state) => ({
      ...state,
      scenes: state.scenes.map((scene) => (
        scene.id === 'scene-1'
          ? {
              ...scene,
              cuts: [{
                id: 'cut-1',
                assetId: 'asset-1',
                displayTime: 1,
                order: 0,
                audioBindings: [],
              }],
              groups: [{ id: 'group-1', name: 'Group 1', cutIds: ['cut-1'], isCollapsed: true }],
            }
          : scene
      )),
      metadataStore: {
        version: 1,
        metadata: {
          'asset-1': { assetId: 'asset-1' },
        },
        sceneMetadata: {
          'scene-1': {
            id: 'scene-1',
            name: 'Scene 1',
            notes: [],
            updatedAt: 't',
            groupAudioBindings: {
              'group-1': {
                id: 'binding-1',
                groupId: 'group-1',
                audioAssetId: 'audio-1',
                sourceName: 'group.wav',
                gain: 1,
                enabled: true,
                kind: 'group',
              },
            },
          },
        },
      },
    }));

    await useHistoryStore.getState().executeCommand(new DeleteGroupCommand('scene-1', 'group-1'));

    expect(window.electronAPI?.saveProject).toHaveBeenCalledTimes(1);
    expect(useStore.getState().getGroupAudioBinding('scene-1', 'group-1')).toBeUndefined();

    await useHistoryStore.getState().undo();

    expect(window.electronAPI?.saveProject).toHaveBeenCalledTimes(1);
    expect(useStore.getState().scenes[0]?.groups?.[0]?.id).toBe('group-1');
    expect(useStore.getState().getGroupAudioBinding('scene-1', 'group-1')?.audioAssetId).toBe('audio-1');
  });
});
