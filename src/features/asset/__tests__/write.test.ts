import { describe, expect, it } from 'vitest';
import { registerAssetFile } from '../write';
import { resetElectronMocks } from '../../../test/setup.renderer';

describe('asset write service', () => {
  it('imports external assets through the vault gateway import path', async () => {
    resetElectronMocks();
    const electronAPI = window.electronAPI as any;
    electronAPI.isPathInVault.mockResolvedValueOnce(false);
    electronAPI.getFileInfo.mockResolvedValueOnce({ size: 2048 });
    electronAPI.getVideoMetadata.mockResolvedValueOnce({ duration: 3.5, width: 1280, height: 720 });
    electronAPI.vaultGateway.importAndRegisterAsset.mockResolvedValueOnce({
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

    expect(electronAPI.vaultGateway.importAndRegisterAsset).toHaveBeenCalledWith('C:/source/video.mp4', 'C:/vault', 'asset-1');
    expect(electronAPI.vaultGateway.registerVaultAsset).not.toHaveBeenCalled();
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

  it('registers pre-existing vault assets through the vault register path', async () => {
    resetElectronMocks();
    const electronAPI = window.electronAPI as any;
    electronAPI.isPathInVault.mockResolvedValueOnce(true);
    electronAPI.getFileInfo.mockResolvedValueOnce({ size: 512 });
    electronAPI.readImageMetadata.mockResolvedValueOnce({ width: 640, height: 480, format: 'png' });
    electronAPI.vaultGateway.registerVaultAsset.mockResolvedValueOnce({
      success: true,
      vaultPath: 'C:/vault/assets/frame.png',
      relativePath: 'assets/frame.png',
      hash: 'hash-frame',
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

    expect(electronAPI.vaultGateway.registerVaultAsset).toHaveBeenCalledWith('C:/vault/assets/frame.png', 'C:/vault', 'asset-frame');
    expect(electronAPI.vaultGateway.importAndRegisterAsset).not.toHaveBeenCalled();
    expect(result).toEqual({
      asset: expect.objectContaining({
        id: 'asset-frame',
        name: 'Captured Frame',
        path: 'C:/vault/assets/frame.png',
        vaultRelativePath: 'assets/frame.png',
        hash: 'hash-frame',
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
