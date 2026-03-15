import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Scene } from '../../../types';
import {
  buildProjectLoadOutcome,
  buildProjectOpenRequestResult,
  createProjectBootstrap,
  loadRecentProjectsWithCleanup,
  parseLoadedProjectForOpen,
  requestProjectFromPath,
  requestProjectSelection,
} from '../session';
import {
  calculateFileHashBridge,
  createVaultBridge,
  ensureAssetsFolderBridge,
  getFileInfoBridge,
  getFolderContentsBridge,
  getRelativePathBridge,
  getRecentProjectsBridge,
  loadProjectBridge,
  loadProjectFromPathBridge,
  pathExistsBridge,
  readAssetIndexBridge,
  resolveVaultPathBridge,
  saveAssetIndexBridge,
  withSerializedAssetIndexMutationBridge,
} from '../../platform/electronGateway';
import { loadMetadataStoreWithReport } from '../../../utils/metadataStore';
import { resolveScenesAssets } from '../load';

vi.mock('../../platform/electronGateway', () => ({
  createVaultBridge: vi.fn(),
  ensureAssetsFolderBridge: vi.fn(),
  getFolderContentsBridge: vi.fn(),
  getRecentProjectsBridge: vi.fn(),
  loadProjectBridge: vi.fn(),
  loadProjectFromPathBridge: vi.fn(),
  pathExistsBridge: vi.fn(),
  readAssetIndexBridge: vi.fn(),
  getRelativePathBridge: vi.fn(),
  resolveVaultPathBridge: vi.fn(),
  getFileInfoBridge: vi.fn(),
  calculateFileHashBridge: vi.fn(),
  saveAssetIndexBridge: vi.fn(),
  withSerializedAssetIndexMutationBridge: vi.fn(async (run: () => Promise<unknown>) => run()),
  selectVaultBridge: vi.fn(),
}));

vi.mock('../../../utils/metadataStore', () => ({
  loadMetadataStoreWithReport: vi.fn(),
}));

vi.mock('../load', async () => {
  const actual = await vi.importActual<typeof import('../load')>('../load');
  return {
    ...actual,
    resolveScenesAssets: vi.fn(),
  };
});

