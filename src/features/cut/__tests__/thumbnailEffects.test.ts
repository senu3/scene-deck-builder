import { describe, expect, it, vi } from 'vitest';
import { buildRegenThumbnailsEffect, emitRegenThumbnailsEffect } from '../thumbnailEffects';
import { enqueueClipThumbnailRegeneration } from '../clipThumbnailRegenerationQueue';

vi.mock('../clipThumbnailRegenerationQueue', () => ({
  enqueueClipThumbnailRegeneration: vi.fn(),
}));

describe('thumbnailEffects', () => {
  it('builds REGEN_THUMBNAILS effect payload', () => {
    const effect = buildRegenThumbnailsEffect({
      profile: 'timeline-card',
      reason: 'test',
      requests: [
        {
          sceneId: 'scene-1',
          cutId: 'cut-1',
          assetPath: '/vault/assets/a.mp4',
          mode: 'clip',
          inPointSec: 1,
          outPointSec: 2,
        },
      ],
    });

    expect(effect).toEqual({
      type: 'REGEN_THUMBNAILS',
      payload: {
        profile: 'timeline-card',
        cutIds: ['cut-1'],
        reason: 'test',
        requests: [
          {
            sceneId: 'scene-1',
            cutId: 'cut-1',
            assetPath: '/vault/assets/a.mp4',
            mode: 'clip',
            inPointSec: 1,
            outPointSec: 2,
          },
        ],
      },
    });
  });

  it('enqueues requests when timeline-card profile is emitted', async () => {
    const getCurrentCut = vi.fn();
    const updateCutAsset = vi.fn();

    await emitRegenThumbnailsEffect(
      {
        profile: 'timeline-card',
        reason: 'clip-points-saved',
        requests: [
          {
            sceneId: 'scene-1',
            cutId: 'cut-1',
            assetPath: '/vault/assets/a.mp4',
            mode: 'clip',
            inPointSec: 1,
            outPointSec: 2,
          },
        ],
      },
      {
        getCurrentCut,
        updateCutAsset,
      }
    );

    expect(enqueueClipThumbnailRegeneration).toHaveBeenCalledTimes(1);
  });
});
