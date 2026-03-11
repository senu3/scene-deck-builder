import type { Scene } from '../../../types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  commitRecoverySceneChanges,
  hasLegacyRelativeAssetPaths,
  planRecoverySceneChanges,
} from '../load';

vi.mock('../../asset/write', () => ({
  registerAssetFile: vi.fn(),
}));

vi.mock('../../metadata/provider', () => ({
  readCanonicalAssetMetadataForPath: vi.fn(),
}));

vi.mock('../../thumbnails/api', () => ({
  getAssetThumbnail: vi.fn(),
}));

function createRecoveryScenes(): Scene[] {
  return [{
    id: 'scene-1',
    name: 'Scene 1',
    notes: [{
      id: 'note-1',
      type: 'text',
      content: 'note',
      createdAt: '2026-03-11T00:00:00.000Z',
    }],
    cuts: [
      {
        id: 'cut-1',
        order: 0,
        assetId: 'asset-1',
        displayTime: 1,
        asset: {
          id: 'asset-1',
          name: 'legacy.mp4',
          path: '/missing/legacy.mp4',
          type: 'video',
          metadata: {
            width: 1280,
            height: 720,
          },
        },
      },
      {
        id: 'cut-2',
        order: 1,
        assetId: 'asset-2',
        displayTime: 2,
        asset: {
          id: 'asset-2',
          name: 'legacy-2.mp4',
          path: '/missing/legacy-2.mp4',
          type: 'video',
        },
      },
    ],
  }];
}

