import { describe, expect, it } from 'vitest';
import {
  generateAssetId,
  getEffectivePath,
  isAssetInVault,
  importFileToVault,
} from '../assetPath';
import { resetElectronMocks } from '../../test/setup.renderer';

// Minimal Asset shape
const baseAsset = {
  id: 'asset-1',
  name: 'image.png',
  path: 'C:/src/image.png',
  type: 'image' as const,
};

describe('assetPath', () => {
  it('detects vault membership', () => {
    expect(isAssetInVault({ ...baseAsset, vaultRelativePath: 'assets/img.png' } as any)).toBe(true);
    expect(isAssetInVault(baseAsset as any)).toBe(false);
  });

  it('computes effective path using vaultRelativePath', () => {
    const path = getEffectivePath({ ...baseAsset, vaultRelativePath: 'assets/img.png' } as any, 'C:/vault');
    expect(path).toBe('C:\\vault\\assets\\img.png');
  });

  it('generates asset id with expected prefix', () => {
    const id = generateAssetId();
    expect(id.startsWith('asset_')).toBe(true);
  });

  it('imports file to vault via electronAPI', async () => {
    resetElectronMocks();
    const result = await importFileToVault('C:/src/image.png', 'C:/vault', 'asset-1');
    expect(result?.vaultRelativePath).toBe('assets/img_abc.png');
    expect(result?.path).toBe('C:/mock/vault/assets/img_abc.png');
    expect(result?.hash).toBe('abc');
  });

  it('moves original to trash when rehashing inside vault', async () => {
    resetElectronMocks();
    const electronAPI = window.electronAPI as any;
    electronAPI.isPathInVault.mockResolvedValueOnce(true);
    const result = await importFileToVault('C:/vault/assets/original.png', 'C:/vault', 'asset-1');
    expect(result?.vaultRelativePath).toBe('assets/img_abc.png');
    expect(result?.path).toBe('C:/mock/vault/assets/img_abc.png');
    expect(electronAPI.vaultGateway.moveToTrashWithMeta).toHaveBeenCalled();
  });

  it('does not let existingAsset.path override imported vault path', async () => {
    resetElectronMocks();
    const result = await importFileToVault('C:/src/generated.png', 'C:/vault', 'asset-1', {
      path: 'C:/src/generated.png',
      name: 'generated.png',
      type: 'image',
    });
    expect(result?.path).toBe('C:/mock/vault/assets/img_abc.png');
    expect(result?.vaultRelativePath).toBe('assets/img_abc.png');
  });
});
