import { describe, expect, it } from 'vitest';
import type { Scene } from '../../types';
import { computeGroupDerivedRange, normalizeSceneGroups, validateGroupCutGate } from '../cutGroupOps';

function makeScene(): Scene {
  return {
    id: 'scene-1',
    name: 'Scene 1',
    notes: [],
    cuts: [
      { id: 'cut-1', assetId: 'a1', displayTime: 1, order: 0 },
      { id: 'cut-2', assetId: 'a2', displayTime: 2, order: 1 },
      { id: 'cut-3', assetId: 'a3', displayTime: 3, order: 2 },
    ],
    groups: [
      { id: 'group-a', name: 'A', cutIds: ['cut-1', 'cut-2'], isCollapsed: true },
      { id: 'group-b', name: 'B', cutIds: ['cut-2', 'cut-3'], isCollapsed: true },
    ],
  };
}

describe('group gate utilities', () => {
  it('normalizes group overlap and synchronizes cut.groupId from group.cutIds', () => {
    const normalized = normalizeSceneGroups(makeScene());

    expect(normalized.groups?.map((group) => ({ id: group.id, cutIds: group.cutIds }))).toEqual([
      { id: 'group-a', cutIds: ['cut-1', 'cut-2'] },
      { id: 'group-b', cutIds: ['cut-3'] },
    ]);
    expect(normalized.cuts.map((cut) => ({ id: cut.id, groupId: cut.groupId }))).toEqual([
      { id: 'cut-1', groupId: 'group-a' },
      { id: 'cut-2', groupId: 'group-a' },
      { id: 'cut-3', groupId: 'group-b' },
    ]);
  });

  it('detects overlap and reference inconsistencies', () => {
    const issues = validateGroupCutGate([makeScene()], ['scene-1']);
    expect(issues.some((issue) => issue.code === 'group-overlap')).toBe(true);
  });

  it('computes derived range from cut timeline bounds', () => {
    const scene: Scene = {
      id: 'scene-1',
      name: 'Scene 1',
      notes: [],
      cuts: [
        { id: 'cut-1', assetId: 'a1', displayTime: 1, order: 0 },
        { id: 'cut-2', assetId: 'a2', displayTime: 4, order: 1 },
        { id: 'cut-3', assetId: 'a3', displayTime: 2, order: 2 },
      ],
      groups: [{ id: 'group-a', name: 'A', cutIds: ['cut-1', 'cut-3'], isCollapsed: false }],
    };
    const range = computeGroupDerivedRange([scene], ['scene-1'], 'scene-1', 'group-a');

    expect(range).toEqual({
      groupStartAbs: 0,
      groupEndAbs: 7,
      groupDurationAbs: 7,
    });
  });
});
