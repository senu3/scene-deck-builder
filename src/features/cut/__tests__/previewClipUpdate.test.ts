import { describe, expect, it, vi, beforeEach } from 'vitest';
import { clearPreviewClipPoints, savePreviewClipPoints } from '../previewClipUpdate';
import { enqueueClipThumbnailRegeneration } from '../clipThumbnailRegenerationQueue';

vi.mock('../clipThumbnailRegenerationQueue', () => ({
  enqueueClipThumbnailRegeneration: vi.fn(),
}));

describe('previewClipUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves clip points and enqueues thumbnail regeneration', async () => {
    const executeCommand = vi.fn(async () => undefined);
    const updateCutAsset = vi.fn();
    const getCurrentCut = vi.fn(() => ({
      id: 'cut-1',
      assetId: 'asset-1',
      displayTime: 2,
      order: 0,
      isClip: false,
    }));

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
        getCurrentCut,
        updateCutAsset,
        thumbnailProfile: 'timeline-card',
      },
    );

    expect(executeCommand).toHaveBeenCalledTimes(1);
    expect(enqueueClipThumbnailRegeneration).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      cutId: 'cut-1',
      assetPath: '/vault/assets/a.mp4',
      mode: 'clip',
      inPointSec: 1,
      outPointSec: 3,
    }, {
      getCurrentCut,
      updateCutAsset,
      onThumbnailUpdated: undefined,
    });
  });

  it('does not execute command when clip points are unchanged', async () => {
    const executeCommand = vi.fn(async () => undefined);
    const updateCutAsset = vi.fn();
    const getCurrentCut = vi.fn(() => ({
      id: 'cut-1',
      assetId: 'asset-1',
      displayTime: 2,
      order: 0,
      isClip: true,
      inPoint: 1,
      outPoint: 3,
    }));

    await savePreviewClipPoints(
      {
        sceneId: 'scene-1',
        cutId: 'cut-1',
        isClip: true,
        asset: { path: '/vault/assets/a.mp4', type: 'video' },
      },
      1,
      3,
      {
        executeCommand,
        getCurrentCut,
        updateCutAsset,
        thumbnailProfile: 'timeline-card',
      },
    );

    expect(executeCommand).not.toHaveBeenCalled();
    expect(enqueueClipThumbnailRegeneration).not.toHaveBeenCalled();
  });

  it('does not enqueue clear thumbnail regeneration for non timeline-card profile', async () => {
    const executeCommand = vi.fn(async () => undefined);
    const updateCutAsset = vi.fn();
    const getCurrentCut = vi.fn(() => ({
      id: 'cut-2',
      assetId: 'asset-2',
      displayTime: 2,
      order: 0,
      isClip: true,
      inPoint: 1,
      outPoint: 2,
    }));

    await clearPreviewClipPoints(
      {
        sceneId: 'scene-2',
        cutId: 'cut-2',
        isClip: true,
        asset: { path: '/vault/assets/b.mp4', type: 'video' },
      },
      {
        executeCommand,
        getCurrentCut,
        updateCutAsset,
        thumbnailProfile: 'details-panel',
      },
    );

    expect(executeCommand).toHaveBeenCalledTimes(1);
    expect(enqueueClipThumbnailRegeneration).not.toHaveBeenCalled();
  });

  it('does nothing for clear when cut is not clip', async () => {
    const executeCommand = vi.fn(async () => undefined);
    const updateCutAsset = vi.fn();
    const getCurrentCut = vi.fn(() => undefined);

    await clearPreviewClipPoints(
      {
        sceneId: 'scene-3',
        cutId: 'cut-3',
        isClip: false,
        asset: { path: '/vault/assets/c.mp4', type: 'video' },
      },
      {
        executeCommand,
        getCurrentCut,
        updateCutAsset,
        thumbnailProfile: 'timeline-card',
      },
    );

    expect(executeCommand).not.toHaveBeenCalled();
    expect(updateCutAsset).not.toHaveBeenCalled();
    expect(enqueueClipThumbnailRegeneration).not.toHaveBeenCalled();
  });

  it('clears clip using current cut state even when context is stale', async () => {
    const executeCommand = vi.fn(async () => undefined);
    const updateCutAsset = vi.fn();
    const getCurrentCut = vi.fn(() => ({
      id: 'cut-3',
      assetId: 'asset-3',
      displayTime: 2,
      order: 0,
      isClip: true,
      inPoint: 0,
      outPoint: 2,
    }));

    await clearPreviewClipPoints(
      {
        sceneId: 'scene-3',
        cutId: 'cut-3',
        isClip: false,
        asset: { path: '/vault/assets/c.mp4', type: 'video' },
      },
      {
        executeCommand,
        getCurrentCut,
        updateCutAsset,
        thumbnailProfile: 'timeline-card',
      },
    );

    expect(executeCommand).toHaveBeenCalledTimes(1);
    expect(enqueueClipThumbnailRegeneration).toHaveBeenCalledTimes(1);
  });
});
