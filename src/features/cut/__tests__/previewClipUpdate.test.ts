import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPreviewClipPoints, savePreviewClipPoints } from '../previewClipUpdate';
import { ClearClipPointsCommand, UpdateClipPointsCommand } from '../../../store/commands';

describe('previewClipUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves clip points through command execution', async () => {
    const executeCommand = vi.fn(async () => undefined);
    const getCurrentCut = vi.fn(() => ({
      id: 'cut-1',
      assetId: 'asset-1',
      displayTime: 2,
      order: 0,
      isClip: false,
    }));
    const getCurrentClipRevision = vi.fn(() => 0);

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
        getCurrentClipRevision,
        thumbnailProfile: 'timeline-card',
      },
    );

    expect(executeCommand).toHaveBeenCalledTimes(1);
    expect(executeCommand).toHaveBeenCalledWith(expect.any(UpdateClipPointsCommand));
  });

  it('does not execute command when clip points are unchanged', async () => {
    const executeCommand = vi.fn(async () => undefined);
    const getCurrentCut = vi.fn(() => ({
      id: 'cut-1',
      assetId: 'asset-1',
      displayTime: 2,
      order: 0,
      isClip: true,
      inPoint: 1,
      outPoint: 3,
    }));
    const getCurrentClipRevision = vi.fn(() => 4);

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
        getCurrentClipRevision,
        thumbnailProfile: 'timeline-card',
      },
    );

    expect(executeCommand).not.toHaveBeenCalled();
  });

  it('passes non timeline-card profile to command without extra branching', async () => {
    const executeCommand = vi.fn(async () => undefined);
    const getCurrentCut = vi.fn(() => ({
      id: 'cut-2',
      assetId: 'asset-2',
      displayTime: 2,
      order: 0,
      isClip: true,
      inPoint: 1,
      outPoint: 2,
    }));
    const getCurrentClipRevision = vi.fn(() => 1);

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
        getCurrentClipRevision,
        thumbnailProfile: 'details-panel',
      },
    );

    expect(executeCommand).toHaveBeenCalledTimes(1);
    expect(executeCommand).toHaveBeenCalledWith(expect.any(ClearClipPointsCommand));
  });

  it('does nothing for clear when cut is not clip', async () => {
    const executeCommand = vi.fn(async () => undefined);
    const getCurrentCut = vi.fn(() => undefined);
    const getCurrentClipRevision = vi.fn(() => 0);

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
        getCurrentClipRevision,
        thumbnailProfile: 'timeline-card',
      },
    );

    expect(executeCommand).not.toHaveBeenCalled();
  });

  it('clears clip using current cut state even when context is stale', async () => {
    const executeCommand = vi.fn(async () => undefined);
    const getCurrentCut = vi.fn(() => ({
      id: 'cut-3',
      assetId: 'asset-3',
      displayTime: 2,
      order: 0,
      isClip: true,
      inPoint: 0,
      outPoint: 2,
    }));
    const getCurrentClipRevision = vi.fn(() => 7);

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
        getCurrentClipRevision,
        thumbnailProfile: 'timeline-card',
      },
    );

    expect(executeCommand).toHaveBeenCalledTimes(1);
  });

  it('skips save when expected clip revision is stale', async () => {
    const executeCommand = vi.fn(async () => undefined);
    const getCurrentCut = vi.fn(() => ({
      id: 'cut-stale',
      assetId: 'asset-stale',
      displayTime: 2,
      order: 0,
      isClip: false,
    }));
    const getCurrentClipRevision = vi.fn(() => 5);

    await savePreviewClipPoints(
      {
        sceneId: 'scene-stale',
        cutId: 'cut-stale',
        isClip: false,
        asset: { path: '/vault/assets/stale.mp4', type: 'video' },
      },
      1,
      2,
      {
        executeCommand,
        getCurrentCut,
        getCurrentClipRevision,
        thumbnailProfile: 'timeline-card',
      },
      { expectedClipRevision: 4 },
    );

    expect(executeCommand).not.toHaveBeenCalled();
  });
});
