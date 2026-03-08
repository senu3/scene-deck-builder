import { useCallback, useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { useDialog, useToast } from '../ui';
import type { Scene, Asset, SourcePanelState } from '../types';
import type { MissingAssetInfo, RecoveryDecision } from '../components/MissingAssetRecoveryModal';
import { resolveCutAsset } from '../utils/assetResolve';
import { createAutosaveController, subscribeProjectChanges } from '../utils/autosave';
import { collectAssetRefs, findDanglingAssetRefs } from '../utils/assetRefs';
import {
  buildProjectSavePayload,
  type PersistedCutRuntimeById,
  normalizePersistedCutRuntimeById,
  serializeProjectSavePayload,
  prepareScenesForSave,
  getOrderedAssetIdsFromScenes,
  buildAssetUsageRefs,
  ensureSceneIds,
  ensureSceneOrder,
} from '../utils/projectSave';
import {
  applyRecoveryDecisionsToScenes,
  collectRecoveryRelinkEventCandidates,
  hasLegacyRelativeAssetPaths,
  normalizeLoadedProjectVersion,
  regenerateCutClipThumbnails,
  resolveLoadedVaultPath,
  resolveScenesAssets,
} from '../features/project/load';

// Pending project data for recovery dialog
interface PendingProject {
  name: string;
  vaultPath: string;
  scenes: Scene[];
  sceneOrder?: string[];
  targetTotalDurationSec?: number;
  cutRuntimeById?: PersistedCutRuntimeById;
  sourcePanelState?: SourcePanelState;
  projectPath: string;
  shouldResaveVersion?: boolean;
}

export function useHeaderProjectController() {
  const {
    projectLoaded,
    scenes,
    sceneOrder,
    vaultPath,
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

    // Prepare scenes with relative paths for portability
    const scenesToSave = prepareScenesForSave(normalizedScenes, getAsset);

    // Get source panel state for saving
    const sourcePanelState = getSourcePanelState();

    // Reorder asset index by Storyline order (scene/cut order)
    if (vaultPath && window.electronAPI.loadAssetIndex && window.electronAPI.vaultGateway?.saveAssetIndex) {
      try {
        const orderedIds = getOrderedAssetIdsFromScenes(normalizedScenes, normalizedSceneOrder);
        const usageRefs = buildAssetUsageRefs(normalizedScenes, normalizedSceneOrder);
        const index = await window.electronAPI.loadAssetIndex(vaultPath);
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
        await window.electronAPI.vaultGateway.saveAssetIndex(vaultPath, newIndex);
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

    const savedPath = await window.electronAPI.saveProject(projectData, vaultPath ? `${vaultPath}/project.sdp` : undefined);
    if (savedPath) {
      setProjectPath(savedPath);
      if (options?.notify !== false) {
        await dialogAlert({
          title: 'Saved',
          message: 'Project saved successfully.',
          variant: 'info',
        });
      }

      if (options?.updateRecent !== false) {
        // Update recent projects
        const recentProjects = await window.electronAPI.getRecentProjects();
        const newRecent = {
          name: projectName,
          path: savedPath,
          date: new Date().toISOString(),
        };
        const filtered = recentProjects.filter(p => p.path !== savedPath);
        await window.electronAPI.saveRecentProjects([newRecent, ...filtered.slice(0, 9)]);
      }
    }
  }, [cutRuntimeById, dialogAlert, getAsset, getSourcePanelState, loadProject, metadataStore, projectName, sceneOrder, scenes, setProjectPath, targetTotalDurationSec, toast, vaultPath]);

  const handleSaveProject = useCallback(async () => {
    await saveProjectInternal();
  }, [saveProjectInternal]);

  const handleAutosaveProject = useCallback(async () => {
    if (!vaultPath) return;
    await saveProjectInternal({ notify: false, updateRecent: false, allowPrompt: false });
  }, [saveProjectInternal, vaultPath]);

  const finalizeProjectLoad = useCallback(async (project: PendingProject, recoveryDecisions?: RecoveryDecision[]) => {
    const beforeRecoveryScenes = project.scenes;
    let finalScenes = await applyRecoveryDecisionsToScenes(
      project.scenes,
      project.vaultPath,
      recoveryDecisions
    );
    const recoveryRelinks = collectRecoveryRelinkEventCandidates(beforeRecoveryScenes, finalScenes, recoveryDecisions);
    finalScenes = await regenerateCutClipThumbnails(finalScenes);

    initializeProject({
      name: project.name,
      vaultPath: project.vaultPath,
      scenes: finalScenes,
      sceneOrder: project.sceneOrder,
      targetTotalDurationSec: project.targetTotalDurationSec,
    });
    if (project.cutRuntimeById) {
      for (const [cutId, runtime] of Object.entries(project.cutRuntimeById)) {
        if (runtime?.hold) {
          setCutRuntimeHold(cutId, runtime.hold);
        }
      }
    }
    setProjectPath(project.projectPath);

    // Load metadata store (audio attachments, etc.)
    await loadMetadata(project.vaultPath);

    // Initialize source panel state
    await initializeSourcePanel(project.sourcePanelState, project.vaultPath);

    if (recoveryRelinks.length > 0) {
      const context = createStoreEventOperation('recovery');
      await runWithStoreEventContext(context, async () => {
        for (const relink of recoveryRelinks) {
          emitCutRelinked(relink);
        }
      });
    }

    // Update recent projects
    const recentProjects = await window.electronAPI?.getRecentProjects() || [];
    const newRecent = {
      name: project.name,
      path: project.projectPath,
      date: new Date().toISOString(),
    };
    const filtered = recentProjects.filter((p: any) => p.path !== project.projectPath);
    await window.electronAPI?.saveRecentProjects([newRecent, ...filtered.slice(0, 9)]);

    if (project.shouldResaveVersion && window.electronAPI) {
      try {
        const assetById = new Map<string, Asset>();
        for (const scene of finalScenes) {
          for (const cut of scene.cuts) {
            const asset = resolveCutAsset(cut, () => undefined);
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
        await window.electronAPI.saveProject(serializeProjectSavePayload(payload), project.projectPath);
      } catch (error) {
        console.warn('[ProjectLoad] Failed to persist version migration:', error);
      }
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

    const result = await window.electronAPI.loadProject();
    if (result) {
      const { data, path } = result;
      const projectData = data as {
        name?: string;
        vaultPath?: string;
        scenes?: Scene[];
        sceneOrder?: string[];
        version?: number;
        targetTotalDurationSec?: number;
        cutRuntimeById?: unknown;
        sourcePanel?: SourcePanelState;
      };

      // Determine vault path
      const loadedVaultPath = resolveLoadedVaultPath(projectData.vaultPath, path);

      // Resolve asset paths (v2+ uses relative paths)
      let loadedScenes = projectData.scenes || [];
      let foundMissingAssets: MissingAssetInfo[] = [];
      const normalizedVersion = normalizeLoadedProjectVersion(projectData.version, loadedScenes);

      if (
        normalizedVersion.version >= 2 ||
        hasLegacyRelativeAssetPaths(loadedScenes)
      ) {
        const resolved = await resolveScenesAssets(loadedScenes, loadedVaultPath);
        loadedScenes = resolved.scenes;
        foundMissingAssets = resolved.missingAssets;
      }
      const loadedCutRuntimeById = normalizePersistedCutRuntimeById(projectData.cutRuntimeById, loadedScenes);

      // If there are missing assets, show recovery dialog
      if (foundMissingAssets.length > 0) {
        setMissingAssets(foundMissingAssets);
        setPendingProject({
          name: projectData.name || 'Loaded Project',
          vaultPath: loadedVaultPath,
          scenes: loadedScenes,
          sceneOrder: projectData.sceneOrder,
          targetTotalDurationSec: projectData.targetTotalDurationSec,
          cutRuntimeById: loadedCutRuntimeById,
          sourcePanelState: projectData.sourcePanel,
          projectPath: path,
          shouldResaveVersion: normalizedVersion.wasMissing,
        });
        setShowRecoveryDialog(true);
        return;
      }

      // No missing assets, proceed directly
      await finalizeProjectLoad({
        name: projectData.name || 'Loaded Project',
        vaultPath: loadedVaultPath,
        scenes: loadedScenes,
        sceneOrder: projectData.sceneOrder,
        targetTotalDurationSec: projectData.targetTotalDurationSec,
        cutRuntimeById: loadedCutRuntimeById,
        sourcePanelState: projectData.sourcePanel,
        projectPath: path,
        shouldResaveVersion: normalizedVersion.wasMissing,
      });
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
    if (!window.electronAPI?.setAutosaveEnabled) return;
    window.electronAPI.setAutosaveEnabled(autosaveActive).catch(() => {});
  }, [autosaveActive]);

  useEffect(() => {
    if (!autosaveActive) return;
    if (!window.electronAPI?.onAutosaveFlushRequest || !window.electronAPI?.notifyAutosaveFlushed) return;
    const unsubscribe = window.electronAPI.onAutosaveFlushRequest(async () => {
      await handleAutosaveProject();
      window.electronAPI?.notifyAutosaveFlushed();
    });
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
