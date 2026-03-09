import { describe, expect, it } from 'vitest';
import type { Cut } from '../../types';
import { buildExportAudioPlan, canonicalizeCutsForExportAudioPlan } from '../exportAudioPlan';
import { buildSequenceItemsForCuts } from '../exportSequence';
import { computeCanonicalStoryTimingsForCuts } from '../storyTiming';
import { createSceneAttachMetadataStore, mapAssetsById } from './testHelpers';

describe('gate5 audio parity', () => {
  it('keeps timing->items->audioPlan aligned with embedded-audio off/on semantics', () => {
    const rawCuts: Cut[] = [
      {
        id: 'cut-1',
        assetId: 'vid-1',
        displayTime: Number.NaN,
        order: 0,
        useEmbeddedAudio: false,
        audioBindings: [
          { id: 'bind-1', audioAssetId: 'aud-cut', offsetSec: 0.5, gain: 0.7, enabled: true, kind: 'voice.other' },
        ],
      },
      {
        id: 'cut-2',
        assetId: 'img-1',
        displayTime: 2,
        order: 1,
      },
      {
        id: 'cut-3',
        assetId: 'vid-2',
        displayTime: 3,
        order: 2,
        useEmbeddedAudio: true,
      },
    ];

    const assets = mapAssetsById([
      { id: 'vid-1', name: 'v1.mp4', path: '/vault/v1.mp4', type: 'video', duration: 4 },
      { id: 'img-1', name: 'i1.png', path: '/vault/i1.png', type: 'image' },
      { id: 'vid-2', name: 'v2.mp4', path: '/vault/v2.mp4', type: 'video' },
      { id: 'aud-cut', name: 'cut.wav', path: '/vault/cut.wav', type: 'audio' },
      { id: 'aud-scene', name: 'scene.wav', path: '/vault/scene.wav', type: 'audio' },
    ]);

    const cutSceneMap = new Map<string, string>([
      ['cut-1', 'scene-1'],
      ['cut-2', 'scene-1'],
      ['cut-3', 'scene-2'],
    ]);

    const canonical = computeCanonicalStoryTimingsForCuts(
      rawCuts.map((cut) => ({ cut, sceneId: cutSceneMap.get(cut.id) || 'unknown' })),
      (assetId) => assets.get(assetId),
      { fallbackDurationSec: 1.0, preferAssetDuration: true }
    );
    const normalizedCuts = rawCuts.map((cut) => ({
      ...cut,
      displayTime: canonical.normalizedDurationByCutId.get(cut.id) ?? 1,
    }));

    const sequenceItems = buildSequenceItemsForCuts(normalizedCuts, {
      resolveAssetById: (assetId) => assets.get(assetId),
    });
    const audioPlan = buildExportAudioPlan({
      cuts: canonicalizeCutsForExportAudioPlan(normalizedCuts, (assetId) => assets.get(assetId)).cuts,
      metadataStore: createSceneAttachMetadataStore('scene-1', 'aud-scene'),
      getAssetById: (assetId) => assets.get(assetId),
      resolveSceneIdByCutId: (cutId) => cutSceneMap.get(cutId),
    });

    expect(sequenceItems.map((item) => item.duration)).toEqual([4, 2, 3]);

    const cut1Timing = canonical.cutTimings.get('cut-1');
    const cut3Timing = canonical.cutTimings.get('cut-3');
    expect(cut1Timing?.startSec).toBe(0);
    expect(cut1Timing?.durationSec).toBe(4);
    expect(cut3Timing?.startSec).toBe(6);
    expect(cut3Timing?.durationSec).toBe(3);

    expect(audioPlan.events.some((event) => event.sourceType === 'video' && event.cutId === 'cut-1')).toBe(false);

    const cutAttach = audioPlan.events.find((event) => event.sourceType === 'cut-attach' && event.cutId === 'cut-1');
    expect(cutAttach).toBeTruthy();
    expect(cutAttach?.timelineStartSec).toBe(0);
    expect(cutAttach?.durationSec).toBe(4);
    expect(cutAttach?.sourceOffsetSec).toBe(0.5);
    expect(cutAttach?.gain).toBe(0.7);

    const embeddedVideo = audioPlan.events.find((event) => event.sourceType === 'video' && event.cutId === 'cut-3');
    expect(embeddedVideo).toBeTruthy();
    expect(embeddedVideo?.timelineStartSec).toBe(6);
    expect(embeddedVideo?.durationSec).toBe(3);

    const sceneAttach = audioPlan.events.find((event) => event.sourceType === 'scene-attach' && event.sceneId === 'scene-1');
    expect(sceneAttach).toBeTruthy();
    expect(sceneAttach?.timelineStartSec).toBe(0);
    expect(sceneAttach?.durationSec).toBe(6);
  });

  it('keeps grouped-cut timing and group-attach events aligned', () => {
    const rawCuts: Cut[] = [
      {
        id: 'cut-g1',
        assetId: 'img-1',
        displayTime: 1.5,
        order: 0,
        groupId: 'group-1',
      },
      {
        id: 'cut-g2',
        assetId: 'vid-1',
        displayTime: 2,
        order: 1,
        groupId: 'group-1',
      },
      {
        id: 'cut-n1',
        assetId: 'img-2',
        displayTime: 3,
        order: 2,
      },
    ];

    const assets = mapAssetsById([
      { id: 'img-1', name: 'i1.png', path: '/vault/i1.png', type: 'image' },
      { id: 'vid-1', name: 'v1.mp4', path: '/vault/v1.mp4', type: 'video' },
      { id: 'img-2', name: 'i2.png', path: '/vault/i2.png', type: 'image' },
      { id: 'aud-group', name: 'group.wav', path: '/vault/group.wav', type: 'audio' },
    ]);

    const cutSceneMap = new Map<string, string>([
      ['cut-g1', 'scene-1'],
      ['cut-g2', 'scene-1'],
      ['cut-n1', 'scene-1'],
    ]);

    const canonical = computeCanonicalStoryTimingsForCuts(
      rawCuts.map((cut) => ({ cut, sceneId: cutSceneMap.get(cut.id) || 'unknown' })),
      (assetId) => assets.get(assetId),
      { fallbackDurationSec: 1.0, preferAssetDuration: true }
    );

    const normalizedCuts = rawCuts.map((cut) => ({
      ...cut,
      displayTime: canonical.normalizedDurationByCutId.get(cut.id) ?? 1,
    }));

    const audioPlan = buildExportAudioPlan({
      cuts: canonicalizeCutsForExportAudioPlan(normalizedCuts, (assetId) => assets.get(assetId)).cuts,
      metadataStore: {
        version: 1,
        metadata: {},
        sceneMetadata: {
          'scene-1': {
            id: 'scene-1',
            name: 'Scene 1',
            notes: [],
            updatedAt: 't',
            groupAudioBindings: {
              'group-1': {
                id: 'ga-1',
                groupId: 'group-1',
                audioAssetId: 'aud-group',
                enabled: true,
                kind: 'group',
              },
            },
          },
        },
      },
      getAssetById: (assetId) => assets.get(assetId),
      resolveSceneIdByCutId: (cutId) => cutSceneMap.get(cutId),
    });

    const groupedEvents = audioPlan.events
      .filter((event) => event.sourceType === 'group-attach')
      .sort((a, b) => a.timelineStartSec - b.timelineStartSec);
    expect(groupedEvents).toHaveLength(1);
    expect(groupedEvents.every((event) => event.sceneId === 'scene-1')).toBe(true);
    expect(groupedEvents[0]?.groupId).toBe('group-1');
    expect(groupedEvents[0]?.cutId).toBeUndefined();

    const cutG1Timing = canonical.cutTimings.get('cut-g1');
    const cutG2Timing = canonical.cutTimings.get('cut-g2');
    expect(groupedEvents[0]?.timelineStartSec).toBe(cutG1Timing?.startSec);
    expect(groupedEvents[0]?.durationSec).toBeCloseTo(
      (cutG2Timing?.startSec ?? 0) + (cutG2Timing?.durationSec ?? 0) - (cutG1Timing?.startSec ?? 0),
      6
    );
  });
});
