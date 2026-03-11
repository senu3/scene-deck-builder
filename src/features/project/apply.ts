import type { RecoveryDecision } from '../../components/MissingAssetRecoveryModal';
import type { CutRuntimeState, Scene, SourcePanelState } from '../../types';
import type { StoreEventOperationContext } from '../../store/events';
import { resolveCutAssetSeed } from '../../utils/assetResolve';
import {
  buildProjectSavePayload,
  ensureSceneOrder,
  prepareScenesForSave,
  serializeProjectSavePayload,
} from '../../utils/projectSave';
import {
  createSaveProjectEffect,
  createSaveRecentProjectsEffect,
  dispatchAppEffects,
  type AppEffectDispatchResult,
} from '../platform/effects';
import {
  commitRecoverySceneChanges,
  collectRecoveryRelinkEventCandidates,
  planRecoverySceneChanges,
  regenerateCutClipThumbnails,
} from './load';
import {
  loadRecentProjectsWithCleanup,
  type PendingProject,
  type RecentProjectEntry,
} from './session';

export interface ProjectLoadApplyDeps {
  initializeProject: (project: {
    name: string;
    vaultPath: string;
    scenes: Scene[];
    sceneOrder?: string[];
    targetTotalDurationSec?: number;
  }) => void;
  setCutRuntimeHold: (cutId: string, hold: NonNullable<CutRuntimeState['hold']>) => void;
  setProjectPath: (path: string | null) => void;
  loadMetadata: (vaultPath: string) => Promise<void>;
  initializeSourcePanel: (state: SourcePanelState | undefined, vaultPath: string | null) => void | Promise<void>;
  createStoreEventOperation: (
    origin: StoreEventOperationContext['origin'],
    opId?: string
  ) => StoreEventOperationContext;
  runWithStoreEventContext: (
    context: StoreEventOperationContext,
    run: () => void | Promise<void>
  ) => Promise<void>;
  emitCutRelinked: (input: {
    sceneId: string;
    cutId: string;
    previousAssetId?: string;
    nextAssetId: string;
  }) => void;
}

export interface ProjectLoadPersistencePlan {
  recentProjects: RecentProjectEntry[];
  migrationProjectData?: string;
}

export interface FinalizeProjectLoadResult {
  finalScenes: Scene[];
  persistencePlan: ProjectLoadPersistencePlan;
  recentSaveResult: AppEffectDispatchResult;
  migrationSaveResult?: AppEffectDispatchResult;
}

export async function applyPendingProjectToStore(
  project: PendingProject,
  deps: ProjectLoadApplyDeps,
  recoveryDecisions?: RecoveryDecision[]
): Promise<Scene[]> {
  const beforeRecoveryScenes = project.scenes;
  const recoveryPlan = await planRecoverySceneChanges(project.scenes, recoveryDecisions);
  const recoveryCommit = await commitRecoverySceneChanges(recoveryPlan, project.vaultPath);
  if (recoveryCommit.failedRelinks.length > 0) {
    console.warn('[ProjectLoad] Recovery commit completed with failed relinks.', recoveryCommit.failedRelinks);
  }
  let finalScenes = recoveryCommit.scenes;
  const recoveryRelinks = collectRecoveryRelinkEventCandidates(beforeRecoveryScenes, finalScenes, recoveryDecisions);
  finalScenes = await regenerateCutClipThumbnails(finalScenes);
  const finalCutIds = new Set(
    finalScenes.flatMap((scene) => scene.cuts.map((cut) => cut.id))
  );

  deps.initializeProject({
    name: project.name,
    vaultPath: project.vaultPath,
    scenes: finalScenes,
    sceneOrder: project.sceneOrder,
    targetTotalDurationSec: project.targetTotalDurationSec,
  });

  if (project.cutRuntimeById) {
    for (const [cutId, runtime] of Object.entries(project.cutRuntimeById)) {
      if (runtime?.hold && finalCutIds.has(cutId)) {
        deps.setCutRuntimeHold(cutId, runtime.hold);
      }
    }
  }

  deps.setProjectPath(project.projectPath);
  await deps.loadMetadata(project.vaultPath);
  await deps.initializeSourcePanel(project.sourcePanelState, project.vaultPath);

  if (recoveryRelinks.length > 0) {
    const context = deps.createStoreEventOperation('recovery');
    await deps.runWithStoreEventContext(context, async () => {
      for (const relink of recoveryRelinks) {
        deps.emitCutRelinked(relink);
      }
    });
  }

  return finalScenes;
}

export async function finalizePendingProjectLoad(
  project: PendingProject,
  deps: ProjectLoadApplyDeps,
  recoveryDecisions?: RecoveryDecision[]
): Promise<FinalizeProjectLoadResult> {
  const finalScenes = await applyPendingProjectToStore(project, deps, recoveryDecisions);
  const recentProjects = await loadRecentProjectsWithCleanup();
  const persistencePlan = buildProjectLoadPersistencePlan(project, finalScenes, recentProjects);
  const recentSaveResult = await dispatchAppEffects([
    createSaveRecentProjectsEffect({
      projects: persistencePlan.recentProjects,
    }),
  ], {
    origin: 'feature',
  });

  let migrationSaveResult: AppEffectDispatchResult | undefined;
  if (persistencePlan.migrationProjectData) {
    migrationSaveResult = await dispatchAppEffects([
      createSaveProjectEffect({
        projectPath: project.projectPath,
        projectData: persistencePlan.migrationProjectData,
      }),
    ], {
      origin: 'feature',
    });
  }

  return {
    finalScenes,
    persistencePlan,
    recentSaveResult,
    migrationSaveResult,
  };
}

export function buildProjectLoadPersistencePlan(
  project: PendingProject,
  finalScenes: Scene[],
  recentProjects: RecentProjectEntry[]
): ProjectLoadPersistencePlan {
  const newRecent: RecentProjectEntry = {
    name: project.name,
    path: project.projectPath,
    date: new Date().toISOString(),
  };
  const filtered = recentProjects.filter((entry) => entry.path !== project.projectPath);
  const nextRecentProjects = [newRecent, ...filtered.slice(0, 9)];

  if (!project.shouldResaveVersion) {
    return {
      recentProjects: nextRecentProjects,
    };
  }

  const assetById = new Map<string, NonNullable<ReturnType<typeof resolveCutAssetSeed>>>();
  for (const scene of finalScenes) {
    for (const cut of scene.cuts) {
      const asset = resolveCutAssetSeed(cut, () => undefined);
      if (!asset) continue;
      const resolvedId = cut.assetId || asset.id;
      if (!resolvedId) continue;
      assetById.set(resolvedId, { ...asset, id: resolvedId });
    }
  }
  const scenesToSave = prepareScenesForSave(finalScenes, (assetId) => assetById.get(assetId));
  const { sceneOrder: normalizedSceneOrder } = ensureSceneOrder(project.sceneOrder, finalScenes);
  const payload = buildProjectSavePayload({
    version: 3,
    name: project.name,
    vaultPath: project.vaultPath,
    scenes: scenesToSave,
    sceneOrder: normalizedSceneOrder,
    cutRuntimeById: project.cutRuntimeById,
    targetTotalDurationSec: project.targetTotalDurationSec,
    sourcePanel: project.sourcePanelState,
    savedAt: new Date().toISOString(),
  });

  return {
    recentProjects: nextRecentProjects,
    migrationProjectData: serializeProjectSavePayload(payload),
  };
}
