import { describe, expect, it, vi } from 'vitest';
import { createDerivedCutAndSyncGroup, finalizeClipAndAddCut } from '../actions';

describe('cut actions', () => {
  it('syncs new derived cut into source group', async () => {
    const createCutFromImport = vi.fn(async () => 'new-cut');
    const getCutGroup = vi.fn(() => ({
      id: 'group-1',
      name: 'G1',
      cutIds: ['cut-a', 'cut-b'],
      isCollapsed: false,
    }));
    const updateGroupCutOrder = vi.fn();

    await createDerivedCutAndSyncGroup({
      sceneId: 'scene-1',
      sourceCutId: 'cut-a',
      insertIndex: 1,
      source: {
        assetId: 'asset-1',
        name: 'derived.png',
        sourcePath: 'C:/tmp/derived.png',
        type: 'image',
      },
      vaultPath: 'C:/vault',
      createCutFromImport,
      getCutGroup,
      updateGroupCutOrder,
    });

    expect(createCutFromImport).toHaveBeenCalledTimes(1);
    expect(updateGroupCutOrder).toHaveBeenCalledWith('scene-1', 'group-1', ['cut-a', 'new-cut', 'cut-b']);
  });

  it('finalizes clip and creates derived cut', async () => {
    const finalizeClip = vi.fn(async () => ({ success: true, fileSize: 1024 * 1024 }));
    const ensureAssetsFolder = vi.fn(async () => 'C:/vault/assets');
    Object.defineProperty(window, 'electronAPI', {
      value: {
        finalizeClip,
        ensureAssetsFolder,
      },
      writable: true,
    });

    const createCutFromImport = vi.fn(async () => 'new-cut');
    const getCutGroup = vi.fn(() => undefined);
    const updateGroupCutOrder = vi.fn();

    const result = await finalizeClipAndAddCut({
      sceneId: 'scene-1',
      sourceCutId: 'cut-a',
      insertIndex: 1,
      sourceAssetPath: 'C:/assets/src.mp4',
      sourceAssetName: 'src.mp4',
      inPoint: 1,
      outPoint: 3,
      reverseOutput: false,
      vaultPath: 'C:/vault',
      createCutFromImport,
      getCutGroup,
      updateGroupCutOrder,
    });

    expect(result.success).toBe(true);
    expect(finalizeClip).toHaveBeenCalledTimes(1);
    expect(createCutFromImport).toHaveBeenCalledTimes(1);
  });
});
