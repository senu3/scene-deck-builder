import { describe, expect, it } from 'vitest';
import type { Scene } from '../../types';
import { getSceneIndex, resolveSceneById } from '../sceneOrder';

function makeScene(id: string, name: string): Scene {
  return {
    id,
    name,
    cuts: [],
    notes: [],
  };
}

describe('sceneOrder helpers', () => {
  it('resolves scene by sceneId', () => {
    const scenes = [makeScene('scene-1', 'A'), makeScene('scene-2', 'B')];
    expect(resolveSceneById(scenes, 'scene-2')?.name).toBe('B');
    expect(resolveSceneById(scenes, 'missing')).toBeUndefined();
  });

  it('computes scene index from sceneOrder', () => {
    const scenes = [makeScene('scene-1', 'A'), makeScene('scene-2', 'B')];
    const sceneOrder = ['scene-2', 'scene-1'];
    expect(getSceneIndex(scenes, sceneOrder, 'scene-2')).toBe(0);
    expect(getSceneIndex(scenes, sceneOrder, 'scene-1')).toBe(1);
  });

  it('returns stable index for same sceneId regardless scenes array order', () => {
    const sceneA = makeScene('scene-a', 'Scene A');
    const sceneB = makeScene('scene-b', 'Scene B');
    const sceneOrder = ['scene-b', 'scene-a'];

    expect(getSceneIndex([sceneA, sceneB], sceneOrder, 'scene-a')).toBe(1);
    expect(getSceneIndex([sceneB, sceneA], sceneOrder, 'scene-a')).toBe(1);
  });
});
