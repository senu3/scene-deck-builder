import { useCallback, useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { useDialog, useToast } from '../ui';
import type { Scene, Asset, SourcePanelState } from '../types';
import type { MissingAssetInfo, RecoveryDecision } from '../components/MissingAssetRecoveryModal';
import { importFileToVault } from '../utils/assetPath';
import { extractVideoMetadata } from '../utils/videoUtils';
import { getThumbnail } from '../utils/thumbnailCache';
import { getCuttableMediaType } from '../utils/mediaType';
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

// Resolve asset paths from relative to absolute
async function resolveAssetPath(asset: Asset, vaultPath: string): Promise<Asset> {
  // Check if path looks like a relative vault path
  if (asset.path.startsWith('assets/')) {
    const result = await window.electronAPI?.resolveVaultPath(vaultPath, asset.path);
    if (result?.exists) {
      return {
        ...asset,
        vaultRelativePath: asset.path,
        path: result.absolutePath || asset.path,
      };
    }
  }

  // Check if asset already has vaultRelativePath
  if (asset.vaultRelativePath && window.electronAPI) {
    const result = await window.electronAPI.resolveVaultPath(vaultPath, asset.vaultRelativePath);
    if (result?.exists) {
      return {
        ...asset,
        path: result.absolutePath || asset.path,
      };
    }
  }

  return asset;
}

// Resolve all asset paths in scenes
async function resolveScenesAssets(scenes: Scene[], vaultPath: string): Promise<{ scenes: Scene[]; missingAssets: MissingAssetInfo[] }> {
  const resolvedScenes: Scene[] = [];
  const missingAssets: MissingAssetInfo[] = [];

  for (const scene of scenes) {
    const resolvedCuts = await Promise.all(
      scene.cuts.map(async (cut) => {
        if (cut.asset) {
          const resolvedAsset = await resolveAssetPath(cut.asset, vaultPath);

          // Check if asset file exists
          if (resolvedAsset.path && window.electronAPI) {
            const exists = await window.electronAPI.pathExists(resolvedAsset.path);
            if (!exists) {
              missingAssets.push({
                name: resolvedAsset.name || resolvedAsset.path,
                cutId: cut.id,
                sceneId: scene.id,
                asset: resolvedAsset,
              });
            }
          }

          return { ...cut, asset: resolvedAsset };
        }
        return cut;
      })
    );

    resolvedScenes.push({
      ...scene,
      cuts: resolvedCuts,
    });
  }

  return { scenes: resolvedScenes, missingAssets };
}

// Pending project data for recovery dialog
interface PendingProject {
  name: string;
  vaultPath: string;
  scenes: Scene[];
  sceneOrder?: string[];
  targetTotalDurationSec?: number;
  sourcePanelState?: SourcePanelState;
  projectPath: string;
}

export function useHeaderProjectController() {
  const {
    projectLoaded,
    scenes,
    sceneOrder,
    vaultPath,
    clearProject,
    projectName,
    targetTotalDurationSec,
    metadataStore,
    setProjectLoaded,
    setProjectPath,
    initializeProject,
    getSourcePanelState,
    initializeSourcePanel,
    loadMetadata,
    loadProject,
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
    const scenesToSave = prepareScenesForSave(normalizedScenes);

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
  }, [dialogAlert, getSourcePanelState, loadProject, metadataStore, projectName, sceneOrder, scenes, setProjectPath, targetTotalDurationSec, toast, vaultPath]);

  const handleSaveProject = useCallback(async () => {
    await saveProjectInternal();
  }, [saveProjectInternal]);

  const handleAutosaveProject = useCallback(async () => {
    if (!vaultPath) return;
    await saveProjectInternal({ notify: false, updateRecent: false, allowPrompt: false });
  }, [saveProjectInternal, vaultPath]);

  const finalizeProjectLoad = useCallback(async (project: PendingProject, recoveryDecisions?: RecoveryDecision[]) => {
    let finalScenes = project.scenes;

    // Apply recovery decisions
    if (recoveryDecisions && recoveryDecisions.length > 0) {
      for (const decision of recoveryDecisions) {
        if (decision.action === 'delete') {
          // Remove the cut from scenes
          finalScenes = finalScenes.map(scene => {
            if (scene.id === decision.sceneId) {
              return {
                ...scene,
                cuts: scene.cuts.filter(cut => cut.id !== decision.cutId),
              };
            }
            return scene;
          });
        } else if (decision.action === 'relink' && decision.newPath) {
          // Update the cut's asset path with new thumbnail and metadata
          finalScenes = await Promise.all(finalScenes.map(async scene => {
            if (scene.id === decision.sceneId) {
              const updatedCuts = await Promise.all(scene.cuts.map(async cut => {
                if (cut.id === decision.cutId && cut.asset) {
                  const newPath = decision.newPath!;
                  const newName = newPath.split(/[/\\]/).pop() || cut.asset.name;
                  const newType = getCuttableMediaType(newName) || 'image';

                  // Get new thumbnail and metadata
                  let thumbnail: string | undefined;
                  let duration: number | undefined;
                  let metadata: { width?: number; height?: number } | undefined;

                  if (newType === 'video') {
                    // Extract video metadata and thumbnail
                    const videoMeta = await extractVideoMetadata(newPath);
                    if (videoMeta) {
                      duration = videoMeta.duration;
                      metadata = { width: videoMeta.width, height: videoMeta.height };
                    }
                    const thumb = await getThumbnail(newPath, 'video', { timeOffset: 0 });
                    if (thumb) {
                      thumbnail = thumb;
                    }
                  } else {
                    // Load image as base64 for thumbnail
                    const base64 = await getThumbnail(newPath, 'image');
                    if (base64) {
                      thumbnail = base64;
                    }
                  }

                  // Import the new file to vault
                  const importedAsset = await importFileToVault(
                    newPath,
                    project.vaultPath,
                    cut.asset.id,
                    {
                      name: newName,
                      type: newType,
                      thumbnail,
                      duration,
                      metadata,
                    }
                  );

                  if (importedAsset) {
                    return {
                      ...cut,
                      asset: { ...importedAsset, thumbnail, duration, metadata },
                      // Update displayTime for videos
                      displayTime: newType === 'video' && duration ? duration : cut.displayTime,
                    };
                  }

                  // Fallback: just update the path with new info
                  return {
                    ...cut,
                    asset: { ...cut.asset, path: newPath, name: newName, type: newType, thumbnail, duration, metadata },
                    displayTime: newType === 'video' && duration ? duration : cut.displayTime,
                  };
                }
                return cut;
              }));
              return { ...scene, cuts: updatedCuts };
            }
            return scene;
          }));
        }
        // For 'skip', we don't modify anything
      }
    }

    // Regenerate thumbnails for video clips at their IN points
    finalScenes = await Promise.all(finalScenes.map(async scene => {
      const updatedCuts = await Promise.all(scene.cuts.map(async cut => {
        // Only process video clips with valid IN points
        if (cut.isClip && cut.inPoint !== undefined && cut.asset?.type === 'video' && cut.asset.path) {
          const newThumbnail = await getThumbnail(cut.asset.path, 'video', { timeOffset: cut.inPoint });
          if (newThumbnail) {
            return {
              ...cut,
              asset: { ...cut.asset, thumbnail: newThumbnail },
            };
          }
        }
        return cut;
      }));
      return { ...scene, cuts: updatedCuts };
    }));

    initializeProject({
      name: project.name,
      vaultPath: project.vaultPath,
      scenes: finalScenes,
      sceneOrder: project.sceneOrder,
      targetTotalDurationSec: project.targetTotalDurationSec,
    });
    setProjectPath(project.projectPath);

    // Load metadata store (audio attachments, etc.)
    await loadMetadata(project.vaultPath);

    // Initialize source panel state
    await initializeSourcePanel(project.sourcePanelState, project.vaultPath);

    // Update recent projects
    const recentProjects = await window.electronAPI?.getRecentProjects() || [];
    const newRecent = {
      name: project.name,
      path: project.projectPath,
      date: new Date().toISOString(),
    };
    const filtered = recentProjects.filter((p: any) => p.path !== project.projectPath);
    await window.electronAPI?.saveRecentProjects([newRecent, ...filtered.slice(0, 9)]);

    // Clear recovery state
    setShowRecoveryDialog(false);
    setPendingProject(null);
    setMissingAssets([]);
  }, [initializeProject, initializeSourcePanel, loadMetadata, setProjectPath]);

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
        sourcePanel?: SourcePanelState;
      };

      // Determine vault path
      const loadedVaultPath = projectData.vaultPath || path.replace(/[/\\]project\.sdp$/, '').replace(/[/\\][^/\\]+\.sdp$/, '');

      // Resolve asset paths (v2+ uses relative paths)
      let loadedScenes = projectData.scenes || [];
      let foundMissingAssets: MissingAssetInfo[] = [];

      if (projectData.version && projectData.version >= 2 || loadedScenes.some(s => s.cuts?.some(c => c.asset?.path?.startsWith('assets/')))) {
        const resolved = await resolveScenesAssets(loadedScenes, loadedVaultPath);
        loadedScenes = resolved.scenes;
        foundMissingAssets = resolved.missingAssets;
      }

      // If there are missing assets, show recovery dialog
      if (foundMissingAssets.length > 0) {
        setMissingAssets(foundMissingAssets);
        setPendingProject({
          name: projectData.name || 'Loaded Project',
          vaultPath: loadedVaultPath,
          scenes: loadedScenes,
          sceneOrder: projectData.sceneOrder,
          targetTotalDurationSec: projectData.targetTotalDurationSec,
          sourcePanelState: projectData.sourcePanel,
          projectPath: path,
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
        sourcePanelState: projectData.sourcePanel,
        projectPath: path,
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
