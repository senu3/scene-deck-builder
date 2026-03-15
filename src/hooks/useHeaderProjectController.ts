import { useCallback, useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { useDialog, useToast } from '../ui';
import type { MissingAssetInfo, RecoveryDecision } from '../components/MissingAssetRecoveryModal';
import { createAutosaveController, subscribeProjectChanges } from '../utils/autosave';
import { assessMetadataStore } from '../utils/metadataStore';
import {
  buildDerivedAssetIndexForSave,
  buildProjectSavePayload,
  serializeProjectSavePayload,
  prepareScenesForSave,
  ensureSceneIds,
  ensureSceneOrder,
} from '../utils/projectSave';
import {
  finalizePendingProjectLoad,
} from '../features/project/apply';
import { buildProjectLoadFailureAlert } from '../features/project/loadFailure';
import {
  formatRecoveryAssessmentSummary,
  getRecoveryAssessmentNotices,
  type RecoveryAssessment,
} from '../features/project/recoveryAssessment';
import {
  type PendingProject,
  buildProjectOpenInputs,
  diagnoseProjectOpen,
  loadRecentProjectsWithCleanup,
  openSelectedProject,
  readProjectIntegrityState,
  type ProjectOpenRequestResult,
} from '../features/project/session';
import {
  buildProjectAssetIndexRepairMessage,
  formatProjectAssetIntegrityMessage,
} from '../features/project/assetIntegrity';
import { upsertRecentProjectEntry } from '../features/project/recentProjects';
import {
  prepareProjectAssetIndexState,
  repairProjectAssetIndexFromProject,
} from '../features/project/assetIndexRepair';
import { createProjectIntegrityAssessment } from '../features/project/integrity';
import {
  type AppEffect,
  createSaveAssetIndexEffect,
  createSaveProjectEffect,
  createSaveRecentProjectsEffect,
  dispatchAppEffects,
  type AppEffectDispatchResult,
} from '../features/platform/effects';
import {
  hasElectronBridge,
  notifyAutosaveFlushedBridge,
  onAutosaveFlushRequestBridge,
  setAutosaveEnabledBridge,
} from '../features/platform/electronGateway';

function logFeatureEffectWarnings(scope: string, result: AppEffectDispatchResult): void {
  for (const warning of result.warnings) {
    console.warn(`[ProjectEffects] ${scope} warning`, warning);
  }
}

function hasFailedEffect(result: AppEffectDispatchResult, effectType: string): boolean {
  return result.results.some((entry) => !entry.success && entry.effect.type === effectType);
}

export function useHeaderProjectController() {
  const {
    projectLoaded,
    scenes,
    sceneOrder,
    vaultPath,
    projectPath,
    getAsset,
    clearProject,
    projectName,
    targetTotalDurationSec,
    cutRuntimeById,
    metadataStore,
    setProjectLoaded,
    setProjectPath,
    initializeProject,
    getSourcePanelState,
    initializeSourcePanel,
    loadMetadata,
    loadProject,
    setCutRuntimeHold,
    createStoreEventOperation,
    runWithStoreEventContext,
    emitCutRelinked,
  } = useStore();
  const { alert: dialogAlert, confirm: dialogConfirm } = useDialog();
  const { toast } = useToast();

  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);
  const [missingAssets, setMissingAssets] = useState<MissingAssetInfo[]>([]);
  const [pendingProject, setPendingProject] = useState<PendingProject | null>(null);
  const [pendingAssessment, setPendingAssessment] = useState<RecoveryAssessment | null>(null);

  const showUnexpectedProjectLoadAlert = useCallback(async (projectPath: string) => {
    await dialogAlert(buildProjectLoadFailureAlert({
      code: 'invalid-project-structure',
      projectPath,
    }));
  }, [dialogAlert]);

  const saveProjectInternal = useCallback(async (options?: { notify?: boolean; updateRecent?: boolean; allowPrompt?: boolean }) => {
    if (!hasElectronBridge()) {
      if (options?.notify !== false) {
        await dialogAlert({
          title: 'Unavailable',
          message: 'File system access is only available in the desktop app.',
          variant: 'warning',
        });
      }
      return;
    }

    const { scenes: normalizedScenes, missingCount } = ensureSceneIds(scenes);
    const { sceneOrder: normalizedSceneOrder, changed: sceneOrderChanged } = ensureSceneOrder(sceneOrder, normalizedScenes);
    const targetProjectPath = projectPath || (vaultPath ? `${vaultPath}/project.sdp` : undefined);
    const shouldUpdateStore = missingCount > 0 || sceneOrderChanged;

    let newIndex: ReturnType<typeof buildDerivedAssetIndexForSave> | null = null;
    try {
      const sceneIds = normalizedScenes.map((scene) => scene.id);
      if (vaultPath) {
        let readState = await readProjectIntegrityState(normalizedScenes, vaultPath);
        const preparedAssetIndex = await prepareProjectAssetIndexState({
          scenes: readState.scenes,
          sceneOrder: normalizedSceneOrder,
          vaultPath,
          assetIndex: readState.assetIndex,
        });

        if (preparedAssetIndex.action.kind === 'repair-confirm') {
          if (options?.allowPrompt === false) {
            console.warn('[ProjectSave] Autosave skipped because asset index repair requires confirmation.', preparedAssetIndex.action);
            return;
          }
          const confirmed = await dialogConfirm(buildProjectAssetIndexRepairMessage(preparedAssetIndex.action, 'save'));
          if (!confirmed) {
            return;
          }
          const repairedIndex = await repairProjectAssetIndexFromProject({
            scenes: readState.scenes,
            sceneOrder: normalizedSceneOrder,
            vaultPath,
            assetIndex: readState.assetIndex,
            repairContext: preparedAssetIndex.repairContext,
          });
          if (!repairedIndex) {
            throw new Error('Failed to repair asset index before save');
          }
          readState = await readProjectIntegrityState(normalizedScenes, vaultPath);
        } else if (preparedAssetIndex.action.kind === 'repair-silent') {
          const repairedIndex = await repairProjectAssetIndexFromProject({
            scenes: readState.scenes,
            sceneOrder: normalizedSceneOrder,
            vaultPath,
            assetIndex: readState.assetIndex,
            repairContext: preparedAssetIndex.repairContext,
          });
          if (!repairedIndex) {
            throw new Error('Failed to repair asset index before save');
          }
          readState = await readProjectIntegrityState(normalizedScenes, vaultPath);
        } else if (preparedAssetIndex.action.kind === 'block') {
          const message = preparedAssetIndex.action.reason === 'index-unreadable'
            ? 'The vault contains `assets/.index.json`, but it could not be read and the current project data is not enough to repair it safely.'
            : preparedAssetIndex.action.reason === 'index-invalid-schema'
              ? 'The vault contains `assets/.index.json`, but its structure is invalid and the current project data is not enough to repair it safely.'
              : preparedAssetIndex.action.reason === 'index-missing-unrebuildable'
                ? 'The vault is missing `assets/.index.json`, and the current project data is not enough to rebuild it safely.'
                : `${formatProjectAssetIntegrityMessage(preparedAssetIndex.integrity)} Check \`project.sdp\` and \`assets/.index.json\` before saving.`;
          if (options?.notify !== false) {
            await dialogAlert({
              title: 'Save Blocked',
              message,
              variant: 'warning',
            });
          } else {
            console.warn('[ProjectSave] Save blocked by asset integrity.', preparedAssetIndex);
          }
          return;
        }

        const metadataAssessment = assessMetadataStore(metadataStore, {
          sceneIds: readState.scenes.map((scene) => scene.id),
          assetIds: readState.assetIndex.kind === 'readable'
            ? readState.assetIndex.index.assets.map((entry) => entry.id)
            : undefined,
        });
        const validationDiagnosis = diagnoseProjectOpen(buildProjectOpenInputs(readState, {
          metadataAssessment,
        }), {
          projectSchemaVersion: 3,
          normalizationFlags: {
            sceneIdsAssigned: missingCount > 0,
            sceneOrderNormalized: sceneOrderChanged,
            sceneStructureNormalized: false,
            metadataNormalized: metadataAssessment.report.normalized,
          },
        });
        const validationAssessment = validationDiagnosis.assessment;
        const validationMessage = formatRecoveryAssessmentSummary(validationAssessment, 'save')
          || 'Project save was canceled because recovery checks could not be completed.';

        if (validationDiagnosis.recommendedAction === 'abort' || validationDiagnosis.assetIndex.kind !== 'readable') {
          if (options?.notify !== false) {
            await dialogAlert({
              title: 'Save Validation Failed',
              message: validationMessage,
              variant: 'warning',
            });
          }
          return;
        }

        if (validationAssessment.mode === 'repairable' && options?.allowPrompt !== false) {
          const confirmed = await dialogConfirm({
            title: 'Save Validation',
            message: `Continue saving with warnings? ${validationMessage}`,
            variant: 'warning',
            confirmLabel: 'Save Anyway',
            cancelLabel: 'Cancel',
          });
          if (!confirmed) {
            return;
          }
        }

        newIndex = buildDerivedAssetIndexForSave(validationDiagnosis.assetIndex.index, normalizedScenes, normalizedSceneOrder);
      } else {
        const metadataAssessment = assessMetadataStore(metadataStore, {
          sceneIds,
        });
        const validationAssessment = createProjectIntegrityAssessment({
          readableSceneCount: normalizedScenes.length,
          missingAssetCount: 0,
          metadataReport: metadataAssessment.report,
          projectSchemaVersion: 3,
          normalizationFlags: {
            sceneIdsAssigned: missingCount > 0,
            sceneOrderNormalized: sceneOrderChanged,
            sceneStructureNormalized: false,
            metadataNormalized: metadataAssessment.report.normalized,
          },
        });

        if (validationAssessment.mode === 'repairable' && options?.allowPrompt !== false) {
          const validationMessage = formatRecoveryAssessmentSummary(validationAssessment, 'save');
          const confirmed = await dialogConfirm({
            title: 'Save Validation',
            message: `Continue saving with warnings? ${validationMessage}`,
            variant: 'warning',
            confirmLabel: 'Save Anyway',
            cancelLabel: 'Cancel',
          });
          if (!confirmed) {
            return;
          }
        }
      }
    } catch (error) {
      console.error('Save validation failed:', error);
      if (options?.notify !== false) {
        await dialogAlert({
          title: 'Save Validation Failed',
          message: 'Project save was canceled because recovery checks could not be completed.',
          variant: 'warning',
        });
      }
      return;
    }

    if (shouldUpdateStore) {
      loadProject(normalizedScenes, normalizedSceneOrder);
    }

    // Prepare scenes with relative paths for portability
    const scenesToSave = prepareScenesForSave(normalizedScenes, getAsset);

    // Get source panel state for saving
    const sourcePanelState = getSourcePanelState();

    // Reorder asset index by Storyline order (scene/cut order)
    if (vaultPath && newIndex) {
      try {
        const indexSaveResult = await dispatchAppEffects([
          createSaveAssetIndexEffect({
            vaultPath,
            index: newIndex,
          }),
        ], {
          origin: 'feature',
        });
        logFeatureEffectWarnings('save-asset-index', indexSaveResult);
      } catch (error) {
        console.error('Failed to reorder asset index:', error);
      }
    }

    const projectPayload = buildProjectSavePayload({
      version: 3,
      name: projectName,
      vaultPath,
      scenes: scenesToSave,
      sceneOrder: normalizedSceneOrder,
      cutRuntimeById,
      targetTotalDurationSec,
      sourcePanel: sourcePanelState,
      savedAt: new Date().toISOString(),
    });
    const projectData = serializeProjectSavePayload(projectPayload);

    const saveEffects: AppEffect[] = targetProjectPath
      ? [
          createSaveProjectEffect({
            projectPath: targetProjectPath,
            projectData,
          }),
        ]
      : [];
    if (options?.updateRecent !== false && targetProjectPath) {
      const recentProjects = await loadRecentProjectsWithCleanup();
      const newRecent = {
        name: projectName,
        path: targetProjectPath,
        date: new Date().toISOString(),
      };
      saveEffects.push(createSaveRecentProjectsEffect({
        projects: upsertRecentProjectEntry(recentProjects, newRecent),
      }));
    }

    const saveResult = await dispatchAppEffects(saveEffects, {
      origin: 'feature',
    });
    logFeatureEffectWarnings('save-project', saveResult);

    if (targetProjectPath && !hasFailedEffect(saveResult, 'SAVE_PROJECT')) {
      setProjectPath(targetProjectPath);
      if (options?.notify !== false) {
        await dialogAlert({
          title: 'Saved',
          message: 'Project saved successfully.',
          variant: 'info',
        });
      }
    }
  }, [cutRuntimeById, dialogAlert, dialogConfirm, getAsset, getSourcePanelState, loadProject, metadataStore, projectName, projectPath, sceneOrder, scenes, setProjectPath, targetTotalDurationSec, vaultPath]);

  const handleSaveProject = useCallback(async () => {
    await saveProjectInternal();
  }, [saveProjectInternal]);

  const handleAutosaveProject = useCallback(async () => {
    if (!vaultPath) return;
    await saveProjectInternal({ notify: false, updateRecent: false, allowPrompt: false });
  }, [saveProjectInternal, vaultPath]);

  const finalizeProjectLoad = useCallback(async (project: PendingProject, recoveryDecisions?: RecoveryDecision[]) => {
    const result = await finalizePendingProjectLoad(project, {
      initializeProject,
      setCutRuntimeHold,
      setProjectPath,
      loadMetadata,
      initializeSourcePanel,
      createStoreEventOperation,
      runWithStoreEventContext,
      emitCutRelinked,
    }, recoveryDecisions);

    logFeatureEffectWarnings('save-recent-projects', result.recentSaveResult);

    // Clear recovery state
    setShowRecoveryDialog(false);
    setPendingProject(null);
    setMissingAssets([]);
    setPendingAssessment(null);

    if (result.assessment.mode === 'repairable' && getRecoveryAssessmentNotices(result.assessment, 'load').length > 0) {
      await dialogAlert({
        title: 'Recovery Report',
        message: formatRecoveryAssessmentSummary(result.assessment, 'load'),
        variant: 'warning',
      });
    }
  }, [
    createStoreEventOperation,
    dialogAlert,
    emitCutRelinked,
    initializeProject,
    initializeSourcePanel,
    loadMetadata,
    runWithStoreEventContext,
    setCutRuntimeHold,
    setProjectPath,
  ]);

  const handleRecoveryComplete = useCallback(async (decisions: RecoveryDecision[]) => {
    if (!pendingProject) return;
    await finalizeProjectLoad(pendingProject, decisions);
  }, [finalizeProjectLoad, pendingProject]);

  const handleRecoveryCancel = useCallback(() => {
    setShowRecoveryDialog(false);
    setPendingProject(null);
    setMissingAssets([]);
    setPendingAssessment(null);
  }, []);

  const applyProjectOpenResult = useCallback(async (result: ProjectOpenRequestResult) => {
    try {
      if (result.kind === 'canceled') {
        return;
      }
      if (result.kind === 'repair-required') {
        await dialogAlert({
          title: 'Project Could Not Be Repaired',
          message: 'The asset index could not be repaired.',
          variant: 'warning',
        });
        return;
      }
      if (result.kind === 'failure' || result.kind === 'corrupted') {
        await dialogAlert(buildProjectLoadFailureAlert(result.failure));
        return;
      }
      if (result.kind === 'pending') {
        setMissingAssets(result.missingAssets);
        setPendingProject(result.payload);
        setPendingAssessment(result.assessment);
        setShowRecoveryDialog(true);
        return;
      }

      await finalizeProjectLoad(result.payload);
    } catch (error) {
      console.error('Failed to apply project open result:', error);
      const fallbackPath = result.kind === 'pending' || result.kind === 'ready'
        ? result.payload.projectPath
        : (result.kind === 'failure' || result.kind === 'corrupted' ? result.failure.projectPath : 'selected-project');
      await showUnexpectedProjectLoadAlert(fallbackPath);
    }
  }, [dialogAlert, finalizeProjectLoad, showUnexpectedProjectLoadAlert]);

  const handleLoadProject = useCallback(async () => {
    if (!hasElectronBridge()) {
      await dialogAlert({
        title: 'Unavailable',
        message: 'File system access is only available in the desktop app.',
        variant: 'warning',
      });
      return;
    }

    try {
      let result = await openSelectedProject('Loaded Project');
      if (result.kind === 'repair-required') {
        const confirmed = await dialogConfirm(buildProjectAssetIndexRepairMessage(result.action, 'load'));
        if (!confirmed) return;
        result = await openSelectedProject('Loaded Project', { allowRepair: true });
      }
      await applyProjectOpenResult(result);
    } catch (error) {
      console.error('Failed to load selected project:', error);
      await showUnexpectedProjectLoadAlert('selected-project');
    }
  }, [applyProjectOpenResult, dialogAlert, showUnexpectedProjectLoadAlert]);

  const handleCloseProject = useCallback(async () => {
    const confirmed = await dialogConfirm({
      title: 'Open Project',
      message: 'Return to the startup screen? Any unsaved changes will be lost.',
      variant: 'danger',
      confirmLabel: 'Open Project',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;
    clearProject();
    setProjectLoaded(false);
  }, [clearProject, dialogConfirm, setProjectLoaded]);

  const handleCloseApp = useCallback(async () => {
    const confirmed = await dialogConfirm({
      title: 'Close App',
      message: 'Close the app? Any unsaved changes will be lost.',
      variant: 'danger',
      confirmLabel: 'Close',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;
    window.close();
  }, [dialogConfirm]);

  const disableAutosave = import.meta.env.VITE_DISABLE_AUTOSAVE === '1';
  const autosaveActive = projectLoaded && !!vaultPath && !disableAutosave;

  useEffect(() => {
    if (!autosaveActive) return;
    const controller = createAutosaveController({
      debounceMs: 1000,
      save: handleAutosaveProject,
      onError: (error) => {
        console.error('Autosave failed:', error);
        // TODO(autosave-toast): Update message/UX once autosave toast design is finalized.
        // See `docs/notes/archive/autosave-toast-notes.md` for required fields/behavior.
        toast.error('Autosave failed', 'Please save manually.', { id: 'autosave-failed' });
      },
    });
    const unsubscribe = subscribeProjectChanges(useStore, () => controller.schedule());
    return () => unsubscribe();
  }, [autosaveActive, handleAutosaveProject, toast]);

  useEffect(() => {
    setAutosaveEnabledBridge(autosaveActive).catch(() => {});
  }, [autosaveActive]);

  useEffect(() => {
    if (!autosaveActive) return;
    const unsubscribe = onAutosaveFlushRequestBridge(async () => {
      await handleAutosaveProject();
      notifyAutosaveFlushedBridge();
    });
    if (!unsubscribe) return;
    return () => unsubscribe();
  }, [autosaveActive, handleAutosaveProject]);

  return {
    handleSaveProject,
    handleLoadProject,
    handleCloseProject,
    handleCloseApp,
    showRecoveryDialog,
    missingAssets,
    pendingProject,
    pendingAssessment,
    handleRecoveryComplete,
    handleRecoveryCancel,
  };
}
