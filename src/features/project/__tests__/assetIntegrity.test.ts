import { describe, expect, it } from 'vitest';
import {
  evaluateProjectAssetIntegrity,
  planProjectAssetIndexAction,
} from '../assetIntegrity';

describe('project asset integrity', () => {
  it('marks projects as referenced-asset mismatch when referenced ids are absent from index', () => {
    const result = evaluateProjectAssetIntegrity([
      {
        id: 'scene-1',
        name: 'Scene 1',
        notes: [],
        cuts: [
          { id: 'cut-1', assetId: 'asset-a', displayTime: 1, order: 0 },
          { id: 'cut-2', assetId: 'asset-b', displayTime: 1, order: 1 },
        ],
      },
    ], {
      version: 1,
      assets: [
        {
          id: 'asset-x',
          hash: 'hash-x',
          filename: 'asset-x.png',
          originalName: 'asset-x.png',
          originalPath: 'assets/asset-x.png',
          type: 'image',
          fileSize: 1,
          importedAt: '2026-03-14T00:00:00.000Z',
        },
      ],
    });

    expect(result.status).toBe('referenced-asset-mismatch');
    expect(result.indexedReferencedAssetIds).toEqual([]);
    expect(result.unindexedReferencedAssetIds).toEqual(['asset-a', 'asset-b']);
  });

  it('marks projects as usage mismatch when only derived usage/order is stale', () => {
    const result = evaluateProjectAssetIntegrity([
      {
        id: 'scene-1',
        name: 'Scene 1',
        notes: [],
        cuts: [
          { id: 'cut-1', assetId: 'asset-a', displayTime: 1, order: 0 },
        ],
      },
    ], {
      version: 1,
      assets: [
        {
          id: 'asset-a',
          hash: 'hash-a',
          filename: 'asset-a.png',
          originalName: 'asset-a.png',
          originalPath: 'assets/asset-a.png',
          usageRefs: [],
          type: 'image',
          fileSize: 1,
          importedAt: '2026-03-14T00:00:00.000Z',
        },
      ],
    });

    expect(result.status).toBe('usage-mismatch-only');
    expect(result.indexedReferencedAssetIds).toEqual(['asset-a']);
    expect(result.unindexedReferencedAssetIds).toEqual([]);
    expect(result.usageMismatchAssetIds).toEqual(['asset-a']);
  });

  it('marks projects as ok when every referenced asset id is indexed and derived data matches', () => {
    const result = evaluateProjectAssetIntegrity([
      {
        id: 'scene-1',
        name: 'Scene 1',
        notes: [],
        cuts: [
          { id: 'cut-1', assetId: 'asset-a', displayTime: 1, order: 0 },
        ],
      },
    ], {
      version: 1,
      assets: [
        {
          id: 'asset-a',
          hash: 'hash-a',
          filename: 'asset-a.png',
          originalName: 'asset-a.png',
          originalPath: 'assets/asset-a.png',
          usageRefs: [
            {
              sceneId: 'scene-1',
              sceneName: 'Scene 1',
              sceneOrder: 0,
              cutId: 'cut-1',
              cutOrder: 0,
              cutIndex: 1,
            },
          ],
          type: 'image',
          fileSize: 1,
          importedAt: '2026-03-14T00:00:00.000Z',
        },
      ],
    });

    expect(result.status).toBe('ok');
    expect(result.referencedAssetIds).toEqual(['asset-a']);
    expect(result.indexedReferencedAssetIds).toEqual(['asset-a']);
    expect(result.unindexedReferencedAssetIds).toEqual([]);
  });

  it('plans confirm repair for readable index mismatches that can be repaired from project', () => {
    const integrity = evaluateProjectAssetIntegrity([
      {
        id: 'scene-1',
        name: 'Scene 1',
        notes: [],
        cuts: [
          { id: 'cut-1', assetId: 'asset-a', displayTime: 1, order: 0 },
        ],
      },
    ], {
      version: 1,
      assets: [],
    });

    const action = planProjectAssetIndexAction({
      indexState: 'readable',
      integrity,
      canRepairReferencedEntriesFromProject: true,
    });

    expect(action).toEqual({
      kind: 'repair-confirm',
      reason: 'referenced-asset-mismatch',
    });
  });

  it('blocks when missing index cannot be rebuilt from project', () => {
    const integrity = evaluateProjectAssetIntegrity([
      {
        id: 'scene-1',
        name: 'Scene 1',
        notes: [],
        cuts: [
          { id: 'cut-1', assetId: 'asset-a', displayTime: 1, order: 0 },
        ],
      },
    ], null);

    const action = planProjectAssetIndexAction({
      indexState: 'missing',
      integrity,
      canRepairReferencedEntriesFromProject: false,
    });

    expect(action).toEqual({
      kind: 'block',
      reason: 'index-missing-unrebuildable',
    });
  });
});
