import { afterEach, describe, expect, it, vi } from 'vitest';
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
    groupId: input.groupId,
    useEmbeddedAudio: input.useEmbeddedAudio,
    audioBindings: input.audioBindings || [],
    framing: input.framing,
  };
}

describe('buildSequencePlan', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it('routes framing debug through plan warnings instead of console logging', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const cuts: Cut[] = [
      cut({
        id: 'cut-framing',
        assetId: 'video-1',
        displayTime: 2,
        order: 0,
        framing: {
          anchor: 'bottom-right',
        },
      }),
    ];
    const assets = new Map<string, Asset>([['video-1', VIDEO_ASSET]]);

    const plan = buildSequencePlan({
      scenes: [{ id: 'scene-1', name: 'Scene 1', cuts, notes: [] }],
      sceneOrder: ['scene-1'],
    }, {
      metadataStore: null,
      getAssetById: (assetId) => assets.get(assetId),
      framingDefaults: { mode: 'fit', anchor: 'left' },
      debugFraming: true,
    });

    expect(plan.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'debug-framing-resolved',
        cutId: 'cut-framing',
        message: expect.stringContaining('mode=fit anchor=bottom-right source=cut'),
      }),
    ]));
    expect(warnSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
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

  it('infers scene ids for cuts target from project when resolver is omitted', () => {
    const cutsScene1: Cut[] = [
      cut({
        id: 'cut-scene-1',
        assetId: 'video-1',
        displayTime: 1.5,
        order: 0,
      }),
    ];
    const assets = new Map<string, Asset>([
      ['video-1', VIDEO_ASSET],
      ['audio-1', AUDIO_ASSET],
    ]);
    const project = {
      scenes: [
        { id: 'scene-1', name: 'Scene 1', cuts: cutsScene1, notes: [] },
      ],
      sceneOrder: ['scene-1'],
    };

    const plan = buildSequencePlan(project, {
      target: {
        kind: 'cuts',
        cuts: cutsScene1,
      },
      metadataStore: {
        version: 1,
        metadata: {},
        sceneMetadata: {
          'scene-1': {
            id: 'scene-1',
            name: 'Scene 1',
            notes: [],
            updatedAt: 't',
            attachAudio: {
              id: 'scene-audio-1',
              audioAssetId: 'audio-1',
              enabled: true,
              kind: 'scene',
            },
          },
        },
      },
      getAssetById: (assetId) => assets.get(assetId),
    });

    expect(plan.videoItems[0]?.sceneId).toBe('scene-1');
    expect(plan.audioPlan.events.some((event) => event.sourceType === 'scene-attach' && event.sceneId === 'scene-1')).toBe(true);
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
    const embeddedAudioEvent = plan.audioPlan.events.find((event) => event.sourceType === 'video' && event.cutId === 'cut-hold');
    expect(embeddedAudioEvent?.durationSec).toBeCloseTo(2, 4);
    expect((embeddedAudioEvent?.timelineStartSec ?? 0) + (embeddedAudioEvent?.durationSec ?? 0)).toBeLessThan(plan.durationSec);
    expect(plan.durationSec).toBeCloseTo(3.2, 4);
    expect(plan.audioPlan.totalDurationSec).toBeCloseTo(3.2, 4);
  });

  it('extends attach audio across hold and shifts later events on the canonical timeline', () => {
    const cuts: Cut[] = [
      cut({
        id: 'cut-hold-gap-1',
        assetId: 'video-1',
        displayTime: 2,
        order: 0,
        groupId: 'group-1',
        audioBindings: [
          {
            id: 'cut-audio-1',
            audioAssetId: 'audio-1',
            offsetSec: 0,
            enabled: true,
            kind: 'se',
          },
        ],
      }),
      cut({
        id: 'cut-hold-gap-2',
        assetId: 'video-1',
        displayTime: 1,
        order: 1,
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
      metadataStore: {
        version: 1,
        metadata: {},
        sceneMetadata: {
          'scene-1': {
            id: 'scene-1',
            name: 'Scene 1',
            notes: [],
            updatedAt: 't',
            attachAudio: {
              id: 'scene-audio-1',
              audioAssetId: 'audio-1',
              enabled: true,
              kind: 'scene',
            },
            groupAudioBindings: {
              'group-1': {
                id: 'group-audio-1',
                groupId: 'group-1',
                audioAssetId: 'audio-1',
                enabled: true,
                kind: 'group',
              },
            },
          },
        },
      },
      getAssetById: (assetId) => assets.get(assetId),
      resolveCutRuntimeById: (cutId) => {
        if (cutId !== 'cut-hold-gap-1') return undefined;
        return {
          hold: {
            enabled: true,
            mode: 'tail',
            durationMs: 1000,
          },
        };
      },
    });

    const sceneEvent = plan.audioPlan.events.find((event) => event.sourceType === 'scene-attach');
    const cutAttachEvent = plan.audioPlan.events.find((event) => event.sourceType === 'cut-attach');
    const groupAttachEvent = plan.audioPlan.events.find((event) => event.sourceType === 'group-attach');
    const secondVideoEvent = plan.audioPlan.events.find((event) => event.sourceType === 'video' && event.cutId === 'cut-hold-gap-2');

    expect(sceneEvent).toMatchObject({
      timelineStartSec: 0,
      durationSec: 4,
      sourceOffsetSec: 0,
    });
    expect(cutAttachEvent).toMatchObject({
      timelineStartSec: 0,
      durationSec: 3,
      sourceOffsetSec: 0,
    });
    expect(groupAttachEvent).toMatchObject({
      timelineStartSec: 0,
      durationSec: 3,
      sourceOffsetSec: 0,
    });
    expect(secondVideoEvent).toMatchObject({
      timelineStartSec: 3,
    });
    expect(plan.audioPlan.totalDurationSec).toBeCloseTo(4, 4);
  });

  it('treats clip in/out duration as canonical when displayTime differs', () => {
    const cuts: Cut[] = [
      cut({
        id: 'cut-mismatch',
        assetId: 'video-1',
        displayTime: 5,
        order: 0,
        isClip: true,
        inPoint: 2,
        outPoint: 3.5,
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

    expect(plan.videoItems).toHaveLength(1);
    expect(plan.videoItems[0]?.dstOutSec).toBeCloseTo(1.5, 6);
    expect(plan.exportItems[0]?.duration).toBeCloseTo(1.5, 6);
    expect(plan.audioPlan.totalDurationSec).toBeCloseTo(1.5, 6);
  });
});
