import { describe, expect, it, vi } from 'vitest';
import { runEffects } from '../effectRunner';
import {
  createFilesDeleteEffect,
  createIndexUpdateEffect,
  createMetadataDeleteEffect,
  createRegenThumbnailsEffect,
  createSaveMetadataEffect,
} from '../effects';

describe('effectRunner', () => {
  it('runs effects in order', async () => {
    const trace: string[] = [];
    const effects = [
      createFilesDeleteEffect({ assetPath: 'a', trashPath: 't', assetIds: ['asset-1'], reason: 'test' }),
      createIndexUpdateEffect({ vaultPath: 'v', assetIds: ['asset-1'] }),
      createMetadataDeleteEffect({ assetIds: ['asset-1'] }),
    ];

    const results = await runEffects(effects, {
      deleteAssetFile: vi.fn(async () => {
        trace.push('files');
        return { success: true };
      }),
      removeAssetsFromIndex: vi.fn(async () => {
        trace.push('index');
        return { success: true };
      }),
      deleteMetadata: vi.fn(async () => {
        trace.push('metadata');
      }),
      saveMetadata: vi.fn(async () => true),
    });

    expect(trace).toEqual(['files', 'index', 'metadata']);
    expect(results).toHaveLength(3);
    expect(results.every((entry) => entry.success)).toBe(true);
  });

  it('stops when file delete fails', async () => {
    const removeAssetsFromIndex = vi.fn(async () => ({ success: true as const }));
    const deleteMetadata = vi.fn();
    const effects = [
      createFilesDeleteEffect({ assetPath: 'a', trashPath: 't', assetIds: ['asset-1'] }),
      createIndexUpdateEffect({ vaultPath: 'v', assetIds: ['asset-1'] }),
      createMetadataDeleteEffect({ assetIds: ['asset-1'] }),
    ];

    const results = await runEffects(effects, {
      deleteAssetFile: vi.fn(async () => ({ success: false as const, reason: 'trash-move-failed' as const })),
      removeAssetsFromIndex,
      deleteMetadata,
      saveMetadata: vi.fn(async () => true),
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      success: false,
      reason: 'trash-move-failed',
    });
    expect(removeAssetsFromIndex).not.toHaveBeenCalled();
    expect(deleteMetadata).not.toHaveBeenCalled();
  });

  it('does not run metadata delete when index update fails', async () => {
    const deleteMetadata = vi.fn();
    const effects = [
      createFilesDeleteEffect({ assetPath: 'a', trashPath: 't', assetIds: ['asset-1'] }),
      createIndexUpdateEffect({ vaultPath: 'v', assetIds: ['asset-1'] }),
      createMetadataDeleteEffect({ assetIds: ['asset-1'] }),
    ];

    const results = await runEffects(effects, {
      deleteAssetFile: vi.fn(async () => ({ success: true })),
      removeAssetsFromIndex: vi.fn(async () => ({ success: false as const, reason: 'index-update-failed' as const })),
      deleteMetadata,
      saveMetadata: vi.fn(async () => true),
    });

    expect(results).toHaveLength(2);
    expect(results[1]).toMatchObject({
      success: false,
      reason: 'index-update-failed',
    });
    expect(deleteMetadata).not.toHaveBeenCalled();
  });

  it('runs thumbnail regeneration effect via injected handler', async () => {
    const requestThumbnailRegeneration = vi.fn(async () => undefined);
    const effects = [
      createRegenThumbnailsEffect({
        profile: 'timeline-card',
        cutIds: ['cut-1'],
        reason: 'test',
        requests: [
          {
            sceneId: 'scene-1',
            cutId: 'cut-1',
            assetPath: '/vault/assets/a.mp4',
            mode: 'clip',
            inPointSec: 1,
            outPointSec: 2,
          },
        ],
      }),
    ];

    const results = await runEffects(effects, {
      deleteAssetFile: vi.fn(async () => ({ success: true })),
      removeAssetsFromIndex: vi.fn(async () => ({ success: true })),
      deleteMetadata: vi.fn(),
      saveMetadata: vi.fn(async () => true),
      requestThumbnailRegeneration,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.success).toBe(true);
    expect(requestThumbnailRegeneration).toHaveBeenCalledTimes(1);
  });

  it('runs metadata save effect via injected handler', async () => {
    const saveMetadata = vi.fn(async () => true);
    const effects = [
      createSaveMetadataEffect({
        vaultPath: 'C:/vault',
        store: { version: 1, metadata: {}, sceneMetadata: {} },
      }),
    ];

    const results = await runEffects(effects, {
      deleteAssetFile: vi.fn(async () => ({ success: true })),
      removeAssetsFromIndex: vi.fn(async () => ({ success: true })),
      deleteMetadata: vi.fn(),
      saveMetadata,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.success).toBe(true);
    expect(saveMetadata).toHaveBeenCalledTimes(1);
  });
});
