import { describe, expect, it } from 'vitest';
import { registerAssetFile } from '../write';
import { resetElectronMocks } from '../../../test/setup.renderer';

describe('asset write service', () => {
  it('finalizes external assets through the vault finalize path', async () => {
    resetElectronMocks();
    const electronAPI = window.electronAPI as any;
    electronAPI.getFileInfo.mockResolvedValueOnce({ size: 2048 });
    electronAPI.getVideoMetadata.mockResolvedValueOnce({ duration: 3.5, width: 1280, height: 720 });
    electronAPI.vaultGateway.finalizeAsset.mockResolvedValueOnce({
      success: true,
      vaultPath: 'C:/vault/assets/vid_hash.mp4',
      relativePath: 'assets/vid_hash.mp4',
      hash: 'hash-1',
      isDuplicate: false,
    });

    const result = await registerAssetFile({
      sourcePath: 'C:/source/video.mp4',
      vaultPath: 'C:/vault',
      assetId: 'asset-1',
      existingAsset: {
        name: 'video.mp4',
        type: 'video',
      },
    });

    expect(electronAPI.vaultGateway.finalizeAsset).toHaveBeenCalledWith('C:/source/video.mp4', 'C:/vault', 'asset-1', {
      originalName: 'video.mp4',
      originalPath: 'C:/source/video.mp4',
    });
    expect(result).toEqual({
      asset: expect.objectContaining({
        id: 'asset-1',
        path: 'C:/vault/assets/vid_hash.mp4',
        vaultRelativePath: 'assets/vid_hash.mp4',
        duration: 3.5,
        fileSize: 2048,
        metadata: {
          width: 1280,
          height: 720,
        },
      }),
      isDuplicate: false,
    });
  });

  it('finalizes pre-existing vault assets through the shared finalize path', async () => {
    resetElectronMocks();
    const electronAPI = window.electronAPI as any;
    electronAPI.getFileInfo.mockResolvedValueOnce({ size: 512 });
    electronAPI.readImageMetadata.mockResolvedValueOnce({ width: 640, height: 480, format: 'png' });
    electronAPI.vaultGateway.finalizeAsset.mockResolvedValueOnce({
      success: true,
      vaultPath: 'C:/vault/assets/img_hashframe.png',
      relativePath: 'assets/img_hashframe.png',
      hash: 'hash-frame-renamed',
      isDuplicate: false,
    });

    const result = await registerAssetFile({
      sourcePath: 'C:/vault/assets/frame.png',
      vaultPath: 'C:/vault',
      assetId: 'asset-frame',
      existingAsset: {
        name: 'Captured Frame',
        type: 'image',
      },
    });

    expect(electronAPI.vaultGateway.finalizeAsset).toHaveBeenCalledWith('C:/vault/assets/frame.png', 'C:/vault', 'asset-frame', {
      originalName: 'Captured Frame',
      originalPath: 'C:/vault/assets/frame.png',
    });
    expect(result).toEqual({
      asset: expect.objectContaining({
        id: 'asset-frame',
        name: 'Captured Frame',
        path: 'C:/vault/assets/img_hashframe.png',
        vaultRelativePath: 'assets/img_hashframe.png',
        hash: 'hash-frame-renamed',
        fileSize: 512,
        metadata: {
          width: 640,
          height: 480,
          format: 'png',
        },
      }),
      isDuplicate: false,
    });
  });
});
