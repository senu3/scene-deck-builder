import { beforeEach, describe, expect, it, vi } from 'vitest';
import { selectAndImportAssetToVault } from '../import';
import {
  getFileInfoBridge,
  showOpenFileDialogBridge,
} from '../../platform/electronGateway';
import { importFileToVault } from '../../../utils/assetPath';

vi.mock('../../platform/electronGateway', () => ({
  getFileInfoBridge: vi.fn(),
  showOpenFileDialogBridge: vi.fn(),
}));

vi.mock('../../../utils/assetPath', () => ({
  importFileToVault: vi.fn(),
}));

describe('asset import helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when file selection is cancelled', async () => {
    vi.mocked(showOpenFileDialogBridge).mockResolvedValue(null);

    await expect(selectAndImportAssetToVault({
      vaultPath: '/vault',
      filterType: 'image',
    })).resolves.toBeNull();
  });

  it('imports selected file into vault and preserves file info metadata', async () => {
    vi.mocked(showOpenFileDialogBridge).mockResolvedValue('/source/clip.mp4');
    vi.mocked(getFileInfoBridge).mockResolvedValue({
      name: 'clip.mp4',
      path: '/source/clip.mp4',
      size: 1234,
      modified: new Date('2026-03-10T00:00:00.000Z'),
      type: 'video',
      extension: '.mp4',
    });
    vi.mocked(importFileToVault).mockResolvedValue({
      id: 'generated',
      name: 'clip.mp4',
      path: '/vault/assets/clip.mp4',
      type: 'video',
      vaultRelativePath: 'assets/clip.mp4',
      originalPath: '/source/clip.mp4',
      hash: 'hash-1',
      fileSize: 1234,
    });

    const result = await selectAndImportAssetToVault({
      vaultPath: '/vault',
      filterType: 'video',
    });

    expect(importFileToVault).toHaveBeenCalledWith(
      '/source/clip.mp4',
      '/vault',
      expect.any(String),
      expect.objectContaining({
        name: 'clip.mp4',
        type: 'video',
        fileSize: 1234,
      })
    );
    expect(result).toEqual(expect.objectContaining({
      name: 'clip.mp4',
      path: '/vault/assets/clip.mp4',
      type: 'video',
      vaultRelativePath: 'assets/clip.mp4',
      originalPath: '/source/clip.mp4',
      hash: 'hash-1',
      fileSize: 1234,
    }));
  });
});
