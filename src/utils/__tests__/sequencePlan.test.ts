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
      cuts,
      metadataStore: null,
      getAssetById: (assetId) => assets.get(assetId),
      resolveSceneIdByCutId: () => 'scene-1',
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
      cuts,
      metadataStore: null,
      getAssetById: (assetId) => assets.get(assetId),
    });

    expect(plan.warnings.some((warning) => warning.code === 'lipsync-temporary-route')).toBe(true);
  });
});
