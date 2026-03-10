import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyPendingProjectToStore,
  finalizePendingProjectLoad,
} from '../apply';
import {
  createSaveProjectEffect,
  createSaveRecentProjectsEffect,
  dispatchAppEffects,
} from '../../platform/effects';
import { loadRecentProjectsWithCleanup } from '../session';
import {
  applyRecoveryDecisionsToScenes,
  collectRecoveryRelinkEventCandidates,
  regenerateCutClipThumbnails,
} from '../load';

vi.mock('../../platform/electronGateway', () => ({
  getRecentProjectsBridge: vi.fn(),
  pathExistsBridge: vi.fn(),
}));

vi.mock('../../platform/effects', async () => {
  const actual = await vi.importActual<typeof import('../../platform/effects')>('../../platform/effects');
  return {
    ...actual,
    dispatchAppEffects: vi.fn(),
  };
});

vi.mock('../session', async () => {
  const actual = await vi.importActual<typeof import('../session')>('../session');
  return {
    ...actual,
    loadRecentProjectsWithCleanup: vi.fn(),
  };
});

vi.mock('../load', async () => {
  const actual = await vi.importActual<typeof import('../load')>('../load');
  return {
    ...actual,
    applyRecoveryDecisionsToScenes: vi.fn(),
    collectRecoveryRelinkEventCandidates: vi.fn(),
    regenerateCutClipThumbnails: vi.fn(),
  };
});

function createDeps() {
  return {
    initializeProject: vi.fn(),
    setCutRuntimeHold: vi.fn(),
    setProjectPath: vi.fn(),
    loadMetadata: vi.fn(async () => undefined),
    initializeSourcePanel: vi.fn(async () => undefined),
    createStoreEventOperation: vi.fn(() => ({ origin: 'recovery' as const, opId: 'op-1' })),
    runWithStoreEventContext: vi.fn(async (_context, run: () => void | Promise<void>) => {
      await run();
    }),
    emitCutRelinked: vi.fn(),
  };
}

describe('project apply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dispatchAppEffects).mockResolvedValue({
      results: [],
      warnings: [],
    });
  });

  it('restores hold state only for cuts that remain after recovery', async () => {
    const project = {
      name: 'Loaded Project',
      vaultPath: '/vault',
      scenes: [{
        id: 'scene-1',
        name: 'Scene 1',
        notes: [],
        cuts: [
          {
            id: 'cut-1',
            order: 0,
            displayTime: 1,
            assetId: 'asset-1',
            asset: { id: 'asset-1', name: 'a.png', path: '/vault/a.png', type: 'image' as const },
          },
          {
            id: 'cut-2',
            order: 1,
            displayTime: 2,
            assetId: 'asset-2',
            asset: { id: 'asset-2', name: 'b.png', path: '/vault/b.png', type: 'image' as const },
          },
        ],
      }],
      sceneOrder: ['scene-1'],
      cutRuntimeById: {
        'cut-1': { hold: { enabled: true, mode: 'tail' as const, durationMs: 900 } },
        'cut-2': { hold: { enabled: true, mode: 'tail' as const, durationMs: 1200 } },
      },
      sourcePanelState: undefined,
      projectPath: '/vault/project.sdp',
    };
    const finalScenes = [{
      ...project.scenes[0],
      cuts: [project.scenes[0].cuts[1]],
    }];
    vi.mocked(applyRecoveryDecisionsToScenes).mockResolvedValue(finalScenes);
    vi.mocked(collectRecoveryRelinkEventCandidates).mockReturnValue([]);
    vi.mocked(regenerateCutClipThumbnails).mockResolvedValue(finalScenes);
    const deps = createDeps();

    await applyPendingProjectToStore(project, deps, [{
      sceneId: 'scene-1',
      cutId: 'cut-1',
      action: 'delete',
    }]);

    expect(deps.initializeProject).toHaveBeenCalledWith(expect.objectContaining({
      scenes: finalScenes,
    }));
    expect(deps.setCutRuntimeHold).toHaveBeenCalledTimes(1);
    expect(deps.setCutRuntimeHold).toHaveBeenCalledWith('cut-2', {
      enabled: true,
      mode: 'tail',
      durationMs: 1200,
    });
  });

  it('finalizes pending project load through shared recent and migration persistence', async () => {
    const project = {
      name: 'Loaded Project',
      vaultPath: '/vault',
      scenes: [{
        id: 'scene-1',
        name: 'Scene 1',
        notes: [],
        cuts: [{
          id: 'cut-1',
          order: 0,
          displayTime: 2,
          assetId: 'asset-1',
          asset: { id: 'asset-1', name: 'clip.mp4', path: '/vault/clip.mp4', type: 'video' as const, duration: 2 },
        }],
      }],
      sceneOrder: ['scene-1'],
      cutRuntimeById: {
        'cut-1': { hold: { enabled: true, mode: 'tail' as const, durationMs: 1100 } },
      },
      sourcePanelState: undefined,
      projectPath: '/vault/project.sdp',
      shouldResaveVersion: true,
      targetTotalDurationSec: 2,
    };
    vi.mocked(applyRecoveryDecisionsToScenes).mockResolvedValue(project.scenes);
    vi.mocked(collectRecoveryRelinkEventCandidates).mockReturnValue([]);
    vi.mocked(regenerateCutClipThumbnails).mockResolvedValue(project.scenes);
    vi.mocked(loadRecentProjectsWithCleanup).mockResolvedValue([
      { name: 'Other', path: '/other/project.sdp', date: '2026-03-09T00:00:00.000Z' },
    ]);
    const deps = createDeps();

    const result = await finalizePendingProjectLoad(project, deps);

    expect(loadRecentProjectsWithCleanup).toHaveBeenCalledTimes(1);
    expect(dispatchAppEffects).toHaveBeenCalledTimes(2);
    expect(vi.mocked(dispatchAppEffects).mock.calls[0]?.[0]).toEqual([
      createSaveRecentProjectsEffect({
        projects: result.persistencePlan.recentProjects,
      }),
    ]);
    expect(vi.mocked(dispatchAppEffects).mock.calls[1]?.[0]).toEqual([
      createSaveProjectEffect({
        projectPath: project.projectPath,
        projectData: result.persistencePlan.migrationProjectData!,
      }),
    ]);
    expect(result.persistencePlan.recentProjects[0]).toEqual(expect.objectContaining({
      name: project.name,
      path: project.projectPath,
    }));
  });
});
