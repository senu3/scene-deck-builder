import { DndContext, DragEndEvent, DragOverEvent, DragStartEvent, pointerWithin, useSensors, useSensor, PointerSensor, useDndMonitor } from '@dnd-kit/core';
import { lazy, Suspense, useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from './store/useStore';
import {
  selectProjectLoaded,
  selectScenes,
  selectVaultPath,
  selectSelectedSceneId,
  selectSceneOrder,
  selectGetSelectedCutIds,
  selectGetSelectedCuts,
  selectCopySelectedCuts,
  selectCanPaste,
  selectClearCutSelection,
  selectVideoPreviewCutId,
  selectCloseVideoPreview,
  selectSequencePreviewCutId,
  selectCloseSequencePreview,
  selectCacheAssetAction,
  selectUpdateCutAssetAction,
  selectCreateCutFromImport,
  selectToggleAssetDrawer,
  selectSidebarOpen,
  selectToggleSidebar,
  selectGetCutGroup,
  selectGetAsset,
  selectMetadataStore,
    selectSelectionType,
    selectDetailsPanelOpen,
    selectCloseDetailsPanel,
    selectProjectName,
  } from './store/selectors';
import { useHistoryStore } from './store/historyStore';
import {
  AddCutCommand,
  ClearClipPointsCommand,
  MoveCutBetweenScenesCommand,
  MoveCutsToSceneCommand,
  PasteCutsCommand,
  RemoveCutCommand,
  RemoveCutFromGroupCommand,
  ReorderCutsWithGroupSyncCommand,
  UpdateClipPointsCommand,
  UpdateGroupCutOrderCommand,
} from './store/commands';
import AssetDrawer from './components/AssetDrawer';
import Sidebar from './components/Sidebar';
import Storyline from './components/Storyline';
import Header from './components/Header';
import { v4 as uuidv4 } from 'uuid';
import type { Asset, Cut } from './types';
import { getAssetThumbnail } from './features/thumbnails/api';
import { generateVideoClipThumbnail } from './features/cut/clipThumbnail';
import { importFileToVault } from './utils/assetPath';
import { getDragKind, queueExternalFilesToScene } from './utils/dragDrop';
import { buildSequenceItemsForCuts } from './utils/exportSequence';
import { getCutIdsInTimelineOrder, getCutsInTimelineOrder, getScenesAndCutsInTimelineOrder } from './utils/timelineOrder';
import { getFirstSceneId, getSceneIndex, getScenesInOrder, resolveSceneById } from './utils/sceneOrder';
import { insertCutIdsIntoGroupOrder } from './utils/cutGroupOps';
import { DEFAULT_EXPORT_RESOLUTION } from './constants/export';
import { EXPORT_FRAMING_DEFAULTS } from './constants/framing';
import { resolveExportPlan } from './features/export/plan';
import type { ResolutionInput } from './features/export/plan';
import type { ExportSettings } from './features/export/types';
import { buildSceneScopedExportPath } from './features/export/sceneScope';
import { buildExportTimelineEntries, buildManifestJson, buildTimelineText } from './features/export/manifest';
import { buildExportAudioPlan, canonicalizeCutsForExportAudioPlan } from './utils/exportAudioPlan';
import { resolveCutAsset } from './utils/assetResolve';
import { useBanner, useToast } from './ui';
import './styles/App.css';

const EXPORT_PROGRESS_BANNER_ID = 'export-progress';
const StartupModal = lazy(() => import('./components/StartupModal'));
const DetailsPanel = lazy(() => import('./components/DetailsPanel'));
const PreviewModal = lazy(() => import('./components/PreviewModal'));
const ExportModal = lazy(() => import('./components/ExportModal'));
const EnvironmentSettingsModal = lazy(() => import('./components/EnvironmentSettingsModal'));
const NotificationTestModal = lazy(() => import('./components/NotificationTestModal'));

function DndMonitorShim({ onDragStart }: { onDragStart: () => void }) {
  useDndMonitor({
    onDragStart,
  });
  return null;
}

function App() {
  const projectLoaded = useStore(selectProjectLoaded);
  const scenes = useStore(selectScenes);
  const vaultPath = useStore(selectVaultPath);
  const selectedSceneId = useStore(selectSelectedSceneId);
  const sceneOrder = useStore(selectSceneOrder);
  const getSelectedCutIds = useStore(selectGetSelectedCutIds);
  const getSelectedCuts = useStore(selectGetSelectedCuts);
  const copySelectedCuts = useStore(selectCopySelectedCuts);
  const canPaste = useStore(selectCanPaste);
  const clearCutSelection = useStore(selectClearCutSelection);
  const videoPreviewCutId = useStore(selectVideoPreviewCutId);
  const closeVideoPreview = useStore(selectCloseVideoPreview);
  const sequencePreviewCutId = useStore(selectSequencePreviewCutId);
  const closeSequencePreview = useStore(selectCloseSequencePreview);
  const cacheAsset = useStore(selectCacheAssetAction);
  const updateCutAsset = useStore(selectUpdateCutAssetAction);
  const createCutFromImport = useStore(selectCreateCutFromImport);
  const toggleAssetDrawer = useStore(selectToggleAssetDrawer);
  const sidebarOpen = useStore(selectSidebarOpen);
  const toggleSidebar = useStore(selectToggleSidebar);
  const getCutGroup = useStore(selectGetCutGroup);
  const getAsset = useStore(selectGetAsset);
  const metadataStore = useStore(selectMetadataStore);
  const selectionType = useStore(selectSelectionType);
  const detailsPanelOpen = useStore(selectDetailsPanelOpen);
  const closeDetailsPanel = useStore(selectCloseDetailsPanel);
  const projectName = useStore(selectProjectName);
  const orderedScenes = getScenesInOrder(scenes, sceneOrder);

  const { executeCommand, undo, redo } = useHistoryStore();
  const { banner } = useBanner();
  const { toast } = useToast();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<'cut' | 'scene' | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showEnvironmentSettings, setShowEnvironmentSettings] = useState(false);
  const [showNotificationTests, setShowNotificationTests] = useState(false);
  const [exportResolution, setExportResolution] = useState({ name: 'Free', width: 0, height: 0 });
  const [isExporting, setIsExporting] = useState(false);
  const [scenePreviewRequest, setScenePreviewRequest] = useState<{ sceneId: string; sceneName: string; cuts: Cut[] } | null>(null);
  const dragDataRef = useRef<{ sceneId?: string; index?: number; type?: string }>({});

  const insertCutsIntoGroup = useCallback(async (sceneId: string, groupId: string, cutIds: string[], insertIndex?: number) => {
    const scene = scenes.find(s => s.id === sceneId);
    const group = scene?.groups?.find(g => g.id === groupId);
    if (!group) return;

    const nextOrder = insertCutIdsIntoGroupOrder(group.cutIds, cutIds, insertIndex);
    if (nextOrder === group.cutIds) return;
    await executeCommand(new UpdateGroupCutOrderCommand(sceneId, groupId, nextOrder));
  }, [executeCommand, scenes]);

  const removeCutsFromGroups = useCallback(async (sceneId: string, cutIds: string[], keepGroupId?: string) => {
    for (const cutId of cutIds) {
      const group = getCutGroup(sceneId, cutId);
      if (group && group.id !== keepGroupId) {
        await executeCommand(new RemoveCutFromGroupCommand(sceneId, group.id, cutId));
      }
    }
  }, [executeCommand, getCutGroup]);

  // Configure drag sensors with distance activation constraint
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement before drag starts
      },
    })
  );

  // Global keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Check if user is typing in an input field
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      // Ctrl+Z or Cmd+Z for Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        try {
          await undo();
        } catch (error) {
          console.error('Undo failed:', error);
        }
      }

      // Ctrl+Shift+Z or Cmd+Shift+Z for Redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        try {
          await redo();
        } catch (error) {
          console.error('Redo failed:', error);
        }
      }

      // Ctrl+Y or Cmd+Y for Redo (alternative)
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        try {
          await redo();
        } catch (error) {
          console.error('Redo failed:', error);
        }
      }

      // Ctrl+C or Cmd+C for Copy
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const selectedIds = getSelectedCutIds();
        if (selectedIds.length > 0) {
          e.preventDefault();
          copySelectedCuts();
        }
      }

      // Ctrl+V or Cmd+V for Paste
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        if (canPaste()) {
          e.preventDefault();
          // Paste to currently selected scene or first scene
          const targetSceneId = selectedSceneId || getFirstSceneId(scenes, sceneOrder);
          if (targetSceneId) {
            try {
              await executeCommand(new PasteCutsCommand(targetSceneId));
            } catch (error) {
              console.error('Paste failed:', error);
            }
          }
        }
      }

      // Delete or Backspace to remove selected cuts
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const selectedCuts = getSelectedCuts();
        if (selectedCuts.length > 0) {
          e.preventDefault();
          // Delete all selected cuts
          for (const { scene, cut } of selectedCuts) {
            try {
              await executeCommand(new RemoveCutCommand(scene.id, cut.id));
            } catch (error) {
              console.error('Delete failed:', error);
            }
          }
          clearCutSelection();
        }
      }

      // Tab key to toggle asset drawer
      if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        toggleAssetDrawer();
        return;
      }

    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, copySelectedCuts, canPaste, selectedSceneId, scenes, sceneOrder, executeCommand, getSelectedCutIds, getSelectedCuts, clearCutSelection, toggleAssetDrawer, toggleSidebar]);

  // App menu shortcut (native menubar)
  useEffect(() => {
    if (!window.electronAPI?.onToggleSidebar) return undefined;
    const unsubscribe = window.electronAPI.onToggleSidebar(() => {
      toggleSidebar();
    });
    return () => unsubscribe();
  }, [toggleSidebar]);

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as { type?: string; sceneId?: string; index?: number } | undefined;
    setActiveId(event.active.id as string);
    setActiveType(data?.type === 'scene' ? 'scene' : 'cut');
    dragDataRef.current = data || {};
    closeDetailsPanel();
  };

  const handleDragOver = (_event: DragOverEvent) => {
    // Handle drag over for visual feedback
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    const activeData = dragDataRef.current as { sceneId?: string; index?: number; type?: string; groupId?: string; cutIds?: string[] };

    setActiveId(null);
    setActiveType(null);
    dragDataRef.current = {};

    if (!over) {
      // Dropped outside timeline - just remove cut from timeline (keep file in assets)
      if (activeData.type === 'cut' && activeData.sceneId) {
        const cutId = active.id as string;
        try {
          await executeCommand(new RemoveCutCommand(activeData.sceneId, cutId));
        } catch (error) {
          console.error('Remove cut failed:', error);
        }
        // Don't move file to trash - just remove from timeline
      }
      return;
    }

    const overData = over.data.current as { sceneId?: string; index?: number; type?: string; groupId?: string } | undefined;

    // Handle group drag - move all cuts in the group together
    if (activeData.type === 'group' && activeData.sceneId && activeData.cutIds && overData?.sceneId) {
      const fromSceneId = activeData.sceneId;
      const toSceneId = overData.sceneId;
      const cutIds = activeData.cutIds;

      // Groups can only be moved within the same scene
      if (fromSceneId !== toSceneId) {
        console.warn('Groups cannot be moved between scenes');
        return;
      }

      const toIndex = overData.type === 'dropzone' ?
        (scenes.find(s => s.id === toSceneId)?.cuts.length || 0) :
        (overData.index ?? 0);

      // Move all cuts in the group together
      executeCommand(new MoveCutsToSceneCommand(cutIds, toSceneId, toIndex)).catch((error) => {
        console.error('Failed to move group cuts:', error);
      });
      return;
    }

    // Handle cut reordering
    if (activeData.type === 'cut' && activeData.sceneId && overData?.sceneId) {
      const fromSceneId = activeData.sceneId;
      const toSceneId = overData.sceneId;
      const cutId = active.id as string;

      // Check if this cut is in a group
      const cutGroup = getCutGroup(fromSceneId, cutId);

      // Check if the drop target is inside a group
      const overId = over.id as string;
      const overCutGroup = overData.type !== 'dropzone' && overData.type !== 'group'
        ? getCutGroup(toSceneId, overId)
        : undefined;

      const targetGroupId = overCutGroup?.id || overData.groupId;
      const targetGroupInsertIndex = overCutGroup
        ? Math.max(0, overCutGroup.cutIds.indexOf(overId))
        : undefined;
      const isMovingOutOfGroup = cutGroup && (!targetGroupId || targetGroupId !== cutGroup.id);

      // Check if this is a multi-select drag
      const selectedIds = getSelectedCutIds();
      const isMultiDrag = selectedIds.length > 1 && selectedIds.includes(cutId);

      if (isMultiDrag) {
        // Multi-select drag: move all selected cuts together
        const toIndex = overData.type === 'dropzone' ?
          (scenes.find(s => s.id === toSceneId)?.cuts.length || 0) :
          (overData.index ?? 0);
        const orderedSelectedIds = getCutIdsInTimelineOrder(scenes, selectedIds, sceneOrder);
        const isReorderingWithinExpandedGroup =
          fromSceneId === toSceneId &&
          !!cutGroup &&
          !!overCutGroup &&
          cutGroup.id === overCutGroup.id &&
          !cutGroup.isCollapsed &&
          orderedSelectedIds.every((id) => cutGroup.cutIds.includes(id));

        try {
          if (isReorderingWithinExpandedGroup && cutGroup) {
            await executeCommand(
              new ReorderCutsWithGroupSyncCommand(fromSceneId, orderedSelectedIds, toIndex, cutGroup.id)
            );
          } else {
            await executeCommand(new MoveCutsToSceneCommand(orderedSelectedIds, toSceneId, toIndex));
          }
        } catch (error) {
          console.error('Failed to move cuts:', error);
        }

        // Remove from group if moving out
        if (!isReorderingWithinExpandedGroup && isMovingOutOfGroup) {
          try {
            await removeCutsFromGroups(fromSceneId, orderedSelectedIds, targetGroupId);
          } catch (error) {
            console.error('Failed to remove cuts from groups:', error);
          }
        }

        if (!isReorderingWithinExpandedGroup && targetGroupId) {
          try {
            await insertCutsIntoGroup(toSceneId, targetGroupId, orderedSelectedIds, targetGroupInsertIndex);
          } catch (error) {
            console.error('Failed to insert cuts into group:', error);
          }
        }
      } else if (fromSceneId === toSceneId) {
        // Single drag: Reorder within same scene
        const scene = scenes.find(s => s.id === fromSceneId);
        if (!scene) return;

        const fromIndex = scene.cuts.findIndex(c => c.id === cutId);
        const toIndex = overData.type === 'dropzone' ? scene.cuts.length : (overData.index ?? 0);
        const syncGroupId =
          !!cutGroup &&
          !!overCutGroup &&
          cutGroup.id === overCutGroup.id &&
          !cutGroup.isCollapsed
          ? cutGroup.id
          : undefined;

        if (fromIndex !== toIndex) {
          try {
            await executeCommand(new ReorderCutsWithGroupSyncCommand(fromSceneId, [cutId], toIndex, syncGroupId));
          } catch (error) {
            console.error('Failed to reorder cuts:', error);
          }
        }

        // Remove from group if moving out of the group
        if (isMovingOutOfGroup && cutGroup) {
          try {
            await executeCommand(new RemoveCutFromGroupCommand(fromSceneId, cutGroup.id, cutId));
          } catch (error) {
            console.error('Failed to remove cut from group:', error);
          }
        }

        if (targetGroupId && targetGroupId !== cutGroup?.id) {
          try {
            await insertCutsIntoGroup(toSceneId, targetGroupId, [cutId], targetGroupInsertIndex);
          } catch (error) {
            console.error('Failed to insert cut into group:', error);
          }
        }
      } else {
        // Single drag: Move between scenes (automatically removes from group in store)
        const toIndex = overData.type === 'dropzone' ?
          (scenes.find(s => s.id === toSceneId)?.cuts.length || 0) :
          (overData.index ?? 0);
        try {
          await executeCommand(new MoveCutBetweenScenesCommand(fromSceneId, toSceneId, cutId, toIndex));
        } catch (error) {
          console.error('Failed to move cut between scenes:', error);
        }

        if (targetGroupId) {
          try {
            await insertCutsIntoGroup(toSceneId, targetGroupId, [cutId], targetGroupInsertIndex);
          } catch (error) {
            console.error('Failed to insert cut into group:', error);
          }
        }
      }
    }
  };

  // Handle native file drop from OS (fallback when not dropping on a scene)
  const handleWorkspaceDragOver = useCallback((e: React.DragEvent) => {
    if (getDragKind(e.dataTransfer) === 'externalFiles') {
      e.preventDefault();
      e.stopPropagation();
      if (detailsPanelOpen) {
        closeDetailsPanel();
      }
    }
  }, [closeDetailsPanel, detailsPanelOpen]);

  const handleWorkspaceDragLeave = useCallback((_e: React.DragEvent) => {
    // No-op, kept for consistency
  }, []);

  const handleWorkspaceDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (getDragKind(e.dataTransfer) !== 'externalFiles') {
      return;
    }

    const targetSceneId = selectedSceneId || getFirstSceneId(scenes, sceneOrder);
    if (!targetSceneId) return;

    queueExternalFilesToScene({
      sceneId: targetSceneId,
      files: Array.from(e.dataTransfer.files),
      createCutFromImport,
    });
  }, [selectedSceneId, scenes, sceneOrder, createCutFromImport]);

  // Open export modal from controls
  const handleExportFromControls = useCallback(() => {
    if (isExporting) return;
    setShowExportModal(true);
  }, [isExporting]);

  const handleOpenNotificationTests = useCallback(() => {
    setShowEnvironmentSettings(false);
    setShowNotificationTests(true);
  }, []);

  const openPreviewForCuts = useCallback((cuts: Cut[], context: { kind: 'scene'; sceneId: string; sceneName: string }) => {
    if (cuts.length === 0) {
      toast.info('Scene is empty', 'Add cuts to this scene first.');
      return;
    }
    setScenePreviewRequest({
      sceneId: context.sceneId,
      sceneName: context.sceneName,
      cuts,
    });
  }, [toast]);

  const handlePreviewScene = useCallback((sceneId: string) => {
    const scene = resolveSceneById(scenes, sceneId);
    if (!scene) {
      toast.warning('Scene not found', 'This scene may have been removed.');
      return;
    }
    const cuts = getCutsInTimelineOrder(scene.cuts);
    if (cuts.length === 0) {
      toast.info('Scene is empty', 'Add cuts to this scene first.');
      return;
    }
    openPreviewForCuts(cuts, { kind: 'scene', sceneId: scene.id, sceneName: scene.name });
  }, [openPreviewForCuts, scenes, toast]);

  const exportMp4Sequence = useCallback(async (
    cuts: Cut[],
    config: ResolutionInput & { fps: number; outputFilePath?: string; outputDir?: string }
  ) => {
    if (!window.electronAPI || isExporting) return;

    setIsExporting(true);
    banner.show({
      id: EXPORT_PROGRESS_BANNER_ID,
      variant: 'progress',
      message: 'Preparing export...',
      progress: 5,
      dismissible: false,
      icon: 'sync',
    });
    try {
      const sequenceItems = buildSequenceItemsForCuts(cuts, {
        debugFraming: true,
        framingDefaults: EXPORT_FRAMING_DEFAULTS,
        metadataByAssetId: metadataStore?.metadata,
        resolveAssetById: getAsset,
      });
      const cutSceneMap = new Map<string, string>();
      for (const scene of orderedScenes) {
        for (const sceneCut of scene.cuts) {
          cutSceneMap.set(sceneCut.id, scene.id);
        }
      }
      const audioPlan = buildExportAudioPlan({
        cuts: canonicalizeCutsForExportAudioPlan(cuts, getAsset).cuts,
        metadataStore: metadataStore ?? null,
        getAssetById: getAsset,
        resolveSceneIdByCutId: (cutId) => cutSceneMap.get(cutId),
      });

      if (sequenceItems.length === 0) {
        toast.warning('No items to export', 'Add cuts to the timeline first.');
        return;
      }

      banner.update(EXPORT_PROGRESS_BANNER_ID, {
        message: 'Preparing output path...',
        progress: 15,
      });

      let outputPath = config.outputFilePath;
      if (!outputPath) {
        outputPath = await window.electronAPI.showSaveSequenceDialog('sequence_export.mp4') || '';
      }
      if (!outputPath) {
        toast.info('Export cancelled');
        return;
      }

      const width = config.width > 0 ? config.width : DEFAULT_EXPORT_RESOLUTION.width;
      const height = config.height > 0 ? config.height : DEFAULT_EXPORT_RESOLUTION.height;

      banner.update(EXPORT_PROGRESS_BANNER_ID, {
        message: 'Rendering video...',
        progress: 35,
      });

      const result = await window.electronAPI.exportSequence({
        items: sequenceItems,
        outputPath,
        width,
        height,
        fps: config.fps,
        audioPlan,
      });

      if (result.success) {
        if (config.outputDir) {
          banner.update(EXPORT_PROGRESS_BANNER_ID, {
            message: 'Writing manifest and timeline...',
            progress: 85,
          });
          const contextResolver = (cut: Cut) => {
            for (const scene of orderedScenes) {
              const cutIndex = scene.cuts.findIndex((item) => item.id === cut.id);
              if (cutIndex >= 0) {
                return { sceneId: scene.id, sceneName: scene.name, cutIndex };
              }
            }
            return null;
          };
          const timelineEntries = buildExportTimelineEntries(cuts, contextResolver, getAsset);
          const manifestJson = buildManifestJson(timelineEntries, {
            width,
            height,
            fps: config.fps,
            outputDir: config.outputDir,
          });
          const timelineText = buildTimelineText(timelineEntries);
          const sidecarsResult = await window.electronAPI.writeExportSidecars({
            outputDir: config.outputDir,
            manifestJson,
            timelineText,
          });
          if (!sidecarsResult.success) {
            toast.warning('Export completed with sidecar warning', sidecarsResult.error || 'Failed to write manifest/timeline.');
          }
        }
        banner.update(EXPORT_PROGRESS_BANNER_ID, {
          message: 'Finalizing export...',
          progress: 100,
        });
        toast.success(
          'Export complete',
          `${(result.fileSize! / 1024 / 1024).toFixed(2)} MB${result.audioOutputPath ? ` / audio: ${result.audioOutputPath}` : ''}`
        );
      } else {
        toast.error('Export failed', result.error || 'Unknown error');
      }
    } catch (error) {
      toast.error('Export error', String(error));
    } finally {
      banner.dismiss(EXPORT_PROGRESS_BANNER_ID);
      setIsExporting(false);
    }
  }, [banner, getAsset, isExporting, metadataStore, orderedScenes, toast]);

  const startExportForCuts = useCallback(async (
    cuts: Cut[],
    scope: { kind: 'scene'; sceneId: string; sceneName: string }
  ) => {
    if (isExporting) return;
    if (cuts.length === 0) {
      toast.warning('No items to export', 'Add cuts to this scene first.');
      return;
    }

    const sceneIndex = getSceneIndex(scenes, sceneOrder, scope.sceneId);
    const scopedPath = buildSceneScopedExportPath({
      vaultPath,
      projectName,
      sceneId: scope.sceneId,
      sceneName: scope.sceneName,
      sceneIndex,
    });
    const plan = resolveExportPlan({
      settings: {
        format: 'mp4',
        outputRootPath: scopedPath.outputRootPath,
        outputFolderName: scopedPath.outputFolderName,
        resolution: exportResolution,
        fps: 30,
        range: 'all',
        aviutl: { roundingMode: 'round', copyMedia: false },
        mp4: { quality: 'medium' },
      },
      resolution: exportResolution,
      exportScope: { kind: 'scene', sceneId: scope.sceneId },
    });

    if (plan.format !== 'mp4') return;

    await exportMp4Sequence(cuts, {
      width: plan.width,
      height: plan.height,
      fps: plan.fps,
      outputFilePath: scopedPath.outputFilePath,
      outputDir: scopedPath.outputDir,
    });
  }, [isExporting, toast, scenes, sceneOrder, vaultPath, projectName, exportResolution, exportMp4Sequence]);

  const handleExportScene = useCallback(async (sceneId: string) => {
    const scene = resolveSceneById(scenes, sceneId);
    if (!scene) {
      toast.warning('Scene not found', 'This scene may have been removed.');
      return;
    }
    const cuts = getCutsInTimelineOrder(scene.cuts);
    if (cuts.length === 0) {
      toast.info('Scene is empty', 'Add cuts to this scene first.');
      return;
    }
    await startExportForCuts(cuts, { kind: 'scene', sceneId: scene.id, sceneName: scene.name });
  }, [scenes, startExportForCuts, toast]);

  // Handle export from ExportModal
  const handleExport = useCallback(async (settings: ExportSettings) => {
    if (!window.electronAPI || isExporting) return;

    setShowExportModal(false);

    try {
      const orderedCutsAll = getScenesAndCutsInTimelineOrder(scenes, sceneOrder).flatMap((scene) => scene.cuts);

      if (orderedCutsAll.length === 0) {
        toast.warning('No items to export', 'Add cuts to the timeline first.');
        return;
      }

      const plan = resolveExportPlan({
        settings,
        resolution: exportResolution,
      });

      if (plan.format === 'aviutl') {
        // Placeholder: AviUtl export not yet implemented
        toast.info('AviUtl export', 'Coming Soon');
        return;
      }

      const orderedCuts = plan.range === 'selection'
          ? getCutIdsInTimelineOrder(scenes, getSelectedCutIds(), sceneOrder)
          .map((cutId) => orderedCutsAll.find((cut) => cut.id === cutId))
          .filter((cut): cut is Cut => !!cut)
        : orderedCutsAll;

      if (orderedCuts.length === 0) {
        toast.warning('No cuts in selected range', 'Select cuts or use All Cuts.');
        return;
      }

      await exportMp4Sequence(orderedCuts, {
        width: plan.width,
        height: plan.height,
        fps: plan.fps,
        outputFilePath: plan.outputFilePath,
        outputDir: plan.outputDir,
      });
    } catch (error) {
      toast.error('Export error', String(error));
    }
  }, [scenes, sceneOrder, exportResolution, isExporting, exportMp4Sequence, getSelectedCutIds, toast]);

  const handlePreviewExport = useCallback(async (
    cuts: Cut[],
    resolution: { width: number; height: number }
  ) => {
    const mp4Plan = resolveExportPlan({
      settings: {
        format: 'mp4',
        outputRootPath: '',
        outputFolderName: '',
        resolution,
        fps: 30,
        range: 'all',
        aviutl: { roundingMode: 'round', copyMedia: false },
        mp4: { quality: 'medium' },
      },
      resolution,
    });
    if (mp4Plan.format !== 'mp4') {
      return;
    }
      await exportMp4Sequence(cuts, {
        width: mp4Plan.width,
        height: mp4Plan.height,
        fps: mp4Plan.fps,
      });
  }, [exportMp4Sequence]);

  // Find cut data for Single Mode preview modal
  const previewCutData = useCallback(() => {
    if (!videoPreviewCutId) return null;
    for (const scene of orderedScenes) {
      const cut = scene.cuts.find(c => c.id === videoPreviewCutId);
      const resolvedAsset = cut ? resolveCutAsset(cut, getAsset) : null;
      if (cut && resolvedAsset) {
        return { scene, cut, asset: resolvedAsset };
      }
    }
    return null;
  }, [videoPreviewCutId, orderedScenes, getAsset]);

  const previewData = previewCutData();

  // Handle clip save from video preview modal
  const handleVideoPreviewClipSave = useCallback(async (inPoint: number, outPoint: number) => {
    if (!previewData) return;
    const { scene, cut, asset } = previewData;
    await executeCommand(new UpdateClipPointsCommand(scene.id, cut.id, inPoint, outPoint));

    // Regenerate thumbnail at IN point
    if (asset.path) {
      const newThumbnail = await generateVideoClipThumbnail(cut.id, asset.path, inPoint, outPoint);
      if (newThumbnail) {
        // Clip thumbnail is cut-specific; do not mutate shared asset cache thumbnail.
        updateCutAsset(scene.id, cut.id, { thumbnail: newThumbnail });
      }
    }
  }, [previewData, executeCommand, updateCutAsset]);

  const handleVideoPreviewClipClear = useCallback(async () => {
    if (!previewData) return;
    const { scene, cut, asset } = previewData;
    if (!cut.isClip) return;

    await executeCommand(new ClearClipPointsCommand(scene.id, cut.id));

    if (asset.path) {
      const newThumbnail = await generateVideoClipThumbnail(cut.id, asset.path, 0);
      if (newThumbnail) {
        updateCutAsset(scene.id, cut.id, { thumbnail: newThumbnail });
      }
    }
  }, [previewData, executeCommand, updateCutAsset]);

  // Handle frame capture from video preview modal
  const handleVideoPreviewFrameCapture = useCallback(async (timestamp: number): Promise<string | void> => {
    if (!previewData || !vaultPath) {
      throw new Error('Cannot capture frame: missing required data');
    }

    const { scene, asset } = previewData;

    if (!window.electronAPI?.extractVideoFrame || !window.electronAPI?.ensureAssetsFolder) {
      throw new Error('Frame capture requires app restart after update.');
    }

    try {
      const assetsFolder = await window.electronAPI.ensureAssetsFolder(vaultPath);
      if (!assetsFolder) {
        throw new Error('Failed to access assets folder');
      }

      const baseName = asset.name.replace(/\.[^/.]+$/, '');
      const timeStr = timestamp.toFixed(2).replace('.', '_');
      const uniqueId = uuidv4().substring(0, 8);
      const frameFileName = `${baseName}_frame_${timeStr}_${uniqueId}.png`;
      const outputPath = `${assetsFolder}/${frameFileName}`.replace(/\\/g, '/');

      const result = await window.electronAPI.extractVideoFrame({
        sourcePath: asset.path,
        outputPath,
        timestamp,
      });

      if (!result.success) {
        throw new Error(`Failed to capture frame: ${result.error}`);
      }

      const thumbnailBase64 = await getAssetThumbnail('timeline-card', {
        path: outputPath,
        type: 'image',
      });

      const newAssetId = uuidv4();
      const baseAsset: Asset = {
        id: newAssetId,
        name: frameFileName,
        path: outputPath,
        type: 'image',
        thumbnail: thumbnailBase64 || undefined,
        vaultRelativePath: `assets/${frameFileName}`,
      };

      const importedAsset = await importFileToVault(outputPath, vaultPath, newAssetId, baseAsset);
      const finalAsset = importedAsset ?? baseAsset;

      cacheAsset(finalAsset);
      await executeCommand(new AddCutCommand(scene.id, finalAsset));

      return `Frame captured: ${frameFileName}`;
    } catch (error) {
      console.error('Frame capture failed:', error);
      throw error;
    }
  }, [previewData, vaultPath, cacheAsset, executeCommand]);

  // Show startup modal if no project is loaded
  if (!projectLoaded) {
    return (
      <Suspense fallback={null}>
        <StartupModal />
      </Suspense>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <DndMonitorShim onDragStart={closeDetailsPanel} />
      <div className="app">
        <AssetDrawer />
        <Header
          onOpenSettings={() => setShowEnvironmentSettings(true)}
          onPreview={() => setShowPreview(true)}
          onExport={handleExportFromControls}
          isExporting={isExporting}
        />
        <div className="app-content">
          {sidebarOpen && <Sidebar />}
          <main
            className="main-area"
            onDragOver={handleWorkspaceDragOver}
            onDragLeave={handleWorkspaceDragLeave}
            onDrop={handleWorkspaceDrop}
          >
            <Storyline
              activeId={activeId}
              activeType={activeType}
              cropBaseResolution={exportResolution}
              onPreviewScene={handlePreviewScene}
              onExportScene={handleExportScene}
            />
          </main>
          <div className={`details-panel-wrapper ${detailsPanelOpen && selectionType ? 'open' : ''}`}>
            {detailsPanelOpen && selectionType && (
              <Suspense fallback={null}>
                <DetailsPanel />
              </Suspense>
            )}
          </div>
        </div>
        <Suspense fallback={null}>
          {showPreview && (
            <PreviewModal
              onClose={() => setShowPreview(false)}
              exportResolution={exportResolution}
              onResolutionChange={setExportResolution}
              onExportSequence={handlePreviewExport}
            />
          )}
          {previewData && (
            <PreviewModal
              asset={previewData.asset}
              focusCutId={previewData.cut.id}
              onClose={closeVideoPreview}
              initialInPoint={previewData.cut.inPoint}
              initialOutPoint={previewData.cut.outPoint}
              onClipSave={handleVideoPreviewClipSave}
              onClipClear={handleVideoPreviewClipClear}
              onFrameCapture={handleVideoPreviewFrameCapture}
              exportResolution={exportResolution}
              onResolutionChange={setExportResolution}
              onExportSequence={handlePreviewExport}
            />
          )}
          {sequencePreviewCutId && (
            <PreviewModal
              onClose={closeSequencePreview}
              focusCutId={sequencePreviewCutId}
              exportResolution={exportResolution}
              onResolutionChange={setExportResolution}
              onExportSequence={handlePreviewExport}
            />
          )}
          {scenePreviewRequest && (
            <PreviewModal
              onClose={() => setScenePreviewRequest(null)}
              sequenceCuts={scenePreviewRequest.cuts}
              sequenceContext={{ kind: 'scene', sceneId: scenePreviewRequest.sceneId, sceneName: scenePreviewRequest.sceneName }}
              exportResolution={exportResolution}
              onResolutionChange={setExportResolution}
              onExportSequence={handlePreviewExport}
            />
          )}
          <ExportModal
            open={showExportModal}
            onClose={() => setShowExportModal(false)}
            initialResolution={{
              width: exportResolution.width > 0 ? exportResolution.width : DEFAULT_EXPORT_RESOLUTION.width,
              height: exportResolution.height > 0 ? exportResolution.height : DEFAULT_EXPORT_RESOLUTION.height,
            }}
            onExport={handleExport}
          />
          <EnvironmentSettingsModal
            open={showEnvironmentSettings}
            onClose={() => setShowEnvironmentSettings(false)}
            onOpenNotificationTests={handleOpenNotificationTests}
          />
          <NotificationTestModal
            open={showNotificationTests}
            onClose={() => setShowNotificationTests(false)}
          />
        </Suspense>
      </div>
    </DndContext>
  );
}

export default App;
