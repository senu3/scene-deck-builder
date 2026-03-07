import { describe, expect, it } from 'vitest';
import type { Asset, Cut, Scene } from '../../types';
import { computeCanonicalStoryTimingsForCuts, computeStoryTimings, computeStoryTimingsForCuts } from '../storyTiming';

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

  it('exposes canonical duration maps derived from normalized timings', () => {
    const cuts: Cut[] = [
      { id: 'c1', assetId: 'a1', displayTime: Number.NaN, order: 0 },
      { id: 'c2', assetId: 'a2', displayTime: 0, order: 1 },
      { id: 'c3', assetId: 'a3', displayTime: 2.5, order: 2 },
    ];
    const assets = new Map<string, Asset>([
      ['a1', { id: 'a1', name: 'video-1', type: 'video', path: '/tmp/1.mp4', duration: 4 }],
      ['a2', { id: 'a2', name: 'img-2', type: 'image', path: '/tmp/2.png' }],
      ['a3', { id: 'a3', name: 'img-3', type: 'image', path: '/tmp/3.png' }],
    ]);

    const timings = computeCanonicalStoryTimingsForCuts(
      cuts.map((cut) => ({ cut, sceneId: 's1' })),
      (assetId) => assets.get(assetId),
      { fallbackDurationSec: 1.0, preferAssetDuration: true }
    );

    expect(timings.normalizedDurationByCutId.get('c1')).toBe(4);
    expect(timings.normalizedDurationByCutId.get('c2')).toBe(1);
    expect(timings.normalizedCutByCutId.get('c1')?.adjusted).toBe(true);
    expect(timings.normalizedCutByCutId.get('c3')?.adjusted).toBe(false);
    expect(timings.cutTimings.get('c3')?.startSec).toBe(5);
    expect(timings.totalDurationSec).toBe(7.5);
  });

  it('uses clip in/out duration as canonical preview/export timing source', () => {
    const cuts: Cut[] = [
      { id: 'clip-1', assetId: 'v1', displayTime: 5, order: 0, isClip: true, inPoint: 2, outPoint: 3.5 },
      { id: 'clip-2', assetId: 'v2', displayTime: 2, order: 1 },
    ];
    const assets = new Map<string, Asset>([
      ['v1', { id: 'v1', name: 'video-1', type: 'video', path: '/tmp/1.mp4', duration: 10 }],
      ['v2', { id: 'v2', name: 'video-2', type: 'video', path: '/tmp/2.mp4', duration: 2 }],
    ]);

    const timings = computeCanonicalStoryTimingsForCuts(
      cuts.map((cut) => ({ cut, sceneId: 's1' })),
      (assetId) => assets.get(assetId),
      { fallbackDurationSec: 1.0, preferAssetDuration: true }
    );

    expect(timings.normalizedDurationByCutId.get('clip-1')).toBeCloseTo(1.5, 6);
    expect(timings.normalizedCutByCutId.get('clip-1')?.source).toBe('clipDuration');
    expect(timings.cutTimings.get('clip-2')?.startSec).toBeCloseTo(1.5, 6);
    expect(timings.totalDurationSec).toBeCloseTo(3.5, 6);
  });
});
