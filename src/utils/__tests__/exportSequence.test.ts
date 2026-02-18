import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Asset, Scene } from '../../types';
import { buildSequenceItemsForCuts, buildSequenceItemsForExport, resolveFramingParams } from '../exportSequence';

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

    const assets = new Map<string, Asset>([
      [imageAsset.id, imageAsset],
      [videoAsset.id, videoAsset],
    ]);
    const items = buildSequenceItemsForExport(scenes, ['scene-1', 'scene-2'], {
      resolveAssetById: (assetId) => assets.get(assetId),
    });
    expect(items.map((item) => item.duration)).toEqual([3.0, 1.5, 2.0]);
    expect(items.every((item) => item.framingMode === 'cover' && item.framingAnchor === 'center')).toBe(true);
  });

  it('guards invalid displayTime with fallback and warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
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

    const assets = new Map<string, Asset>([
      [imageAsset.id, imageAsset],
      [videoAsset.id, videoAsset],
    ]);
    const items = buildSequenceItemsForExport(scenes, {
      resolveAssetById: (assetId) => assets.get(assetId),
    });

    expect(items).toHaveLength(2);
    expect(items[0].duration).toBe(4.2);
    expect(items[1].duration).toBe(1.0);
    expect(warnSpy).toHaveBeenCalledTimes(3);
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
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
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

    const assets = new Map<string, Asset>([
      [imageAsset.id, imageAsset],
      [videoAsset.id, videoAsset],
      ['asset-audio', { id: 'asset-audio', name: 'audio.wav', path: '/tmp/audio.wav', type: 'audio' as const }],
    ]);
    const items = buildSequenceItemsForCuts(cuts, {
      framingDefaults: { mode: 'fit', anchor: 'left' },
      resolveAssetById: (assetId) => assets.get(assetId),
    });

    expect(items).toHaveLength(1);
    expect(items[0].framingMode).toBe('fit');
    expect(items[0].framingAnchor).toBe('left');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('attaches lipSync payload when metadata and frame assets are available', () => {
    const lipOwner = {
      id: 'asset-lip-owner',
      name: 'lip.png',
      path: '/tmp/lip.png',
      type: 'image' as const,
    };
    const frames = [
      { id: 'cmp-1', name: 'cmp-1.png', path: '/tmp/cmp-1.png', type: 'image' as const },
      { id: 'cmp-2', name: 'cmp-2.png', path: '/tmp/cmp-2.png', type: 'image' as const },
      { id: 'cmp-3', name: 'cmp-3.png', path: '/tmp/cmp-3.png', type: 'image' as const },
      { id: 'cmp-4', name: 'cmp-4.png', path: '/tmp/cmp-4.png', type: 'image' as const },
    ];
    const assets = new Map([lipOwner, ...frames].map((asset) => [asset.id, asset]));

    const items = buildSequenceItemsForCuts(
      [{
        id: 'cut-lipsync',
        assetId: lipOwner.id,
        asset: lipOwner,
        order: 0,
        displayTime: 1,
        isLipSync: true,
        audioBindings: [{
          id: 'b1',
          audioAssetId: 'aud-1',
          offsetSec: 0.2,
          enabled: true,
          kind: 'voice.lipsync',
        }],
      }],
      {
        metadataByAssetId: {
          [lipOwner.id]: {
            assetId: lipOwner.id,
            lipSync: {
              baseImageAssetId: 'cmp-1',
              variantAssetIds: ['cmp-2', 'cmp-3', 'cmp-4'],
              compositedFrameAssetIds: ['cmp-1', 'cmp-2', 'cmp-3', 'cmp-4'],
              rmsSourceAudioAssetId: 'aud-1',
              thresholds: { t1: 0.1, t2: 0.2, t3: 0.3 },
              fps: 30,
            },
          },
          'aud-1': {
            assetId: 'aud-1',
            audioAnalysis: {
              fps: 30,
              rms: [0, 0.12, 0.24, 0.5],
              duration: 0.12,
              sampleRate: 48000,
              channels: 2,
            },
          },
        },
        resolveAssetById: (assetId) => assets.get(assetId),
      }
    );

    expect(items).toHaveLength(1);
    expect(items[0].lipSync).toBeDefined();
    expect(items[0].lipSync?.framePaths).toEqual(frames.map((frame) => frame.path));
    expect(items[0].lipSync?.audioOffsetSec).toBe(0.2);
  });

  it('throws when lipSync cut is missing required metadata by default (no silent fallback)', () => {
    const lipOwner = {
      id: 'asset-lip-owner',
      name: 'lip.png',
      path: '/tmp/lip.png',
      type: 'image' as const,
    };
    expect(() => buildSequenceItemsForCuts([{
      id: 'cut-lipsync-missing',
      assetId: lipOwner.id,
      asset: lipOwner,
      order: 0,
      displayTime: 1,
      isLipSync: true,
    }], {
      resolveAssetById: (assetId) => (assetId === lipOwner.id ? lipOwner : undefined),
    })).toThrow(/LipSync cut cut-lipsync-missing is missing lipSync settings/);
  });

  it('can opt out of strict lipSync errors', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const lipOwner = {
      id: 'asset-lip-owner',
      name: 'lip.png',
      path: '/tmp/lip.png',
      type: 'image' as const,
    };
    const items = buildSequenceItemsForCuts([{
      id: 'cut-lipsync-missing',
      assetId: lipOwner.id,
      asset: lipOwner,
      order: 0,
      displayTime: 1,
      isLipSync: true,
    }], {
      strictLipSync: false,
      resolveAssetById: (assetId) => (assetId === lipOwner.id ? lipOwner : undefined),
    });

    expect(items).toHaveLength(1);
    expect(items[0].lipSync).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps timeline order and preserves clip/lipsync/framing in one export build', () => {
    const lipOwner = {
      id: 'asset-lip-owner',
      name: 'lip.png',
      path: '/tmp/lip.png',
      type: 'image' as const,
    };
    const lipsyncFrames = [
      { id: 'cmp-1', name: 'cmp-1.png', path: '/tmp/cmp-1.png', type: 'image' as const },
      { id: 'cmp-2', name: 'cmp-2.png', path: '/tmp/cmp-2.png', type: 'image' as const },
      { id: 'cmp-3', name: 'cmp-3.png', path: '/tmp/cmp-3.png', type: 'image' as const },
      { id: 'cmp-4', name: 'cmp-4.png', path: '/tmp/cmp-4.png', type: 'image' as const },
    ];
    const assets = new Map([imageAsset, videoAsset, lipOwner, ...lipsyncFrames].map((asset) => [asset.id, asset]));

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
            id: 'cut-lipsync',
            assetId: lipOwner.id,
            asset: lipOwner,
            order: 1,
            displayTime: 1.5,
            isLipSync: true,
            audioBindings: [{
              id: 'ab-1',
              audioAssetId: 'aud-1',
              offsetSec: -0.1,
              enabled: true,
              kind: 'voice.lipsync',
            }],
          },
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
      metadataByAssetId: {
        [lipOwner.id]: {
          assetId: lipOwner.id,
          lipSync: {
            baseImageAssetId: 'cmp-1',
            variantAssetIds: ['cmp-2', 'cmp-3', 'cmp-4'],
            compositedFrameAssetIds: ['cmp-1', 'cmp-2', 'cmp-3', 'cmp-4'],
            rmsSourceAudioAssetId: 'aud-1',
            thresholds: { t1: 0.1, t2: 0.2, t3: 0.3 },
            fps: 30,
          },
        },
        'aud-1': {
          assetId: 'aud-1',
          audioAnalysis: {
            fps: 30,
            rms: [0, 0.2, 0.4, 0.15],
            duration: 0.13,
            sampleRate: 48000,
            channels: 2,
          },
        },
      },
      resolveAssetById: (assetId) => assets.get(assetId),
    });

    expect(items.map((item) => item.path)).toEqual([
      imageAsset.path,
      lipOwner.path,
      videoAsset.path,
    ]);

    expect(items[0].framingMode).toBe('cover');
    expect(items[0].framingAnchor).toBe('center');

    expect(items[1].lipSync?.framePaths).toEqual(lipsyncFrames.map((frame) => frame.path));
    expect(items[1].lipSync?.audioOffsetSec).toBe(-0.1);
    expect(items[1].framingMode).toBe('cover');
    expect(items[1].framingAnchor).toBe('center');

    expect(items[2].inPoint).toBe(1.25);
    expect(items[2].outPoint).toBe(3.75);
    expect(items[2].framingMode).toBe('fit');
    expect(items[2].framingAnchor).toBe('bottom-right');
  });
});
