import { describe, expect, it } from 'vitest';
import { buildLipSyncAssetSets } from '../AssetPanel';
import type { MetadataStore } from '../../types';

describe('buildLipSyncAssetSets', () => {
  it('does not classify owner/base/variant/rms/sourceVideo as generated', () => {
    const metadataStore: MetadataStore = {
      version: 1,
      metadata: {
        'asset-owner': {
          assetId: 'asset-owner',
          lipSync: {
            baseImageAssetId: 'asset-owner',
            variantAssetIds: ['variant-1', 'variant-2', 'variant-3'],
            rmsSourceAudioAssetId: 'audio-1',
            sourceVideoAssetId: 'asset-owner',
            ownedGeneratedAssetIds: ['asset-owner', 'variant-1', 'mask-1', 'comp-1'],
            orphanedGeneratedAssetIds: ['audio-1', 'comp-2'],
            maskAssetId: 'mask-1',
            compositedFrameAssetIds: ['comp-1', 'comp-2', 'comp-3', 'comp-4'],
            thresholds: { t1: 0.2, t2: 0.4, t3: 0.6 },
            fps: 60,
            ownerAssetId: 'asset-owner',
            version: 2,
          },
        },
      },
      sceneMetadata: {},
    };

    const { lipSyncGeneratedAssetIds, lipSyncOwnerAssetIds } = buildLipSyncAssetSets(metadataStore);

    expect(lipSyncOwnerAssetIds.has('asset-owner')).toBe(true);
    expect(lipSyncGeneratedAssetIds.has('asset-owner')).toBe(false);
    expect(lipSyncGeneratedAssetIds.has('variant-1')).toBe(false);
    expect(lipSyncGeneratedAssetIds.has('audio-1')).toBe(false);
    expect(lipSyncGeneratedAssetIds.has('mask-1')).toBe(true);
    expect(lipSyncGeneratedAssetIds.has('comp-1')).toBe(true);
    expect(lipSyncGeneratedAssetIds.has('comp-2')).toBe(true);
  });
});
