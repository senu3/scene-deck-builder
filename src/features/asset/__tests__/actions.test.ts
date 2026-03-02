import { describe, expect, it, vi } from 'vitest';
import { runAssetDelete } from '../actions';

describe('asset actions delete', () => {
  it('returns warning when index sync failed after file deletion', async () => {
    const result = await runAssetDelete(
      {
        assetPath: 'C:/vault/assets/aud_1.wav',
        sourceName: 'aud_1.wav',
        assetType: 'audio',
        linkedAssetIds: ['aud-1'],
        fallbackAssetId: 'aud-1',
        hasClipRange: false,
      },
      {
        reason: 'asset-panel-delete',
        assetRefs: new Map(),
      },
      {
        deleteAssetWithPolicy: vi.fn(async () => ({
          success: true,
          reason: 'index-sync-failed',
        })),
      }
    );

    expect(result).toEqual({
      success: true,
      assetIds: ['aud-1'],
      warning: 'index-sync-failed',
    });
  });
});