describe('project load recovery helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects legacy relative paths from cut asset snapshots during load', () => {
    expect(hasLegacyRelativeAssetPaths([
      {
        id: 'scene-1',
        name: 'Scene 1',
        notes: [],
        cuts: [{
          id: 'cut-1',
          order: 0,
          assetId: 'asset-1',
          displayTime: 1,
          asset: {
            id: 'asset-1',
            name: 'legacy.png',
            path: 'assets/legacy.png',
            type: 'image' as const,
          },
        }],
      },
    ])).toBe(true);
  });

  it('plans relinks as value-only data without drafted asset state', async () => {
    const scenes = createRecoveryScenes();

    const plan = await planRecoverySceneChanges(scenes, [{
      sceneId: 'scene-1',
      cutId: 'cut-1',
      action: 'relink',
      newPath: '/relinked/video.mp4',
    }]);

    expect(plan.relinks).toEqual([{
      relinkToken: 'scene-1::cut-1::0',
      sceneId: 'scene-1',
      cutId: 'cut-1',
      newPath: '/relinked/video.mp4',
    }]);
    expect(plan.relinks[0]).not.toHaveProperty('draftedAsset');
    expect(plan.scenes[0]?.cuts[0]?.asset?.path).toBe('/missing/legacy.mp4');
    expect(plan.scenes[0]?.cuts[0]?.displayTime).toBe(1);
    expect(plan.scenes[0]?.cuts[0]?.asset).not.toBe(scenes[0]?.cuts[0]?.asset);
    expect(plan.scenes[0]).not.toBe(scenes[0]);
    expect(plan.scenes[0]?.notes[0]).not.toBe(scenes[0]?.notes[0]);

    const plannedAsset = plan.scenes[0]?.cuts[0]?.asset;
    if (!plannedAsset) {
      throw new Error('expected planned asset snapshot');
    }
    plannedAsset.path = '/mutated/in-plan.mp4';

    expect(scenes[0]?.cuts[0]?.asset?.path).toBe('/missing/legacy.mp4');
    expect(plan.relinks[0]?.newPath).toBe('/relinked/video.mp4');
  });

  it('tolerates legacy scenes without notes during recovery planning', async () => {
    const plan = await planRecoverySceneChanges([
      {
        id: 'scene-1',
        name: 'Scene 1',
        cuts: [{
          id: 'cut-1',
          order: 0,
          assetId: 'asset-1',
          displayTime: 1,
          asset: {
            id: 'asset-1',
            name: 'legacy.png',
            path: '/missing/legacy.png',
            type: 'image',
          },
        }],
      } as Scene,
    ]);

    expect(plan.scenes[0]).toEqual(expect.objectContaining({
      notes: [],
      cuts: [expect.objectContaining({ id: 'cut-1' })],
    }));
  });

  it('commits successful recovery relinks through the shared register service', async () => {
    const { registerAssetFile } = await import('../../asset/write');
    const { readCanonicalAssetMetadataForPath } = await import('../../metadata/provider');
    const { getAssetThumbnail } = await import('../../thumbnails/api');
    vi.mocked(readCanonicalAssetMetadataForPath).mockResolvedValue({
      duration: 5,
      fileSize: 2048,
      metadata: { width: 1280, height: 720 },
    });
    vi.mocked(getAssetThumbnail).mockResolvedValue('thumb-data');
    vi.mocked(registerAssetFile).mockResolvedValue({
      asset: {
        id: 'asset-1',
        name: 'video.mp4',
        path: '/vault/assets/video.mp4',
        type: 'video',
        duration: 5,
        vaultRelativePath: 'assets/video.mp4',
      },
      isDuplicate: false,
    });

    const plan = await planRecoverySceneChanges(createRecoveryScenes(), [{
      sceneId: 'scene-1',
      cutId: 'cut-1',
      action: 'relink',
      newPath: '/relinked/video.mp4',
    }]);
    const committed = await commitRecoverySceneChanges(plan, '/vault');

    expect(registerAssetFile).toHaveBeenCalledWith({
      sourcePath: '/relinked/video.mp4',
      vaultPath: '/vault',
      assetId: 'asset-1',
      existingAsset: expect.objectContaining({
        id: 'asset-1',
        path: '/relinked/video.mp4',
      }),
    });
    expect(committed.status).toBe('success');
    expect(committed.failedRelinks).toEqual([]);
    expect(committed.committedRelinks).toHaveLength(1);
    expect(committed.scenes[0]?.cuts[0]).toEqual(expect.objectContaining({
      displayTime: 5,
      assetId: 'asset-1',
      asset: expect.objectContaining({
        path: '/vault/assets/video.mp4',
        vaultRelativePath: 'assets/video.mp4',
      }),
    }));
  });

  it('reports failed relinks without patching scenes with drafted assets', async () => {
    const { registerAssetFile } = await import('../../asset/write');
    const { readCanonicalAssetMetadataForPath } = await import('../../metadata/provider');
    const { getAssetThumbnail } = await import('../../thumbnails/api');
    vi.mocked(readCanonicalAssetMetadataForPath).mockResolvedValue({
      duration: 4,
      fileSize: 1024,
      metadata: { width: 1280, height: 720 },
    });
    vi.mocked(getAssetThumbnail).mockResolvedValue('thumb-data');
    vi.mocked(registerAssetFile)
      .mockResolvedValueOnce({
        asset: {
          id: 'asset-1',
          name: 'video-1.mp4',
          path: '/vault/assets/video-1.mp4',
          type: 'video',
          duration: 4,
          vaultRelativePath: 'assets/video-1.mp4',
        },
        isDuplicate: false,
      })
      .mockResolvedValueOnce(null);

    const plan = await planRecoverySceneChanges(createRecoveryScenes(), [
      {
        sceneId: 'scene-1',
        cutId: 'cut-1',
        action: 'relink',
        newPath: '/relinked/video-1.mp4',
      },
      {
        sceneId: 'scene-1',
        cutId: 'cut-2',
        action: 'relink',
        newPath: '/relinked/video-2.mp4',
      },
    ]);
    const committed = await commitRecoverySceneChanges(plan, '/vault');

    expect(committed.status).toBe('partial');
    expect(committed.committedRelinks).toHaveLength(1);
    expect(committed.failedRelinks).toEqual([expect.objectContaining({
      relinkToken: 'scene-1::cut-2::1',
      sceneId: 'scene-1',
      cutId: 'cut-2',
      assetId: 'asset-2',
      reason: 'register-failed',
    })]);
    expect(committed.scenes[0]?.cuts[0]).toEqual(expect.objectContaining({
      assetId: 'asset-1',
      asset: expect.objectContaining({
        path: '/vault/assets/video-1.mp4',
      }),
      displayTime: 4,
    }));
    expect(committed.scenes[0]?.cuts[1]).toEqual(expect.objectContaining({
      assetId: 'asset-2',
      asset: expect.objectContaining({
        path: '/missing/legacy-2.mp4',
      }),
      displayTime: 2,
    }));
  });
});
