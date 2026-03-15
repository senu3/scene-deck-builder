import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildRepairedAssetIndexFromProject,
  prepareProjectAssetIndexState,
} from '../assetIndexRepair';
import {
  calculateFileHashBridge,
  getFileInfoBridge,
  getRelativePathBridge,
  resolveVaultPathBridge,
} from '../../platform/electronGateway';

vi.mock('../../platform/electronGateway', () => ({
  calculateFileHashBridge: vi.fn(),
  getFileInfoBridge: vi.fn(),
  getRelativePathBridge: vi.fn(),
  resolveVaultPathBridge: vi.fn(),
  saveAssetIndexBridge: vi.fn(),
  withSerializedAssetIndexMutationBridge: vi.fn(async (run: () => Promise<unknown>) => run()),
}));

describe('project asset index repair', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getRelativePathBridge).mockResolvedValue(null);
    vi.mocked(resolveVaultPathBridge).mockResolvedValue({
      absolutePath: 'C:/vault/assets/new.png',
      exists: true,
    });
    vi.mocked(getFileInfoBridge).mockResolvedValue({
      name: 'new.png',
      path: 'C:/vault/assets/new.png',
      size: 123,
      modified: new Date('2026-03-14T00:00:00.000Z'),
      type: 'image',
      extension: 'png',
    });
    vi.mocked(calculateFileHashBridge).mockResolvedValue('hash-new');
  });

  it('marks indexed seed mismatches as confirm-repair candidates', async () => {
    const prepared = await prepareProjectAssetIndexState({
      vaultPath: 'C:/vault',
      assetIndex: {
        kind: 'readable',
        index: {
          version: 1,
          assets: [{
            id: 'asset-1',
            hash: 'hash-old',
            filename: 'old.png',
            originalName: 'old.png',
            originalPath: 'assets/old.png',
            type: 'image',
            fileSize: 10,
            importedAt: '2026-03-14T00:00:00.000Z',
          }],
        },
      },
      scenes: [{
        id: 'scene-1',
        name: 'Scene 1',
        notes: [],
        cuts: [{
          id: 'cut-1',
          assetId: 'asset-1',
          displayTime: 1,
          order: 0,
          asset: {
            id: 'asset-1',
            name: 'new.png',
            path: 'assets/new.png',
            vaultRelativePath: 'assets/new.png',
            type: 'image',
          },
        }],
      }],
    });

    expect(prepared.integrity.mismatchedIndexedAssetIds).toEqual(['asset-1']);
    expect(prepared.action).toEqual({
      kind: 'repair-confirm',
      reason: 'referenced-asset-mismatch',
    });
    expect(prepared.repairContext.requiredAssetIds).toEqual(['asset-1']);
  });

  it('preserves unused inventory while replacing referenced entries during repair', () => {
    const repaired = buildRepairedAssetIndexFromProject({
      scenes: [{
        id: 'scene-1',
        name: 'Scene 1',
        notes: [],
        cuts: [{
          id: 'cut-1',
          assetId: 'asset-1',
          displayTime: 1,
          order: 0,
        }],
      }],
      assetIndex: {
        kind: 'readable',
        index: {
          version: 1,
          assets: [
            {
              id: 'asset-1',
              hash: 'hash-old',
              filename: 'old.png',
              originalName: 'old.png',
              originalPath: 'assets/old.png',
              type: 'image',
              fileSize: 10,
              importedAt: '2026-03-14T00:00:00.000Z',
            },
            {
              id: 'asset-2',
              hash: 'hash-unused',
              filename: 'unused.png',
              originalName: 'unused.png',
              originalPath: 'assets/unused.png',
              type: 'image',
              fileSize: 11,
              importedAt: '2026-03-14T00:00:00.000Z',
            },
          ],
        },
      },
      repairContext: {
        referencedAssetIds: ['asset-1'],
        requiredAssetIds: ['asset-1'],
        repairableEntries: [{
          assetId: 'asset-1',
          filename: 'new.png',
          absolutePath: 'C:/vault/assets/new.png',
          vaultRelativePath: 'assets/new.png',
          originalName: 'new.png',
          originalPath: 'assets/new.png',
          type: 'image',
          fileSize: 123,
          hash: 'hash-new',
          importedAt: '2026-03-14T00:00:00.000Z',
        }],
        unrepairableAssetIds: [],
        mismatchedIndexedAssetIds: ['asset-1'],
        canRepairReferencedEntriesFromProject: true,
      },
    });

    expect(repaired.assets.find((entry) => entry.id === 'asset-1')?.filename).toBe('new.png');
    expect(repaired.assets.find((entry) => entry.id === 'asset-2')?.filename).toBe('unused.png');
  });
});
