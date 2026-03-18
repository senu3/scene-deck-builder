import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildUnregisteredAssetsConfirmDialog,
  normalizeUnregisteredAssetFiles,
  syncUnregisteredAssetsForProjectLoad,
} from '../unregisteredAssets';

vi.mock('../../asset/write', () => ({
  registerAssetFile: vi.fn(),
}));

vi.mock('../../platform/electronGateway', () => ({
  verifyVaultAssetsBridge: vi.fn(),
}));

describe('project unregistered assets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('normalizes only registerable media files from verify results', () => {
    const files = normalizeUnregisteredAssetFiles({
      valid: true,
      missing: [],
      orphaned: [],
      orphanedEntries: [
        {
          name: 'clip.mp4',
          absolutePath: '/vault/assets/clip.mp4',
          relativePath: 'assets/clip.mp4',
          kind: 'file',
          mediaType: 'video',
        },
        {
          name: 'cover.png',
          absolutePath: '/vault/assets/cover.png',
          relativePath: 'assets/cover.png',
          kind: 'file',
          mediaType: 'image',
        },
        {
          name: '.hidden.mp4',
          absolutePath: '/vault/assets/.hidden.mp4',
          relativePath: 'assets/.hidden.mp4',
          kind: 'file',
          mediaType: 'video',
        },
        {
          name: '~draft.mp4',
          absolutePath: '/vault/assets/~draft.mp4',
          relativePath: 'assets/~draft.mp4',
          kind: 'file',
          mediaType: 'video',
        },
        {
          name: 'clip.mp4.part',
          absolutePath: '/vault/assets/clip.mp4.part',
          relativePath: 'assets/clip.mp4.part',
          kind: 'file',
          mediaType: null,
        },
        {
          name: 'manifest.json',
          absolutePath: '/vault/assets/manifest.json',
          relativePath: 'assets/manifest.json',
          kind: 'file',
          mediaType: null,
        },
        {
          name: '.cache',
          absolutePath: '/vault/assets/.cache',
          relativePath: 'assets/.cache',
          kind: 'directory',
          mediaType: null,
        },
        {
          name: 'nested.mp4',
          absolutePath: '/vault/assets/.cache/nested.mp4',
          relativePath: 'assets/.cache/nested.mp4',
          kind: 'file',
          mediaType: 'video',
        },
      ],
    }, '/vault');

    expect(files).toEqual([
      {
        filename: 'clip.mp4',
        absolutePath: '/vault/assets/clip.mp4',
        relativePath: 'assets/clip.mp4',
        mediaType: 'video',
        reason: 'unregistered-media',
      },
      {
        filename: 'cover.png',
        absolutePath: '/vault/assets/cover.png',
        relativePath: 'assets/cover.png',
        mediaType: 'image',
        reason: 'unregistered-media',
      },
    ]);
  });

  it('builds a single confirm dialog payload with rename notice and examples', () => {
    const dialog = buildUnregisteredAssetsConfirmDialog([
      {
        filename: 'a.mp4',
        absolutePath: '/vault/assets/a.mp4',
        relativePath: 'assets/a.mp4',
        mediaType: 'video',
        reason: 'unregistered-media',
      },
      {
        filename: 'b.png',
        absolutePath: '/vault/assets/b.png',
        relativePath: 'assets/b.png',
        mediaType: 'image',
        reason: 'unregistered-media',
      },
    ]);

    expect(dialog.title).toBe('Add Unregistered Assets?');
    expect(dialog.message).toContain('There are 2 unregistered media files in assets/');
    expect(dialog.message).toContain('renamed to managed hash filenames');
    expect(dialog.message).toContain('Examples: a.mp4, b.png.');
  });

  it('registers confirmed unregistered media through the shared write service', async () => {
    const { verifyVaultAssetsBridge } = await import('../../platform/electronGateway');
    const { registerAssetFile } = await import('../../asset/write');
    vi.mocked(verifyVaultAssetsBridge).mockResolvedValue({
      valid: true,
      missing: [],
      orphaned: ['clip.mp4', 'cover.png'],
      orphanedEntries: [
        {
          name: 'clip.mp4',
          absolutePath: '/vault/assets/clip.mp4',
          relativePath: 'assets/clip.mp4',
          kind: 'file',
          mediaType: 'video',
        },
        {
          name: 'cover.png',
          absolutePath: '/vault/assets/cover.png',
          relativePath: 'assets/cover.png',
          kind: 'file',
          mediaType: 'image',
        },
      ],
    });
    vi.mocked(registerAssetFile).mockResolvedValue({
      asset: {
        id: 'asset-1',
        name: 'clip.mp4',
        path: '/vault/assets/vid_hash.mp4',
        type: 'video',
      },
      isDuplicate: false,
    });

    const confirm = vi.fn(async () => true);
    const result = await syncUnregisteredAssetsForProjectLoad({
      vaultPath: '/vault',
      confirm,
    });

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(registerAssetFile).toHaveBeenCalledTimes(2);
    expect(registerAssetFile).toHaveBeenNthCalledWith(1, expect.objectContaining({
      sourcePath: '/vault/assets/clip.mp4',
      vaultPath: '/vault',
      existingAsset: expect.objectContaining({
        name: 'clip.mp4',
        type: 'video',
      }),
    }));
    expect(result).toEqual(expect.objectContaining({
      detectedCount: 2,
      registeredCount: 2,
      failedCount: 0,
      confirmed: true,
    }));
    expect(console.info).toHaveBeenCalledWith('[ProjectLoad] Unregistered asset sync completed.', expect.objectContaining({
      succeededCount: 2,
      failedCount: 0,
      skippedCount: 0,
    }));
  });

  it('skips registration when the user declines the confirm dialog', async () => {
    const { verifyVaultAssetsBridge } = await import('../../platform/electronGateway');
    const { registerAssetFile } = await import('../../asset/write');
    vi.mocked(verifyVaultAssetsBridge).mockResolvedValue({
      valid: true,
      missing: [],
      orphaned: ['clip.mp4'],
      orphanedEntries: [
        {
          name: 'clip.mp4',
          absolutePath: '/vault/assets/clip.mp4',
          relativePath: 'assets/clip.mp4',
          kind: 'file',
          mediaType: 'video',
        },
      ],
    });

    const result = await syncUnregisteredAssetsForProjectLoad({
      vaultPath: '/vault',
      confirm: async () => false,
    });

    expect(registerAssetFile).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      detectedCount: 1,
      registeredCount: 0,
      skippedCount: 1,
      confirmed: false,
    }));
    expect(console.info).toHaveBeenCalledWith('[ProjectLoad] Skipped unregistered asset sync.', expect.objectContaining({
      detectedCount: 1,
      skippedCount: 1,
    }));
  });
});
