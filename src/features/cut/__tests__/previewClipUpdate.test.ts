import { describe, expect, it, vi, beforeEach } from 'vitest';
import { clearPreviewClipPoints, savePreviewClipPoints } from '../previewClipUpdate';
import { getCutClipThumbnail } from '../../thumbnails/api';

vi.mock('../../thumbnails/api', () => ({
  getCutClipThumbnail: vi.fn(),
}));

describe('previewClipUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves clip points and updates cut thumbnail', async () => {
    vi.mocked(getCutClipThumbnail).mockResolvedValue('thumb-data');
    const executeCommand = vi.fn(async () => undefined);
    const updateCutAsset = vi.fn();

    await savePreviewClipPoints(
      {
        sceneId: 'scene-1',
        cutId: 'cut-1',
        isClip: false,
        asset: { path: '/vault/assets/a.mp4', type: 'video' },
      },
      1,
      3,
      {
        executeCommand,
        updateCutAsset,
        thumbnailProfile: 'timeline-card',
      },
    );

    expect(executeCommand).toHaveBeenCalledTimes(1);
    expect(getCutClipThumbnail).toHaveBeenCalledWith('timeline-card', {
      cutId: 'cut-1',
      path: '/vault/assets/a.mp4',
      inPointSec: 1,
      outPointSec: 3,
    });
    expect(updateCutAsset).toHaveBeenCalledWith('scene-1', 'cut-1', { thumbnail: 'thumb-data' });
  });

  it('clears clip points and updates cut thumbnail at t=0', async () => {
    vi.mocked(getCutClipThumbnail).mockResolvedValue('cleared-thumb');
    const executeCommand = vi.fn(async () => undefined);
    const updateCutAsset = vi.fn();

    await clearPreviewClipPoints(
      {
        sceneId: 'scene-2',
        cutId: 'cut-2',
        isClip: true,
        asset: { path: '/vault/assets/b.mp4', type: 'video' },
      },
      {
        executeCommand,
        updateCutAsset,
        thumbnailProfile: 'details-panel',
      },
    );

    expect(executeCommand).toHaveBeenCalledTimes(1);
    expect(getCutClipThumbnail).toHaveBeenCalledWith('details-panel', {
      cutId: 'cut-2',
      path: '/vault/assets/b.mp4',
      inPointSec: 0,
    });
    expect(updateCutAsset).toHaveBeenCalledWith('scene-2', 'cut-2', { thumbnail: 'cleared-thumb' });
  });

  it('does nothing for clear when cut is not clip', async () => {
    const executeCommand = vi.fn(async () => undefined);
    const updateCutAsset = vi.fn();

    await clearPreviewClipPoints(
      {
        sceneId: 'scene-3',
        cutId: 'cut-3',
        isClip: false,
        asset: { path: '/vault/assets/c.mp4', type: 'video' },
      },
      {
        executeCommand,
        updateCutAsset,
        thumbnailProfile: 'timeline-card',
      },
    );

    expect(executeCommand).not.toHaveBeenCalled();
    expect(updateCutAsset).not.toHaveBeenCalled();
    expect(getCutClipThumbnail).not.toHaveBeenCalled();
  });
});
