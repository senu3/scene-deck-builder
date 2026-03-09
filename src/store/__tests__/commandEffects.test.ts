import { beforeEach, describe, expect, it } from 'vitest';
import { createMetadataDeleteEffect } from '../../features/platform/effects';
import { createCommandApplyResult } from '../commandCore';
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
});