describe('project session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readAssetIndexBridge).mockResolvedValue({
      kind: 'readable',
      index: { version: 1, assets: [] },
    });
    vi.mocked(getRelativePathBridge).mockResolvedValue(null);
    vi.mocked(resolveVaultPathBridge).mockResolvedValue({
      absolutePath: 'C:/vault/assets/legacy.png',
      exists: true,
    });
    vi.mocked(getFileInfoBridge).mockResolvedValue({
      name: 'legacy.png',
      path: 'C:/vault/assets/legacy.png',
      size: 123,
      modified: new Date('2026-03-14T00:00:00.000Z'),
      type: 'image',
      extension: 'png',
    });
    vi.mocked(calculateFileHashBridge).mockResolvedValue('hash-legacy');
    vi.mocked(saveAssetIndexBridge).mockResolvedValue(true);
    vi.mocked(withSerializedAssetIndexMutationBridge).mockImplementation(async (run: () => Promise<unknown>) => run());
    vi.mocked(loadMetadataStoreWithReport).mockResolvedValue({
      store: { version: 1, metadata: {}, sceneMetadata: {} },
      report: {
        metadataSchemaVersion: 1,
        skippedMetadataCount: 0,
        orphanMetadataCount: 0,
        orphanSceneMetadataCount: 0,
        orphanAssetMetadataCount: 0,
        normalizedLipSyncCount: 0,
        invalidRootFallbackCount: 0,
        normalized: false,
      },
    });
  });

  it('filters missing recent projects and persists cleanup through callback', async () => {
    vi.mocked(getRecentProjectsBridge).mockResolvedValue([
      { name: 'A', path: 'C:/a/project.sdp', date: '2026-03-10T00:00:00.000Z' },
      { name: 'B', path: 'C:/b/project.sdp', date: '2026-03-09T00:00:00.000Z' },
    ]);
    vi.mocked(pathExistsBridge)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const persist = vi.fn(async () => undefined);

    const projects = await loadRecentProjectsWithCleanup(persist);

    expect(projects).toEqual([
      { name: 'A', path: 'C:/a/project.sdp', date: '2026-03-10T00:00:00.000Z' },
    ]);
    expect(persist).toHaveBeenCalledWith(projects);
  });

  it('creates project bootstrap payload with default scenes and structure', async () => {
    vi.mocked(createVaultBridge).mockResolvedValue({ path: 'C:/vault/Test' });
    vi.mocked(ensureAssetsFolderBridge).mockResolvedValue('C:/vault/Test/assets');
    vi.mocked(getFolderContentsBridge).mockResolvedValue([
      { name: 'assets', path: 'C:/vault/Test/assets', isDirectory: true },
    ]);

    const result = await createProjectBootstrap('C:/vault', 'Test');

    expect(result?.vaultPath).toBe('C:/vault/Test');
    expect(result?.projectFilePath).toBe('C:/vault/Test/project.sdp');
    expect(result?.defaultScenes).toHaveLength(3);
    expect(result?.defaultSceneOrder).toHaveLength(3);
    expect(result?.structure).toEqual([
      { name: 'assets', path: 'C:/vault/Test/assets', isDirectory: true },
    ]);
  });

  it('builds pending load outcome when resolved scenes still have missing assets', async () => {
    vi.mocked(resolveScenesAssets).mockResolvedValue({
      scenes: [{
        id: 'scene-1',
        name: 'Scene 1',
        cuts: [],
        notes: [],
      }],
      missingAssets: [{
        name: 'missing.png',
        cutId: 'cut-1',
        sceneId: 'scene-1',
        asset: {
          id: 'asset-1',
          name: 'missing.png',
          path: 'assets/missing.png',
          type: 'image',
        },
      }],
    });

    const outcome = await buildProjectLoadOutcome({
      name: 'Loaded',
      vaultPath: 'C:/vault',
      scenes: [{
        id: 'scene-1',
        name: 'Scene 1',
        cuts: [],
        notes: [],
      }],
      version: 3,
    }, 'C:/vault/project.sdp', 'Loaded Project');

    expect(outcome.kind).toBe('pending');
    if (outcome.kind !== 'pending') {
      throw new Error(`expected pending outcome, received ${outcome.kind}`);
    }
    expect(outcome.payload.projectPath).toBe('C:/vault/project.sdp');
    expect(outcome.assessment.mode).toBe('repairable');
  });

  it('normalizes legacy scene collections before recovery planning', async () => {
    vi.mocked(readAssetIndexBridge).mockResolvedValue({
      kind: 'readable',
      index: {
        version: 1,
        assets: [{
          id: 'asset-1',
          hash: 'hash-legacy',
          filename: 'legacy.png',
          originalName: 'legacy.png',
          originalPath: 'assets/legacy.png',
          usageRefs: [{
            sceneId: 'scene-1',
            sceneName: 'Scene 1',
            sceneOrder: 0,
            cutId: 'cut-1',
            cutOrder: 0,
            cutIndex: 1,
          }],
          type: 'image',
          fileSize: 123,
          importedAt: '2026-03-14T00:00:00.000Z',
        }],
      },
    });
    vi.mocked(resolveScenesAssets).mockResolvedValue({
      scenes: [{
        id: 'scene-1',
        name: 'Scene 1',
        cuts: [{
          id: 'cut-1',
          assetId: 'asset-1',
          displayTime: 1,
          order: 0,
          asset: {
            id: 'asset-1',
            name: 'legacy.png',
            path: 'assets/legacy.png',
            type: 'image',
          },
        }],
        notes: [],
      }],
      missingAssets: [],
    });

    const outcome = await buildProjectLoadOutcome({
      name: 'Legacy',
      vaultPath: 'C:/vault',
      scenes: [{
        id: 'scene-1',
        name: 'Scene 1',
        cuts: [{
          id: 'cut-1',
          assetId: 'asset-1',
          displayTime: 1,
          asset: {
            id: 'asset-1',
            name: 'legacy.png',
            path: 'assets/legacy.png',
            type: 'image',
          },
        }],
      } as Scene],
      version: 3,
    }, 'C:/vault/project.sdp', 'Legacy Project');

    if (outcome.kind !== 'ready') {
      throw new Error(`expected ready outcome, received ${outcome.kind}`);
    }
    expect(outcome.payload.scenes[0]).toEqual(expect.objectContaining({
      notes: [],
      cuts: [expect.objectContaining({
        id: 'cut-1',
        order: 0,
      })],
    }));
    expect(outcome.assessment.report.normalizationFlags.sceneStructureNormalized).toBe(true);
  });

  it('returns repair-required when referenced asset ids require confirmation before rebuilding index', async () => {
    vi.mocked(resolveScenesAssets).mockResolvedValue({
      scenes: [{
        id: 'scene-1',
        name: 'Scene 1',
        cuts: [{
          id: 'cut-1',
          assetId: 'asset-1',
          displayTime: 1,
          order: 0,
          asset: {
            id: 'asset-1',
            name: 'legacy.png',
            path: 'assets/legacy.png',
            vaultRelativePath: 'assets/legacy.png',
            type: 'image',
          },
        }],
        notes: [],
      }],
      missingAssets: [],
    });

    const outcome = await buildProjectLoadOutcome({
      name: 'Repair',
      vaultPath: 'C:/vault',
      scenes: [{
        id: 'scene-1',
        name: 'Scene 1',
        cuts: [{
          id: 'cut-1',
          assetId: 'asset-1',
          displayTime: 1,
          order: 0,
          asset: {
            id: 'asset-1',
            name: 'legacy.png',
            path: 'assets/legacy.png',
            vaultRelativePath: 'assets/legacy.png',
            type: 'image',
          },
        }],
        notes: [],
      }],
      version: 3,
    }, 'C:/vault/project.sdp', 'Repair Project');

    expect(outcome).toEqual({
      kind: 'repair-required',
      action: {
        kind: 'repair-confirm',
        reason: 'referenced-asset-mismatch',
      },
    });
  });

  it('reports structural normalization separately from parsed scene values', () => {
    const parsed = parseLoadedProjectForOpen({
      name: 'Legacy',
      scenes: [{
        id: 'scene-1',
        name: 'Scene 1',
        cuts: [{
          id: 'cut-1',
          assetId: 'asset-1',
          displayTime: 1,
          audioBindings: 'broken',
        }],
        notes: 'broken',
        groups: [{
          id: 'group-1',
          cutIds: ['cut-1', 123],
        }],
      } as unknown as Scene],
      version: 3,
    }, 'C:/vault/project.sdp', 'Legacy Project');

    expect(parsed.structureReport).toMatchObject({
      missingNotesArrayCount: 1,
      invalidGroupCutIdCount: 1,
      assignedCutOrderCount: 1,
      normalizedCutAudioBindingsCount: 1,
      normalized: true,
    });
    expect(parsed.scenes[0]).toEqual(expect.objectContaining({
      notes: [],
      groups: [expect.objectContaining({ cutIds: ['cut-1'] })],
      cuts: [expect.objectContaining({
        order: 0,
        audioBindings: undefined,
      })],
    }));
  });

  it('falls back to the project directory when embedded vaultPath is invalid', async () => {
    vi.mocked(resolveScenesAssets).mockResolvedValue({
      scenes: [],
      missingAssets: [],
    });

    const outcome = await buildProjectLoadOutcome({
      name: { invalid: true },
      vaultPath: { invalid: true },
      sourcePanel: 'broken',
      scenes: [],
      version: 3,
    }, 'C:/vault/project.sdp', 'Fallback Project');

    if (outcome.kind !== 'ready') {
      throw new Error(`expected ready outcome, received ${outcome.kind}`);
    }
    expect(outcome.payload.name).toBe('Fallback Project');
    expect(outcome.payload.vaultPath).toBe('C:/vault');
    expect(outcome.payload.sourcePanelState).toBeUndefined();
  });

  it('rejects v3 projects that do not include a scenes array', async () => {
    const outcome = await buildProjectLoadOutcome({
      name: 'Broken',
      vaultPath: 'C:/vault',
      version: 3,
    }, 'C:/vault/project.sdp', 'Broken Project');

    expect(outcome).toEqual({
      kind: 'corrupted',
      failure: {
        code: 'project-corrupted-index-present',
        projectPath: 'C:/vault/project.sdp',
      },
    });
  });

  it('derives the fallback name from the project file path for path-based opens', async () => {
    vi.mocked(resolveScenesAssets).mockResolvedValue({
      scenes: [],
      missingAssets: [],
    });

    const result = await buildProjectOpenRequestResult({
      kind: 'success',
      path: 'C:/vault/broken.sdp',
      data: {
        version: 3,
        scenes: [],
      },
    }, 'stale-name');

    if (result.kind !== 'ready') {
      throw new Error(`expected ready result, received ${result.kind}`);
    }
    expect(result.payload.name).toBe('broken');
  });

  it('returns corrupted outcome when load diagnosis throws unexpectedly', async () => {
    vi.mocked(resolveScenesAssets).mockRejectedValue(new Error('boom'));
    vi.mocked(readAssetIndexBridge).mockResolvedValue({
      kind: 'missing',
    });

    const outcome = await buildProjectLoadOutcome({
      name: 'Broken',
      vaultPath: 'C:/vault',
      scenes: [],
      version: 3,
    }, 'C:/vault/project.sdp', 'Broken Project');

    expect(outcome).toEqual({
      kind: 'corrupted',
      failure: {
        code: 'project-vault-link-broken',
        projectPath: 'C:/vault/project.sdp',
      },
    });
  });

  it('maps file-load errors into selection failures', async () => {
    vi.mocked(loadProjectBridge).mockResolvedValue({
      kind: 'error',
      code: 'invalid-json',
      path: 'C:/vault/project.sdp',
    });

    const result = await requestProjectSelection();

    expect(result).toEqual({
      kind: 'failure',
      failure: {
        code: 'invalid-json',
        projectPath: 'C:/vault/project.sdp',
      },
    });
  });

  it('maps path-based load success into a typed selection result', async () => {
    vi.mocked(loadProjectFromPathBridge).mockResolvedValue({
      kind: 'success',
      path: 'C:/vault/project.sdp',
      data: {
        version: 3,
        scenes: [],
      },
    });

    const result = await requestProjectFromPath('C:/vault/project.sdp');

    expect(result).toEqual({
      kind: 'success',
      path: 'C:/vault/project.sdp',
      data: {
        version: 3,
        scenes: [],
      },
    });
  });

  it('rejects legacy project schema during load outcome build', async () => {
    const outcome = await buildProjectLoadOutcome({
      name: 'Legacy',
      vaultPath: 'C:/vault',
      scenes: [],
      version: 2,
    }, 'C:/vault/project.sdp', 'Legacy Project');

    expect(outcome).toEqual({
      kind: 'corrupted',
      failure: {
        code: 'unsupported-schema',
        projectPath: 'C:/vault/project.sdp',
        schemaVersion: 2,
      },
    });
    expect(resolveScenesAssets).not.toHaveBeenCalled();
  });

  it('rejects invalid project roots before recovery planning', async () => {
    const outcome = await buildProjectLoadOutcome(null, 'C:/vault/project.sdp', 'Broken Project');

    expect(outcome).toEqual({
      kind: 'corrupted',
      failure: {
        code: 'project-corrupted-index-present',
        projectPath: 'C:/vault/project.sdp',
      },
    });
  });

  it('marks metadata drift as repairable even without missing assets', async () => {
    vi.mocked(resolveScenesAssets).mockResolvedValue({
      scenes: [{
        id: 'scene-1',
        name: 'Scene 1',
        cuts: [],
        notes: [],
      }],
      missingAssets: [],
    });
    vi.mocked(loadMetadataStoreWithReport).mockResolvedValue({
      store: { version: 1, metadata: {}, sceneMetadata: {} },
      report: {
        metadataSchemaVersion: 1,
        skippedMetadataCount: 2,
        orphanMetadataCount: 1,
        orphanSceneMetadataCount: 1,
        orphanAssetMetadataCount: 0,
        normalizedLipSyncCount: 1,
        invalidRootFallbackCount: 0,
        normalized: true,
      },
    });

    const outcome = await buildProjectLoadOutcome({
      name: 'Loaded',
      vaultPath: 'C:/vault',
      scenes: [{
        id: 'scene-1',
        name: 'Scene 1',
        cuts: [],
        notes: [],
      }],
      version: 3,
    }, 'C:/vault/project.sdp', 'Loaded Project');

    expect(outcome.kind).toBe('ready');
    if (outcome.kind !== 'ready') {
      throw new Error(`expected ready outcome, received ${outcome.kind}`);
    }
    expect(outcome.assessment.mode).toBe('repairable');
    expect(outcome.assessment.report.skippedMetadataCount).toBe(2);
    expect(outcome.assessment.report.normalizationFlags.metadataNormalized).toBe(true);
  });
});
