import { describe, expect, it, vi } from 'vitest';
import type { Cut } from '../../types';
import { buildExportAudioPlan, canonicalizeCutsForExportAudioPlan, type ExportAudioPlanCut } from '../exportAudioPlan';
import { createSceneAttachMetadataStore, mapAssetsById } from './testHelpers';

describe('buildExportAudioPlan', () => {
  it('builds mixed events for video + cut attach + scene attach', () => {
    const cuts: Cut[] = [
      {
        id: 'cut-1',
        assetId: 'vid-1',
        displayTime: 3,
        order: 0,
        isClip: true,
        inPoint: 5,
        outPoint: 8,
        audioBindings: [{ id: 'b1', audioAssetId: 'aud-cut', offsetSec: 0, enabled: true, kind: 'voice.other' }],
      },
      {
        id: 'cut-2',
        assetId: 'img-1',
        displayTime: 2,
        order: 1,
      },
    ];

    const assets = mapAssetsById([
      { id: 'vid-1', name: 'v.mp4', path: '/vault/v.mp4', type: 'video' },
      { id: 'img-1', name: 'i.png', path: '/vault/i.png', type: 'image' },
      { id: 'aud-cut', name: 'cut.wav', path: '/vault/cut.wav', type: 'audio' },
      { id: 'aud-scene', name: 'scene.wav', path: '/vault/scene.wav', type: 'audio' },
    ]);

    const plan = buildExportAudioPlan({
      cuts: canonicalizeCutsForExportAudioPlan(cuts, (assetId) => assets.get(assetId)).cuts,
      metadataStore: createSceneAttachMetadataStore('scene-1', 'aud-scene'),
      getAssetById: (assetId) => assets.get(assetId),
      resolveSceneIdByCutId: () => 'scene-1',
    });

    expect(plan.totalDurationSec).toBe(5);
    expect(plan.events.some((event) => event.sourceType === 'video' && event.sourceStartSec === 5 && event.durationSec === 3)).toBe(true);
    expect(plan.events.some((event) => event.sourceType === 'cut-attach' && event.timelineStartSec === 0 && event.durationSec === 3)).toBe(true);
    expect(plan.events.some((event) => event.sourceType === 'scene-attach' && event.timelineStartSec === 0 && event.durationSec === 5)).toBe(true);
  });

  it('skips embedded video audio when useEmbeddedAudio is false', () => {
    const cuts: Cut[] = [
      {
        id: 'cut-1',
        assetId: 'vid-1',
        displayTime: 2,
        order: 0,
        useEmbeddedAudio: false,
      },
      {
        id: 'cut-2',
        assetId: 'vid-1',
        displayTime: 2,
        order: 1,
        useEmbeddedAudio: true,
      },
    ];
    const assets = mapAssetsById([
      { id: 'vid-1', name: 'v.mp4', path: '/vault/v.mp4', type: 'video' },
    ]);

    const plan = buildExportAudioPlan({
      cuts: canonicalizeCutsForExportAudioPlan(cuts, (assetId) => assets.get(assetId)).cuts,
      metadataStore: null,
      getAssetById: (assetId) => assets.get(assetId),
      resolveSceneIdByCutId: () => 'scene-1',
    });

    const videoEvents = plan.events.filter((event) => event.sourceType === 'video');
    expect(videoEvents).toHaveLength(1);
    expect(videoEvents[0]?.cutId).toBe('cut-2');
  });

  it('keeps attach audio even when embedded audio is disabled', () => {
    const cuts: Cut[] = [
      {
        id: 'cut-1',
        assetId: 'vid-1',
        displayTime: 2,
        order: 0,
        useEmbeddedAudio: false,
        audioBindings: [{ id: 'b1', audioAssetId: 'aud-cut', enabled: true, offsetSec: 1.25, gain: 0.8, kind: 'voice.other' }],
      },
    ];
    const assets = mapAssetsById([
      { id: 'vid-1', name: 'v.mp4', path: '/vault/v.mp4', type: 'video' },
      { id: 'aud-cut', name: 'cut.wav', path: '/vault/cut.wav', type: 'audio' },
    ]);

    const plan = buildExportAudioPlan({
      cuts: canonicalizeCutsForExportAudioPlan(cuts, (assetId) => assets.get(assetId)).cuts,
      metadataStore: null,
      getAssetById: (assetId) => assets.get(assetId),
      resolveSceneIdByCutId: () => 'scene-1',
    });

    expect(plan.events.some((event) => event.sourceType === 'video')).toBe(false);
    const attach = plan.events.find((event) => event.sourceType === 'cut-attach');
    expect(attach).toBeTruthy();
    expect(attach?.sourceOffsetSec).toBe(1.25);
    expect(attach?.gain).toBe(0.8);
  });

  it('excludes disabled cut and scene attachments', () => {
    const cuts: Cut[] = [
      {
        id: 'cut-1',
        assetId: 'img-1',
        displayTime: 2,
        order: 0,
        audioBindings: [
          { id: 'enabled', audioAssetId: 'aud-on', enabled: true, offsetSec: 0, kind: 'se' },
          { id: 'disabled', audioAssetId: 'aud-off', enabled: false, offsetSec: 0, kind: 'se' },
        ],
      },
    ];
    const assets = mapAssetsById([
      { id: 'img-1', name: 'i.png', path: '/vault/i.png', type: 'image' },
      { id: 'aud-on', name: 'on.wav', path: '/vault/on.wav', type: 'audio' },
      { id: 'aud-off', name: 'off.wav', path: '/vault/off.wav', type: 'audio' },
      { id: 'aud-scene', name: 'scene.wav', path: '/vault/scene.wav', type: 'audio' },
    ]);

    const plan = buildExportAudioPlan({
      cuts: canonicalizeCutsForExportAudioPlan(cuts, (assetId) => assets.get(assetId)).cuts,
      metadataStore: createSceneAttachMetadataStore('scene-1', 'aud-scene', false),
      getAssetById: (assetId) => assets.get(assetId),
      resolveSceneIdByCutId: () => 'scene-1',
    });

    const cutAttachEvents = plan.events.filter((event) => event.sourceType === 'cut-attach');
    expect(cutAttachEvents).toHaveLength(1);
    expect(cutAttachEvents[0]?.assetId).toBe('aud-on');
    expect(plan.events.some((event) => event.sourceType === 'scene-attach')).toBe(false);
  });

  it('warns when non-canonical cuts are passed directly', () => {
    const cuts: Cut[] = [
      {
        id: 'cut-1',
        assetId: 'vid-1',
        displayTime: Number.NaN,
        order: 0,
      },
    ];
    const assets = mapAssetsById([
      { id: 'vid-1', name: 'v.mp4', path: '/vault/v.mp4', type: 'video', duration: 4 },
    ]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const plan = buildExportAudioPlan({
      cuts: cuts as unknown as ExportAudioPlanCut[],
      metadataStore: null,
      getAssetById: (assetId) => assets.get(assetId),
      resolveSceneIdByCutId: () => 'scene-1',
      canonicalGuard: 'warn',
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('non-canonical cuts');
    expect(plan.totalDurationSec).toBe(4);
    warnSpy.mockRestore();
  });
});
