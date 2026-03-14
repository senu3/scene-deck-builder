import { useCallback, useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { useDialog, useToast } from '../ui';
import type { MissingAssetInfo, RecoveryDecision } from '../components/MissingAssetRecoveryModal';
import { createAutosaveController, subscribeProjectChanges } from '../utils/autosave';
import { collectAssetRefs, findDanglingAssetRefs } from '../utils/assetRefs';
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
  loadRecentProjectsWithCleanup,
  openSelectedProject,
  type ProjectOpenRequestResult,
} from '../features/project/session';
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
  readAssetIndexBridge,
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
        const assetIndexResult = await readAssetIndexBridge(vaultPath);
        const index = assetIndexResult.kind === 'readable' ? assetIndexResult.index : null;
        const refs = collectAssetRefs(normalizedScenes, metadataStore);
        const existingAssetIdSet = new Set(index?.assets.map((entry) => entry.id) || []);
        const danglingRefs = index ? findDanglingAssetRefs(refs, existingAssetIdSet) : [];
        const metadataAssessment = assessMetadataStore(metadataStore, {
          sceneIds,
          assetIds: index?.assets.map((entry) => entry.id),
        });
        const validationAssessment = createProjectIntegrityAssessment({
          readableSceneCount: normalizedScenes.length,
          missingAssetCount: danglingRefs.length,
          assetIndexState: assetIndexResult.kind,
          metadataReport: metadataAssessment.report,
          projectSchemaVersion: 3,
          normalizationFlags: {
            sceneIdsAssigned: missingCount > 0,
            sceneOrderNormalized: sceneOrderChanged,
            sceneStructureNormalized: false,
            metadataNormalized: metadataAssessment.report.normalized,
          },
        });

        if (!index) {
          if (options?.notify !== false) {
            await dialogAlert({
              title: 'Save Validation Failed',
              message: formatRecoveryAssessmentSummary(validationAssessment, 'save') || 'Asset index checks could not be completed.',
              variant: 'warning',
            });
          }
          return;
        }

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

        newIndex = buildDerivedAssetIndexForSave(index, normalizedScenes, normalizedSceneOrder);
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
      const filtered = recentProjects.filter(p => p.path !== targetProjectPath);
      saveEffects.push(createSaveRecentProjectsEffect({
        projects: [newRecent, ...filtered.slice(0, 9)],
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
    if (result.kind === 'canceled') {
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
  }, [dialogAlert, finalizeProjectLoad]);

  const handleLoadProject = useCallback(async () => {
    if (!hasElectronBridge()) {
      await dialogAlert({
        title: 'Unavailable',
        message: 'File system access is only available in the desktop app.',
        variant: 'warning',
      });
      return;
    }

    const result = await openSelectedProject('Loaded Project');
    await applyProjectOpenResult(result);
  }, [applyProjectOpenResult, dialogAlert]);

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
