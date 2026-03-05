import { describe, expect, it, vi } from 'vitest';
import { runEffects } from '../effectRunner';
import type { DeleteEffects } from '../effects';

describe('effectRunner', () => {
  it('runs effects in order', async () => {
    const trace: string[] = [];
    const effects: DeleteEffects[] = [
      {
        type: 'FILES_DELETE',
        payload: { assetPath: 'a', trashPath: 't', assetIds: ['asset-1'], reason: 'test' },
      },
      {
        type: 'INDEX_UPDATE',
        payload: { vaultPath: 'v', assetIds: ['asset-1'] },
      },
      {
        type: 'METADATA_DELETE',
        payload: { assetIds: ['asset-1'] },
      },
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
    });

    expect(trace).toEqual(['files', 'index', 'metadata']);
    expect(results).toHaveLength(3);
    expect(results.every((entry) => entry.success)).toBe(true);
  });

  it('stops when file delete fails', async () => {
    const removeAssetsFromIndex = vi.fn(async () => ({ success: true as const }));
    const deleteMetadata = vi.fn();
    const effects: DeleteEffects[] = [
      {
        type: 'FILES_DELETE',
        payload: { assetPath: 'a', trashPath: 't', assetIds: ['asset-1'] },
      },
      {
        type: 'INDEX_UPDATE',
        payload: { vaultPath: 'v', assetIds: ['asset-1'] },
      },
      {
        type: 'METADATA_DELETE',
        payload: { assetIds: ['asset-1'] },
      },
    ];

    const results = await runEffects(effects, {
      deleteAssetFile: vi.fn(async () => ({ success: false as const, reason: 'trash-move-failed' as const })),
      removeAssetsFromIndex,
      deleteMetadata,
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
    const effects: DeleteEffects[] = [
      {
        type: 'FILES_DELETE',
        payload: { assetPath: 'a', trashPath: 't', assetIds: ['asset-1'] },
      },
      {
        type: 'INDEX_UPDATE',
        payload: { vaultPath: 'v', assetIds: ['asset-1'] },
      },
      {
        type: 'METADATA_DELETE',
        payload: { assetIds: ['asset-1'] },
      },
    ];

    const results = await runEffects(effects, {
      deleteAssetFile: vi.fn(async () => ({ success: true })),
      removeAssetsFromIndex: vi.fn(async () => ({ success: false as const, reason: 'index-update-failed' as const })),
      deleteMetadata,
    });

    expect(results).toHaveLength(2);
    expect(results[1]).toMatchObject({
      success: false,
      reason: 'index-update-failed',
    });
    expect(deleteMetadata).not.toHaveBeenCalled();
  });
});
