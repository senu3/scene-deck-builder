import { describe, expect, it } from 'vitest';
import type { Asset, Cut } from '../../types';
import { buildSequencePlan } from '../sequencePlan';

const VIDEO_ASSET: Asset = {
  id: 'video-1',
  name: 'clip.mp4',
  path: '/vault/assets/clip.mp4',
  type: 'video',
  duration: 10,
};

const AUDIO_ASSET: Asset = {
  id: 'audio-1',
  name: 'bgm.wav',
  path: '/vault/assets/bgm.wav',
  type: 'audio',
  duration: 20,
};

function cut(input: Partial<Cut> & Pick<Cut, 'id' | 'assetId' | 'displayTime' | 'order'>): Cut {
  return {
    id: input.id,
    assetId: input.assetId,
    displayTime: input.displayTime,
    order: input.order,
    isClip: input.isClip,
    inPoint: input.inPoint,
    outPoint: input.outPoint,
    useEmbeddedAudio: input.useEmbeddedAudio,
    isLipSync: input.isLipSync,
    audioBindings: input.audioBindings || [],
  };
}

describe('buildSequencePlan', () => {
  it('builds minimal sequence plan and compatibility payloads', () => {
    const cuts: Cut[] = [
      cut({
        id: 'cut-1',
        assetId: 'video-1',
        displayTime: 3,
        order: 0,
        isClip: true,
        inPoint: 1,
        outPoint: 4,
      }),
      cut({
        id: 'cut-2',
        assetId: 'video-1',
        displayTime: 2,
        order: 1,
        useEmbeddedAudio: false,
      }),
      cut({
        id: 'cut-3',
        assetId: 'audio-1',
        displayTime: 2,
        order: 2,
      }),
    ];
    const assets = new Map<string, Asset>([
      ['video-1', VIDEO_ASSET],
      ['audio-1', AUDIO_ASSET],
    ]);

    const plan = buildSequencePlan({
      scenes: [{ id: 'scene-1', name: 'Scene 1', cuts, notes: [] }],
      sceneOrder: ['scene-1'],
    }, {
      metadataStore: null,
      getAssetById: (assetId) => assets.get(assetId),
    });

    expect(plan.videoItems).toHaveLength(2);
    expect(plan.videoItems[0]).toMatchObject({
      cutId: 'cut-1',
      srcInSec: 1,
      srcOutSec: 4,
      dstInSec: 0,
      dstOutSec: 3,
      flags: { isClip: true, isMuted: false, isHold: false },
    });
    expect(plan.videoItems[1]).toMatchObject({
      cutId: 'cut-2',
      flags: { isClip: false, isMuted: true, isHold: false },
    });
    expect(plan.exportItems.length).toBe(2);
    expect(plan.exportItemByCutId.has('cut-1')).toBe(true);
    expect(plan.durationSec).toBeGreaterThan(0);
    expect(plan.warnings.some((warning) => warning.code === 'audio-only-cut-skipped')).toBe(true);
  });

  it('adds temporary warning for lipsync cuts', () => {
    const cuts: Cut[] = [
      cut({
        id: 'cut-lipsync',
        assetId: 'video-1',
        displayTime: 1,
        order: 0,
        isLipSync: true,
      }),
    ];
    const assets = new Map<string, Asset>([['video-1', VIDEO_ASSET]]);

    const plan = buildSequencePlan({
      scenes: [{ id: 'scene-1', name: 'Scene 1', cuts, notes: [] }],
      sceneOrder: ['scene-1'],
    }, {
      metadataStore: null,
      getAssetById: (assetId) => assets.get(assetId),
    });

    expect(plan.warnings.some((warning) => warning.code === 'lipsync-temporary-route')).toBe(true);
  });

  it('supports scene target and cuts override target', () => {
    const cutsScene1: Cut[] = [
      cut({
        id: 'cut-scene-1',
        assetId: 'video-1',
        displayTime: 1.5,
        order: 0,
      }),
    ];
    const cutsScene2: Cut[] = [
      cut({
        id: 'cut-scene-2',
        assetId: 'video-1',
        displayTime: 2.5,
        order: 0,
      }),
    ];
    const assets = new Map<string, Asset>([['video-1', VIDEO_ASSET]]);
    const project = {
      scenes: [
        { id: 'scene-1', name: 'Scene 1', cuts: cutsScene1, notes: [] },
        { id: 'scene-2', name: 'Scene 2', cuts: cutsScene2, notes: [] },
      ],
      sceneOrder: ['scene-1', 'scene-2'],
    };

    const scenePlan = buildSequencePlan(project, {
      target: { kind: 'scene', sceneId: 'scene-2' },
      metadataStore: null,
      getAssetById: (assetId) => assets.get(assetId),
    });
    expect(scenePlan.videoItems).toHaveLength(1);
    expect(scenePlan.videoItems[0]?.cutId).toBe('cut-scene-2');

    const overridePlan = buildSequencePlan(project, {
      target: {
        kind: 'cuts',
        cuts: cutsScene1,
        resolveSceneIdByCutId: () => 'scene-override',
      },
      metadataStore: null,
      getAssetById: (assetId) => assets.get(assetId),
    });
    expect(overridePlan.videoItems).toHaveLength(1);
    expect(overridePlan.videoItems[0]?.sceneId).toBe('scene-override');
  });

  it('appends tail hold video/export items from runtime hold settings', () => {
    const cuts: Cut[] = [
      cut({
        id: 'cut-hold',
        assetId: 'video-1',
        displayTime: 2,
        order: 0,
        isClip: true,
        inPoint: 1,
        outPoint: 3,
      }),
    ];
    const assets = new Map<string, Asset>([['video-1', VIDEO_ASSET]]);

    const plan = buildSequencePlan({
      scenes: [{ id: 'scene-1', name: 'Scene 1', cuts, notes: [] }],
      sceneOrder: ['scene-1'],
    }, {
      metadataStore: null,
      getAssetById: (assetId) => assets.get(assetId),
      resolveCutRuntimeById: () => ({
        hold: {
          enabled: true,
          mode: 'tail',
          durationMs: 1200,
          muteAudio: true,
          composeWithClip: true,
        },
      }),
    });

    expect(plan.videoItems).toHaveLength(2);
    expect(plan.videoItems[1]).toMatchObject({
      cutId: 'cut-hold',
      flags: { isHold: true, isMuted: true },
    });
    expect(plan.exportItems).toHaveLength(2);
    expect(plan.exportItems[1]).toMatchObject({
      holdDurationSec: 1.2,
      flags: { isHold: true, isMuted: true },
    });
    expect(plan.durationSec).toBeCloseTo(3.2, 4);
    expect(plan.audioPlan.totalDurationSec).toBeCloseTo(3.2, 4);
  });
});
