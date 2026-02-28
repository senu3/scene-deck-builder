import { describe, expect, it } from 'vitest';
import {
  loadAssetIndexEntries,
  readImageMetadataForPath,
  readVideoMetadataForPath,
  resolveVideoDurationForPath,
} from '../provider';
import { resetElectronMocks } from '../../../test/setup.renderer';

describe('metadata provider', () => {
  it('loads index entries via bridge', async () => {
    resetElectronMocks();
    (window.electronAPI!.loadAssetIndex as any).mockResolvedValueOnce({
      version: 1,
      assets: [
        {
          id: 'asset-1',
          hash: 'abc',
          filename: 'a.png',
          originalName: 'a.png',
          originalPath: 'assets/a.png',
          type: 'image',
          fileSize: 100,
          importedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    const entries = await loadAssetIndexEntries('C:/vault');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe('asset-1');
  });

  it('returns empty array when index load fails', async () => {
    resetElectronMocks();
    (window.electronAPI!.loadAssetIndex as any).mockRejectedValueOnce(new Error('fail'));
    const entries = await loadAssetIndexEntries('C:/vault');
    expect(entries).toEqual([]);
  });

  it('loads image metadata via bridge', async () => {
    resetElectronMocks();
    (window.electronAPI!.readImageMetadata as any).mockResolvedValueOnce({ width: 1920, height: 1080 });
    const meta = await readImageMetadataForPath('C:/vault/assets/a.png');
    expect(meta?.width).toBe(1920);
  });

  it('loads video metadata via bridge', async () => {
    resetElectronMocks();
    (window.electronAPI!.getVideoMetadata as any).mockResolvedValueOnce({ duration: 12.34 });
    const meta = await readVideoMetadataForPath('C:/vault/assets/a.mp4');
    expect(meta?.duration).toBe(12.34);
  });

  it('normalizes invalid video duration to null', async () => {
    resetElectronMocks();
    (window.electronAPI!.getVideoMetadata as any).mockResolvedValueOnce({ duration: 0 });
    const duration = await resolveVideoDurationForPath('C:/vault/assets/a.mp4');
    expect(duration).toBeNull();
  });
});
