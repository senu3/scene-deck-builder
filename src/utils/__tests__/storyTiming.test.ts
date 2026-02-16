import { describe, expect, it } from 'vitest';
import type { Scene } from '../../types';
import { computeStoryTimings, computeStoryTimingsForCuts } from '../storyTiming';

describe('storyTiming', () => {
  it('computes scene/cut starts from sceneOrder + displayTime', () => {
    const scenes: Scene[] = [
      {
        id: 'scene-a',
        name: 'A',
        notes: [],
        cuts: [
          { id: 'cut-a1', assetId: 'v1', displayTime: 2, order: 0 },
          { id: 'cut-a2', assetId: 'v2', displayTime: 3, order: 1 },
        ],
      },
      {
        id: 'scene-b',
        name: 'B',
        notes: [],
        cuts: [
          { id: 'cut-b1', assetId: 'v3', displayTime: 5, order: 0 },
        ],
      },
    ];

    const timings = computeStoryTimings(scenes, ['scene-b', 'scene-a']);
    expect(timings.sceneTimings.get('scene-b')?.startSec).toBe(0);
    expect(timings.sceneTimings.get('scene-b')?.durationSec).toBe(5);
    expect(timings.sceneTimings.get('scene-a')?.startSec).toBe(5);
    expect(timings.sceneTimings.get('scene-a')?.durationSec).toBe(5);
    expect(timings.cutTimings.get('cut-b1')?.startSec).toBe(0);
    expect(timings.cutTimings.get('cut-a1')?.startSec).toBe(5);
    expect(timings.cutTimings.get('cut-a2')?.startSec).toBe(7);
    expect(timings.totalDurationSec).toBe(10);
  });

  it('computes timings directly from ordered cut inputs', () => {
    const timings = computeStoryTimingsForCuts([
      { cutId: 'c1', sceneId: 's1', displayTime: 1.5 },
      { cutId: 'c2', sceneId: 's1', displayTime: 2.5 },
      { cutId: 'c3', sceneId: 's2', displayTime: 4.0 },
    ]);

    expect(timings.sceneTimings.get('s1')).toEqual({ startSec: 0, durationSec: 4 });
    expect(timings.sceneTimings.get('s2')).toEqual({ startSec: 4, durationSec: 4 });
    expect(timings.cutTimings.get('c2')?.startSec).toBe(1.5);
    expect(timings.totalDurationSec).toBe(8);
  });
});
