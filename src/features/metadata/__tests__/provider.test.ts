import { describe, expect, it } from 'vitest';
import {
  deleteAssetWithIndexSync,
  hydrateAssetsByIdsFromIndex,
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

  it('hydrates assets by id from index and resolves absolute path', async () => {
    resetElectronMocks();
    (window.electronAPI!.loadAssetIndex as any).mockResolvedValueOnce({
      version: 1,
      assets: [
        {
          id: 'aud-1',
          hash: 'hash-aud-1',
          filename: 'aud_1.wav',
          originalName: 'bgm.wav',
          originalPath: 'imports/bgm.wav',
          type: 'audio',
          fileSize: 1024,
          importedAt: '2026-02-20T00:00:00.000Z',
        },
      ],
    });
    (window.electronAPI!.resolveVaultPath as any).mockResolvedValueOnce({
      absolutePath: 'C:/vault/assets/aud_1.wav',
      exists: true,
    });

    const hydrated = await hydrateAssetsByIdsFromIndex('C:/vault', ['aud-1', 'missing-id']);
    expect(hydrated).toHaveLength(1);
    expect(hydrated[0]).toMatchObject({
      id: 'aud-1',
      path: 'C:/vault/assets/aud_1.wav',
      type: 'audio',
    });
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

  it('deletes asset and updates index in serialized mutation path', async () => {
    resetElectronMocks();
    (window.electronAPI!.vaultGateway.moveToTrashWithMeta as any).mockResolvedValueOnce('C:/vault/.trash/aud_1.wav');
    (window.electronAPI!.loadAssetIndex as any).mockResolvedValueOnce({
      version: 1,
      assets: [
        { id: 'aud-1', filename: 'aud_1.wav' },
        { id: 'img-1', filename: 'img_1.png' },
      ],
    });
    (window.electronAPI!.vaultGateway.saveAssetIndex as any).mockResolvedValueOnce(true);

    const result = await deleteAssetWithIndexSync({
      assetPath: 'C:/vault/assets/aud_1.wav',
      trashPath: 'C:/vault/.trash',
      assetIds: ['aud-1'],
      reason: 'asset-panel-delete',
      vaultPath: 'C:/vault',
    });

    expect(result).toMatchObject({
      success: true,
      fileDeleted: true,
      indexUpdated: true,
    });
    expect(window.electronAPI!.vaultGateway.moveToTrashWithMeta).toHaveBeenCalledTimes(1);
    expect(window.electronAPI!.vaultGateway.saveAssetIndex).toHaveBeenCalledTimes(1);
  });

  it('reports index sync failure after file deletion', async () => {
    resetElectronMocks();
    (window.electronAPI!.vaultGateway.moveToTrashWithMeta as any).mockResolvedValueOnce('C:/vault/.trash/aud_1.wav');
    (window.electronAPI!.loadAssetIndex as any).mockResolvedValueOnce({
      version: 1,
      assets: [{ id: 'aud-1', filename: 'aud_1.wav' }],
    });
    (window.electronAPI!.vaultGateway.saveAssetIndex as any).mockResolvedValueOnce(false);

    const result = await deleteAssetWithIndexSync({
      assetPath: 'C:/vault/assets/aud_1.wav',
      trashPath: 'C:/vault/.trash',
      assetIds: ['aud-1'],
      reason: 'asset-panel-delete',
      vaultPath: 'C:/vault',
    });

    expect(result).toMatchObject({
      success: true,
      fileDeleted: true,
      indexUpdated: false,
      reason: 'index-update-failed',
    });
    expect(window.electronAPI!.vaultGateway.moveToTrashWithMeta).toHaveBeenCalledTimes(1);
  });
});
