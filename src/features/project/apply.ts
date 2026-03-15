import type { MissingAssetInfo, RecoveryDecision } from '../../components/MissingAssetRecoveryModal';
import type { CutRuntimeState, Scene, SourcePanelState } from '../../types';
import type { StoreEventOperationContext } from '../../store/events';
import {
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
  diagnoseProjectState,
  loadRecentProjectsWithCleanup,
  type PendingProject,
  type ProjectOpenDiagnosis,
  type RecentProjectEntry,
} from './session';
import type { RecoveryAssessment } from './recoveryAssessment';

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
}

export interface FinalizeProjectLoadResult {
  finalScenes: Scene[];
  missingAssets: MissingAssetInfo[];
  diagnosis: ProjectOpenDiagnosis;
  assessment: RecoveryAssessment;
  persistencePlan: ProjectLoadPersistencePlan;
  recentSaveResult: AppEffectDispatchResult;
}

export interface ApplyPendingProjectResult {
  finalScenes: Scene[];
  missingAssets: MissingAssetInfo[];
  diagnosis: ProjectOpenDiagnosis;
  assessment: RecoveryAssessment;
}

export async function applyPendingProjectToStore(
  project: PendingProject,
  deps: ProjectLoadApplyDeps,
  recoveryDecisions?: RecoveryDecision[]
): Promise<ApplyPendingProjectResult> {
  const beforeRecoveryScenes = project.scenes;
  const recoveryPlan = await planRecoverySceneChanges(project.scenes, recoveryDecisions);
  const recoveryCommit = await commitRecoverySceneChanges(recoveryPlan, project.vaultPath);
  if (recoveryCommit.failedRelinks.length > 0) {
    console.warn('[ProjectLoad] Recovery commit completed with failed relinks.', recoveryCommit.failedRelinks);
  }
  let finalScenes = recoveryCommit.scenes;
  finalScenes = await regenerateCutClipThumbnails(finalScenes);
  const postRecoveryDiagnosis = await diagnoseProjectState(finalScenes, project.vaultPath, {
    rescuedCutCount: recoveryCommit.committedRelinks.length,
    projectSchemaVersion: 3,
  });
  finalScenes = postRecoveryDiagnosis.scenes;
  const recoveryRelinks = collectRecoveryRelinkEventCandidates(beforeRecoveryScenes, finalScenes, recoveryDecisions);
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

  return {
    finalScenes,
    missingAssets: postRecoveryDiagnosis.missingAssets,
    diagnosis: postRecoveryDiagnosis,
    assessment: postRecoveryDiagnosis.assessment,
  };
}

export async function finalizePendingProjectLoad(
  project: PendingProject,
  deps: ProjectLoadApplyDeps,
  recoveryDecisions?: RecoveryDecision[]
): Promise<FinalizeProjectLoadResult> {
  const applied = await applyPendingProjectToStore(project, deps, recoveryDecisions);
  const recentProjects = await loadRecentProjectsWithCleanup();
  const persistencePlan = buildProjectLoadPersistencePlan(project, recentProjects, applied.diagnosis);
  const recentSaveResult = await dispatchAppEffects([
    createSaveRecentProjectsEffect({
      projects: persistencePlan.recentProjects,
    }),
  ], {
    origin: 'feature',
  });

  return {
    finalScenes: applied.finalScenes,
    missingAssets: applied.missingAssets,
    diagnosis: applied.diagnosis,
    assessment: applied.assessment,
    persistencePlan,
    recentSaveResult,
  };
}

function shouldPersistRecentProject(diagnosis: ProjectOpenDiagnosis): boolean {
  return diagnosis.recommendedAction !== 'abort';
}

export function buildProjectLoadPersistencePlan(
  project: PendingProject,
  recentProjects: RecentProjectEntry[],
  diagnosis: ProjectOpenDiagnosis,
): ProjectLoadPersistencePlan {
  if (!shouldPersistRecentProject(diagnosis)) {
    return {
      recentProjects,
    };
  }

  const newRecent: RecentProjectEntry = {
    name: project.name,
    path: project.projectPath,
    date: new Date().toISOString(),
  };
  const filtered = recentProjects.filter((entry) => entry.path !== project.projectPath);
  return {
    recentProjects: [newRecent, ...filtered.slice(0, 9)],
  };
}
