import { describe, expect, it } from 'vitest';
import type { ExportAudioPlan } from '../exportAudioPlan';
import { slicePreviewAudioPlan } from '../previewAudioPlanSlice';

describe('previewAudioPlanSlice', () => {
  it('slices canonical events into a local preview window and advances source offsets', () => {
    const basePlan: ExportAudioPlan = {
      totalDurationSec: 10,
      events: [
        {
          sourceType: 'scene-attach',
          sourcePath: '/tmp/scene.wav',
          assetId: 'scene-audio',
          sceneId: 'scene-1',
          sourceStartSec: 0,
          sourceOffsetSec: 0,
          timelineStartSec: 0,
          durationSec: 8,
          gain: 1,
        },
        {
          sourceType: 'group-attach',
          sourcePath: '/tmp/group.wav',
          assetId: 'group-audio',
          sceneId: 'scene-1',
          groupId: 'group-1',
          sourceStartSec: 0,
          sourceOffsetSec: 0,
          timelineStartSec: 1,
          durationSec: 4,
          gain: 1,
        },
        {
          sourceType: 'cut-attach',
          sourcePath: '/tmp/cut.wav',
          assetId: 'cut-audio',
          sceneId: 'scene-1',
          cutId: 'cut-1',
          sourceStartSec: 0,
          sourceOffsetSec: 0.5,
          timelineStartSec: 4,
          durationSec: 3,
          gain: 1,
        },
      ],
    };

    const sliced = slicePreviewAudioPlan(basePlan, {
      startSec: 2,
      endSec: 5,
    });

    expect(sliced.totalDurationSec).toBe(3);
    expect(sliced.events).toHaveLength(3);
    expect(sliced.events[0]).toMatchObject({
      sourceType: 'scene-attach',
      timelineStartSec: 0,
      durationSec: 3,
      sourceOffsetSec: 2,
    });
    expect(sliced.events[1]).toMatchObject({
      sourceType: 'group-attach',
      groupId: 'group-1',
      timelineStartSec: 0,
      durationSec: 3,
      sourceOffsetSec: 1,
    });
    expect(sliced.events[2]).toMatchObject({
      sourceType: 'cut-attach',
      cutId: 'cut-1',
      timelineStartSec: 2,
      durationSec: 1,
      sourceOffsetSec: 0.5,
    });
  });

  it('can exclude video events while keeping local preview duration', () => {
    const basePlan: ExportAudioPlan = {
      totalDurationSec: 6,
      events: [
        {
          sourceType: 'video',
          sourcePath: '/tmp/video.mp4',
          assetId: 'video-1',
          cutId: 'cut-1',
          sourceStartSec: 1.25,
          sourceOffsetSec: 0,
          timelineStartSec: 0,
          durationSec: 4,
          gain: 1,
        },
      ],
    };

    const sliced = slicePreviewAudioPlan(basePlan, {
      startSec: 1,
      endSec: 3,
    }, {
      excludeSourceTypes: ['video'],
    });

    expect(sliced.totalDurationSec).toBe(2);
    expect(sliced.events).toHaveLength(0);
  });
});
