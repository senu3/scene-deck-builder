import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cut } from '../../../types';
import {
  __resetClipThumbnailRegenerationQueueForTests,
  enqueueClipThumbnailRegeneration,
} from '../clipThumbnailRegenerationQueue';
import { getCutClipThumbnail } from '../../thumbnails/api';

vi.mock('../../thumbnails/api', () => ({
  getCutClipThumbnail: vi.fn(),
}));

function flushMicrotasks(times = 3): Promise<void> {
  let chain = Promise.resolve();
  for (let i = 0; i < times; i += 1) {
    chain = chain.then(() => Promise.resolve());
  }
  return chain;
}

describe('clipThumbnailRegenerationQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetClipThumbnailRegenerationQueueForTests();
  });

  it('applies only the latest request for the same cut', async () => {
    let currentCut: Cut = {
      id: 'cut-1',
      assetId: 'asset-1',
      displayTime: 2,
      order: 0,
      isClip: true,
      inPoint: 1,
      outPoint: 3,
      asset: { id: 'asset-1', name: 'v.mp4', path: '/v.mp4', type: 'video' },
    };

    let releaseFirst: (() => void) | null = null;
    const firstPending = new Promise<string>((resolve) => {
      releaseFirst = () => resolve('thumb-old');
    });

    vi.mocked(getCutClipThumbnail)
      .mockImplementationOnce(async () => firstPending)
      .mockResolvedValueOnce('thumb-new');

    const updateCutAsset = vi.fn();

    enqueueClipThumbnailRegeneration({
      sceneId: 'scene-1',
      cutId: 'cut-1',
      assetPath: '/v.mp4',
      mode: 'clip',
      inPointSec: 1,
      outPointSec: 3,
    }, {
      getCurrentCut: () => currentCut,
      updateCutAsset,
    });

    currentCut = {
      ...currentCut,
      inPoint: 2,
      outPoint: 4,
    };

    enqueueClipThumbnailRegeneration({
      sceneId: 'scene-1',
      cutId: 'cut-1',
      assetPath: '/v.mp4',
      mode: 'clip',
      inPointSec: 2,
      outPointSec: 4,
    }, {
      getCurrentCut: () => currentCut,
      updateCutAsset,
    });

    releaseFirst?.();
    await flushMicrotasks();

    expect(updateCutAsset).toHaveBeenCalledTimes(1);
    expect(updateCutAsset).toHaveBeenCalledWith('scene-1', 'cut-1', { thumbnail: 'thumb-new' });
  });

  it('does not apply thumbnail when cut state changed before apply', async () => {
    const updateCutAsset = vi.fn();
    const currentCut: Cut = {
      id: 'cut-2',
      assetId: 'asset-2',
      displayTime: 1,
      order: 0,
      isClip: false,
      asset: { id: 'asset-2', name: 'v2.mp4', path: '/v2.mp4', type: 'video' },
    };

    vi.mocked(getCutClipThumbnail).mockResolvedValue('thumb-drop');

    enqueueClipThumbnailRegeneration({
      sceneId: 'scene-2',
      cutId: 'cut-2',
      assetPath: '/v2.mp4',
      mode: 'clip',
      inPointSec: 0,
      outPointSec: 1,
    }, {
      getCurrentCut: () => currentCut,
      updateCutAsset,
    });

    await flushMicrotasks();
    expect(updateCutAsset).not.toHaveBeenCalled();
  });

  it('applies clear-mode thumbnail only when clip is cleared', async () => {
    const updateCutAsset = vi.fn();
    const currentCut: Cut = {
      id: 'cut-3',
      assetId: 'asset-3',
      displayTime: 6,
      order: 0,
      isClip: false,
      asset: { id: 'asset-3', name: 'v3.mp4', path: '/v3.mp4', type: 'video' },
    };

    vi.mocked(getCutClipThumbnail).mockResolvedValue('thumb-clear');

    enqueueClipThumbnailRegeneration({
      sceneId: 'scene-3',
      cutId: 'cut-3',
      assetPath: '/v3.mp4',
      mode: 'clear',
      inPointSec: 0,
    }, {
      getCurrentCut: () => currentCut,
      updateCutAsset,
    });

    await flushMicrotasks();
    expect(updateCutAsset).toHaveBeenCalledWith('scene-3', 'cut-3', { thumbnail: 'thumb-clear' });
  });

  it('swallows thumbnail generation errors and keeps queue alive', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const updateCutAsset = vi.fn();
    const currentCut: Cut = {
      id: 'cut-4',
      assetId: 'asset-4',
      displayTime: 2,
      order: 0,
      isClip: true,
      inPoint: 0,
      outPoint: 2,
      asset: { id: 'asset-4', name: 'v4.mp4', path: '/v4.mp4', type: 'video' },
    };

    vi.mocked(getCutClipThumbnail)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('thumb-after-error');

    enqueueClipThumbnailRegeneration({
      sceneId: 'scene-4',
      cutId: 'cut-4',
      assetPath: '/v4.mp4',
      mode: 'clip',
      inPointSec: 0,
      outPointSec: 2,
    }, {
      getCurrentCut: () => currentCut,
      updateCutAsset,
    });

    enqueueClipThumbnailRegeneration({
      sceneId: 'scene-4',
      cutId: 'cut-4',
      assetPath: '/v4.mp4',
      mode: 'clip',
      inPointSec: 0,
      outPointSec: 2,
    }, {
      getCurrentCut: () => currentCut,
      updateCutAsset,
    });

    await flushMicrotasks();
    expect(updateCutAsset).toHaveBeenCalledTimes(1);
    expect(updateCutAsset).toHaveBeenCalledWith('scene-4', 'cut-4', { thumbnail: 'thumb-after-error' });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
