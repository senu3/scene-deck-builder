import { useCallback, useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { useDialog, useToast } from '../ui';
import type { MissingAssetInfo, RecoveryDecision } from '../components/MissingAssetRecoveryModal';
import { createAutosaveController, subscribeProjectChanges } from '../utils/autosave';
import { collectAssetRefs, findDanglingAssetRefs } from '../utils/assetRefs';
import {
  buildProjectSavePayload,
  serializeProjectSavePayload,
  prepareScenesForSave,
  getOrderedAssetIdsFromScenes,
  buildAssetUsageRefs,
  ensureSceneIds,
  ensureSceneOrder,
} from '../utils/projectSave';
import {
  finalizePendingProjectLoad,
} from '../features/project/apply';
import {
  type PendingProject,
  buildProjectLoadOutcome,
  loadRecentProjectsWithCleanup,
  requestProjectSelection,
} from '../features/project/session';
import {
  type AppEffect,
  createSaveAssetIndexEffect,
  createSaveProjectEffect,
  createSaveRecentProjectsEffect,
  dispatchAppEffects,
  type AppEffectDispatchResult,
} from '../features/platform/effects';
import {
  loadAssetIndexBridge,
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

  const saveProjectInternal = useCallback(async (options?: { notify?: boolean; updateRecent?: boolean; allowPrompt?: boolean }) => {
    if (!window.electronAPI) {
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
    if (missingCount > 0) {
      if (options?.allowPrompt !== false) {
        await dialogAlert({
          title: 'Scene ID の自動付与',
          message: `Scene ID が未設定のシーンが ${missingCount} 件あります。OK を押すと自動付与して保存を続行します。`,
          variant: 'warning',
          confirmLabel: 'OK',
        });
      }
      loadProject(normalizedScenes, normalizedSceneOrder);
    } else if (sceneOrderChanged) {
      loadProject(normalizedScenes, normalizedSceneOrder);
    }

    const targetProjectPath = projectPath || (vaultPath ? `${vaultPath}/project.sdp` : undefined);

    // Prepare scenes with relative paths for portability
    const scenesToSave = prepareScenesForSave(normalizedScenes, getAsset);

    // Get source panel state for saving
    const sourcePanelState = getSourcePanelState();

    // Reorder asset index by Storyline order (scene/cut order)
    if (vaultPath) {
      try {
        const orderedIds = getOrderedAssetIdsFromScenes(normalizedScenes, normalizedSceneOrder);
        const usageRefs = buildAssetUsageRefs(normalizedScenes, normalizedSceneOrder);
        const index = await loadAssetIndexBridge(vaultPath);
        if (!index) {
          throw new Error('Failed to load asset index');
        }
        const refs = collectAssetRefs(normalizedScenes, metadataStore);
        const existingAssetIds = new Set(index.assets.map((entry) => entry.id));
        const danglingRefs = findDanglingAssetRefs(refs, existingAssetIds);
        if (danglingRefs.length > 0) {
          const kinds = Array.from(new Set(danglingRefs.map((ref) => ref.kind)));
          console.warn('[SaveValidation] Dangling asset references detected:', danglingRefs);
          toast.warning(
            'Asset reference warning',
            `Missing references found before save (${kinds.join(', ')}).`
          );
        }
        const normalizedAssets = index.assets.map((entry) => ({
          ...entry,
          usageRefs: usageRefs.get(entry.id) || [],
        }));
        const remaining = normalizedAssets.filter(entry => !orderedIds.includes(entry.id));
        const ordered = orderedIds
          .map(id => normalizedAssets.find(entry => entry.id === id))
          .filter((entry): entry is NonNullable<typeof entry> => !!entry);
        const newIndex = {
          ...index,
          assets: [...ordered, ...remaining],
        };
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
  }, [cutRuntimeById, dialogAlert, getAsset, getSourcePanelState, loadProject, metadataStore, projectName, projectPath, sceneOrder, scenes, setProjectPath, targetTotalDurationSec, toast, vaultPath]);

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
    if (result.migrationSaveResult) {
      logFeatureEffectWarnings('save-project-migration', result.migrationSaveResult);
    }

    // Clear recovery state
    setShowRecoveryDialog(false);
    setPendingProject(null);
    setMissingAssets([]);
  }, [
    createStoreEventOperation,
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
  }, []);

  const handleLoadProject = useCallback(async () => {
    if (!window.electronAPI) {
      await dialogAlert({
        title: 'Unavailable',
        message: 'File system access is only available in the desktop app.',
        variant: 'warning',
      });
      return;
    }

    const result = await requestProjectSelection();
    if (result) {
      const outcome = await buildProjectLoadOutcome(result.data, result.path, 'Loaded Project');
      if (outcome.kind === 'pending') {
        setMissingAssets(outcome.missingAssets);
        setPendingProject(outcome.payload);
        setShowRecoveryDialog(true);
        return;
      }

      await finalizeProjectLoad(outcome.payload);
    }
  }, [dialogAlert, finalizeProjectLoad]);

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
    handleRecoveryComplete,
    handleRecoveryCancel,
  };
}
