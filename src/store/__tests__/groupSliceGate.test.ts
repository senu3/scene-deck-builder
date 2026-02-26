import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../useStore';
import type { Scene } from '../../types';

function buildScene(): Scene {
  return {
    id: 'scene-1',
    name: 'Scene 1',
    notes: [],
    cuts: [
      { id: 'cut-1', assetId: 'a1', displayTime: 1, order: 0 },
      { id: 'cut-2', assetId: 'a2', displayTime: 1, order: 1 },
      { id: 'cut-3', assetId: 'a3', displayTime: 1, order: 2 },
      { id: 'cut-4', assetId: 'a4', displayTime: 1, order: 3 },
    ],
    groups: [{ id: 'group-a', name: 'A', cutIds: ['cut-1', 'cut-2'], isCollapsed: true }],
  };
}

describe('group slice gate behavior', () => {
  const initialState = useStore.getState();

  beforeEach(() => {
    useStore.setState(initialState, true);
    useStore.getState().initializeProject({
      name: 'Group Gate',
      vaultPath: 'C:/vault',
      scenes: [buildScene()],
      sceneOrder: ['scene-1'],
    });
  });

  it('rejects creating group with already-grouped cuts', () => {
    const result = useStore.getState().createGroup('scene-1', ['cut-1', 'cut-3'], 'B');
    const scene = useStore.getState().scenes[0];
    expect(result).toBe('');
    expect(scene?.groups?.map((group) => group.id)).toEqual(['group-a']);
  });

  it('synchronizes cut.groupId on create/delete', () => {
    const groupId = useStore.getState().createGroup('scene-1', ['cut-3', 'cut-4'], 'B');
    let scene = useStore.getState().scenes[0];
    expect(groupId).not.toBe('');
    expect(scene?.cuts.find((cut) => cut.id === 'cut-3')?.groupId).toBe(groupId);
    expect(scene?.cuts.find((cut) => cut.id === 'cut-4')?.groupId).toBe(groupId);

    useStore.getState().deleteGroup('scene-1', groupId);
    scene = useStore.getState().scenes[0];
    expect(scene?.cuts.find((cut) => cut.id === 'cut-3')?.groupId).toBeUndefined();
    expect(scene?.cuts.find((cut) => cut.id === 'cut-4')?.groupId).toBeUndefined();
  });

  it('removes group audio binding when group is deleted', () => {
    useStore.setState({
      metadataStore: {
        version: 1,
        metadata: {},
        sceneMetadata: {
          'scene-1': {
            id: 'scene-1',
            name: 'Scene 1',
            notes: [],
            updatedAt: 't',
            groupAudioBindings: {
              'group-a': {
                id: 'ga-1',
                groupId: 'group-a',
                audioAssetId: 'aud-1',
                enabled: true,
                kind: 'group',
              },
            },
          },
        },
      },
    }, false);

    useStore.getState().deleteGroup('scene-1', 'group-a');
    const binding = useStore.getState().getGroupAudioBinding('scene-1', 'group-a');
    expect(binding).toBeUndefined();
  });

  it('splits and merges groups while preserving no-overlap', () => {
    const newGroupId = useStore.getState().splitGroup('scene-1', 'group-a', 'cut-2');
    expect(newGroupId).toBeTruthy();

    let scene = useStore.getState().scenes[0];
    const first = scene?.groups?.find((group) => group.id === 'group-a');
    const second = scene?.groups?.find((group) => group.id === newGroupId);
    expect(first?.cutIds).toEqual(['cut-1']);
    expect(second?.cutIds).toEqual(['cut-2']);

    const merged = useStore.getState().mergeGroups('scene-1', 'group-a', newGroupId as string);
    expect(merged).toBe(true);
    scene = useStore.getState().scenes[0];
    expect(scene?.groups?.find((group) => group.id === 'group-a')?.cutIds).toEqual(['cut-1', 'cut-2']);
    expect(scene?.groups?.some((group) => group.id === newGroupId)).toBe(false);
  });
});
