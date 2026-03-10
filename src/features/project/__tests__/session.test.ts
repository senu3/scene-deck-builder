import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildProjectLoadOutcome,
  createProjectBootstrap,
  loadRecentProjectsWithCleanup,
} from '../session';
import {
  createVaultBridge,
  ensureAssetsFolderBridge,
  getFolderContentsBridge,
  getRecentProjectsBridge,
  pathExistsBridge,
} from '../../platform/electronGateway';
import { resolveScenesAssets } from '../load';

vi.mock('../../platform/electronGateway', () => ({
  createVaultBridge: vi.fn(),
  ensureAssetsFolderBridge: vi.fn(),
  getFolderContentsBridge: vi.fn(),
  getRecentProjectsBridge: vi.fn(),
  loadProjectBridge: vi.fn(),
  loadProjectFromPathBridge: vi.fn(),
  pathExistsBridge: vi.fn(),
  selectVaultBridge: vi.fn(),
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
      version: 2,
    }, 'C:/vault/project.sdp', 'Loaded Project');

    expect(outcome.kind).toBe('pending');
    expect(outcome.payload.projectPath).toBe('C:/vault/project.sdp');
  });
});
