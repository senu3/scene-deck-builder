import { describe, expect, it, vi } from 'vitest';
import {
  createDerivedCutAndSyncGroup,
  cropImageAndAddCut,
  finalizeClipAndAddCut,
  finalizeClipFromContext,
  moveCutsToSceneEnd,
  removeCutsFromScenes,
} from '../actions';

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
    const finalizeClip = vi.fn(async (_options: { outputPath: string }) => ({ success: true, fileSize: 1024 * 1024 }));
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
    const finalizeClip = vi.fn(async (_options: { outputPath: string }) => ({ success: true, fileSize: 1024 }));
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
    expect(finalizeClip).toHaveBeenCalledTimes(1);
    const finalizeArg = finalizeClip.mock.calls[0]![0];
    expect(finalizeArg.outputPath).toContain('/clean_source_clip_');
    expect(finalizeArg.outputPath).not.toContain('This is not a crop');
  });

  it('removes selected cuts across scenes', () => {
    const scenes = [
      { id: 'scene-1', cuts: [{ id: 'cut-a' }, { id: 'cut-b' }] },
      { id: 'scene-2', cuts: [{ id: 'cut-c' }] },
    ];
    const removeCut = vi.fn();

    const removed = removeCutsFromScenes(scenes, ['cut-c', 'cut-a'], removeCut);

    expect(removed).toBe(2);
    expect(removeCut).toHaveBeenCalledTimes(2);
    expect(removeCut).toHaveBeenNthCalledWith(1, 'scene-2', 'cut-c');
    expect(removeCut).toHaveBeenNthCalledWith(2, 'scene-1', 'cut-a');
  });

  it('moves selected cuts to target scene end', () => {
    const scenes = [
      { id: 'scene-1', cuts: [{ id: 'cut-a' }] },
      { id: 'scene-2', cuts: [{ id: 'cut-b' }, { id: 'cut-c' }] },
    ];
    const moveCutsToScene = vi.fn();

    const moved = moveCutsToSceneEnd(scenes, ['cut-a'], 'scene-2', moveCutsToScene);

    expect(moved).toBe(true);
    expect(moveCutsToScene).toHaveBeenCalledWith(['cut-a'], 'scene-2', 2);
  });

  it('does not move cuts when target scene is missing', () => {
    const scenes = [{ id: 'scene-1', cuts: [{ id: 'cut-a' }] }];
    const moveCutsToScene = vi.fn();

    const moved = moveCutsToSceneEnd(scenes, ['cut-a'], 'missing-scene', moveCutsToScene);

    expect(moved).toBe(false);
    expect(moveCutsToScene).not.toHaveBeenCalled();
  });

  it('returns missing-vault for finalize context without vaultPath', async () => {
    const result = await finalizeClipFromContext({
      sceneId: 'scene-1',
      sourceCutId: 'cut-a',
      insertIndex: 1,
      cut: { isClip: true, inPoint: 0, outPoint: 1 },
      asset: { path: 'C:/assets/src.mp4', name: 'src.mp4' },
      reverseOutput: false,
      vaultPath: null,
      createCutFromImport: vi.fn(async () => 'new-cut'),
      getCutGroup: vi.fn(() => undefined),
      updateGroupCutOrder: vi.fn(),
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('missing-vault');
  });

  it('returns invalid-clip for finalize context when cut is not clip', async () => {
    const result = await finalizeClipFromContext({
      sceneId: 'scene-1',
      sourceCutId: 'cut-a',
      insertIndex: 1,
      cut: { isClip: false, inPoint: 0, outPoint: 1 },
      asset: { path: 'C:/assets/src.mp4', name: 'src.mp4' },
      reverseOutput: false,
      vaultPath: 'C:/vault',
      createCutFromImport: vi.fn(async () => 'new-cut'),
      getCutGroup: vi.fn(() => undefined),
      updateGroupCutOrder: vi.fn(),
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('invalid-clip');
  });
});
