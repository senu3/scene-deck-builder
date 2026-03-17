import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Scene } from '../../types';
import { buildSequenceItemsForCuts, buildSequenceItemsForExport, resolveFramingParams } from '../exportSequence';
import { mapAssetsById } from './testHelpers';

const imageAsset = {
  id: 'asset-image',
  name: 'image.png',
  path: '/tmp/image.png',
  type: 'image' as const,
};

const videoAsset = {
  id: 'asset-video',
  name: 'video.mp4',
  path: '/tmp/video.mp4',
  type: 'video' as const,
  duration: 4.2,
};

describe('buildSequenceItemsForExport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds export sequence from timeline order (sceneOrder -> cut.order)', () => {
    const scenes: Scene[] = [
      {
        id: 'scene-2',
        name: 'Scene 2',
        order: 1,
        notes: [],
        cuts: [
          { id: 'cut-2b', assetId: 'asset-video', asset: videoAsset, order: 1, displayTime: 2.0 },
          { id: 'cut-2a', assetId: 'asset-image', asset: imageAsset, order: 0, displayTime: 1.5 },
        ],
      },
      {
        id: 'scene-1',
        name: 'Scene 1',
        order: 0,
        notes: [],
        cuts: [{ id: 'cut-1a', assetId: 'asset-image', asset: imageAsset, order: 0, displayTime: 3.0 }],
      },
    ];

    const assets = mapAssetsById([imageAsset, videoAsset]);
    const items = buildSequenceItemsForExport(scenes, ['scene-1', 'scene-2'], {
      resolveAssetById: (assetId) => assets.get(assetId),
    });
    expect(items.map((item) => item.duration)).toEqual([3.0, 1.5, 2.0]);
    expect(items.every((item) => item.framingMode === 'cover' && item.framingAnchor === 'center')).toBe(true);
  });

  it('guards invalid displayTime with fallback and warning', () => {
    const warnings: string[] = [];
    const scenes: Scene[] = [{
      id: 'scene-1',
      name: 'Scene 1',
      order: 0,
      notes: [],
      cuts: [
        { id: 'cut-video', assetId: 'asset-video', asset: videoAsset, order: 0, displayTime: Number.NaN },
        { id: 'cut-image', assetId: 'asset-image', asset: imageAsset, order: 1, displayTime: 0 },
        { id: 'cut-missing', assetId: 'missing', order: 2, displayTime: 1 },
      ],
    }];

    const assets = mapAssetsById([imageAsset, videoAsset]);
    const items = buildSequenceItemsForExport(scenes, {
      resolveAssetById: (assetId) => assets.get(assetId),
      onWarning: (warning) => warnings.push(warning.code),
    });

    expect(items).toHaveLength(2);
    expect(items[0].duration).toBe(4.2);
    expect(items[1].duration).toBe(1.0);
    expect(warnings).toEqual([
      'non-canonical-cut-adjusted',
      'non-canonical-cut-adjusted',
      'missing-asset',
    ]);
  });

  it('resolves framing with cut > global > fixed priority', () => {
    const fixed = resolveFramingParams({ id: 'c0', assetId: 'a0', order: 0, displayTime: 1 });
    expect(fixed).toEqual({ mode: 'cover', anchor: 'center', source: 'fixed' });

    const global = resolveFramingParams(
      { id: 'c1', assetId: 'a1', order: 0, displayTime: 1 },
      { mode: 'fit', anchor: 'bottom-right' }
    );
    expect(global).toEqual({ mode: 'fit', anchor: 'bottom-right', source: 'global' });

    const cut = resolveFramingParams(
      {
        id: 'c2',
        assetId: 'a2',
        order: 0,
        displayTime: 1,
        framing: { mode: 'cover', anchor: 'top-left' },
      },
      { mode: 'fit', anchor: 'bottom-right' }
    );
    expect(cut).toEqual({ mode: 'cover', anchor: 'top-left', source: 'cut' });
  });

  it('builds sequence items from cuts and skips audio cuts', () => {
    const warnings: string[] = [];
    const cuts = [
      { id: 'cut-image', assetId: 'asset-image', asset: imageAsset, order: 0, displayTime: 1.2 },
      {
        id: 'cut-audio',
        assetId: 'asset-audio',
        asset: { id: 'asset-audio', name: 'audio.wav', path: '/tmp/audio.wav', type: 'audio' as const },
        order: 1,
        displayTime: 2,
      },
    ];

    const assets = mapAssetsById([
      imageAsset,
      videoAsset,
      { id: 'asset-audio', name: 'audio.wav', path: '/tmp/audio.wav', type: 'audio' as const },
    ]);
    const items = buildSequenceItemsForCuts(cuts, {
      framingDefaults: { mode: 'fit', anchor: 'left' },
      resolveAssetById: (assetId) => assets.get(assetId),
      onWarning: (warning) => warnings.push(warning.code),
    });

    expect(items).toHaveLength(1);
    expect(items[0].framingMode).toBe('fit');
    expect(items[0].framingAnchor).toBe('left');
    expect(warnings).toEqual(['audio-only-cut-skipped']);
  });

  it('keeps timeline order and preserves clip/framing in one export build', () => {
    const assets = mapAssetsById([imageAsset, videoAsset]);

    const scenes: Scene[] = [
      {
        id: 'scene-b',
        name: 'Scene B',
        order: 1,
        notes: [],
        cuts: [
          {
            id: 'cut-video-clip',
            assetId: videoAsset.id,
            asset: videoAsset,
            order: 0,
            displayTime: 2,
            isClip: true,
            inPoint: 1.25,
            outPoint: 3.75,
            framing: { mode: 'fit', anchor: 'bottom-right' },
          },
        ],
      },
      {
        id: 'scene-a',
        name: 'Scene A',
        order: 0,
        notes: [],
        cuts: [
          {
            id: 'cut-image',
            assetId: imageAsset.id,
            asset: imageAsset,
            order: 0,
            displayTime: 1,
          },
        ],
      },
    ];

    const items = buildSequenceItemsForExport(scenes, ['scene-a', 'scene-b'], {
      framingDefaults: { mode: 'cover', anchor: 'center' },
      resolveAssetById: (assetId) => assets.get(assetId),
    });

    expect(items.map((item) => item.path)).toEqual([
      imageAsset.path,
      videoAsset.path,
    ]);

    expect(items[0].framingMode).toBe('cover');
    expect(items[0].framingAnchor).toBe('center');

    expect(items[1].inPoint).toBe(1.25);
    expect(items[1].outPoint).toBe(3.75);
    expect(items[1].framingMode).toBe('fit');
    expect(items[1].framingAnchor).toBe('bottom-right');
  });
});
