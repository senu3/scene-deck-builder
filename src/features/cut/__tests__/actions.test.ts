import { describe, expect, it, vi } from 'vitest';
import { createDerivedCutAndSyncGroup, cropImageAndAddCut, finalizeClipAndAddCut } from '../actions';

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

  it('crops image and creates derived cut', async () => {
    const cropImageToAspect = vi.fn(async () => ({ success: true, fileSize: 2048 }));
    const ensureAssetsFolder = vi.fn(async () => 'C:/vault/assets');
    Object.defineProperty(window, 'electronAPI', {
      value: {
        cropImageToAspect,
        ensureAssetsFolder,
      },
      writable: true,
    });

    const createCutFromImport = vi.fn(async () => 'new-cut');
    const getCutGroup = vi.fn(() => undefined);
    const updateGroupCutOrder = vi.fn();

    const result = await cropImageAndAddCut({
      sceneId: 'scene-1',
      sourceCutId: 'cut-a',
      insertIndex: 1,
      sourceAssetPath: 'C:/assets/src.png',
      sourceAssetName: 'src.png',
      targetWidth: 1280,
      targetHeight: 720,
      anchorX: 0.5,
      anchorY: 0.5,
      preferredThumbnail: 'data:image/png;base64,aaa',
      vaultPath: 'C:/vault',
      createCutFromImport,
      getCutGroup,
      updateGroupCutOrder,
    });

    expect(result.success).toBe(true);
    expect(cropImageToAspect).toHaveBeenCalledTimes(1);
    expect(createCutFromImport).toHaveBeenCalledTimes(1);
  });

  it('uses source path basename for derived filenames when display name is noisy', async () => {
    const finalizeClip = vi.fn(async () => ({ success: true, fileSize: 1024 }));
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
      sourceAssetPath: 'C:/assets/clean_source.mp4',
      sourceAssetName: '._This is not a crop, zoom, 366084.mp4',
      inPoint: 0,
      outPoint: 1,
      reverseOutput: false,
      vaultPath: 'C:/vault',
      createCutFromImport,
      getCutGroup,
      updateGroupCutOrder,
    });

    expect(result.success).toBe(true);
    const finalizeArg = finalizeClip.mock.calls[0]?.[0];
    expect(finalizeArg.outputPath).toContain('/clean_source_clip_');
    expect(finalizeArg.outputPath).not.toContain('This is not a crop');
  });
});
