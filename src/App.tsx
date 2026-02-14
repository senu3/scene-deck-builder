import { DndContext, DragEndEvent, DragOverEvent, DragStartEvent, pointerWithin, useSensors, useSensor, PointerSensor, useDndMonitor } from '@dnd-kit/core';
import { useState, useRef, useCallback, useEffect } from 'react';
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
  selectPendingSubtitleModalCutId,
  selectClearPendingSubtitleModalCutId,
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
} from './store/selectors';
import { useHistoryStore } from './store/historyStore';
import {
  AddCutCommand,
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
import DetailsPanel from './components/DetailsPanel';
import PreviewModal from './components/PreviewModal';
import Header from './components/Header';
import StartupModal from './components/StartupModal';
import ExportModal from './components/ExportModal';
import EnvironmentSettingsModal from './components/EnvironmentSettingsModal';
import NotificationTestModal from './components/NotificationTestModal';
import { v4 as uuidv4 } from 'uuid';
import type { Asset, Cut } from './types';
import { getThumbnail } from './utils/thumbnailCache';
import { importFileToVault } from './utils/assetPath';
import { getDragKind, queueExternalFilesToScene } from './utils/dragDrop';
import { buildSequenceItemsForCuts } from './utils/exportSequence';
import { getCutIdsInTimelineOrder, getScenesAndCutsInTimelineOrder } from './utils/timelineOrder';
import { getFirstSceneId, getScenesInOrder } from './utils/sceneOrder';
import { insertCutIdsIntoGroupOrder } from './utils/cutGroupOps';
import { DEFAULT_EXPORT_RESOLUTION } from './constants/export';
import { EXPORT_FRAMING_DEFAULTS } from './constants/framing';
import { resolveExportPlan } from './features/export/plan';
import type { ResolutionInput } from './features/export/plan';
import type { ExportSettings } from './features/export/types';
import { buildExportTimelineEntries, buildManifestJson, buildTimelineText } from './features/export/manifest';
import type { SubtitleStyleSettings } from './utils/subtitleStyleSettings';
import { getSubtitleStyleForExport } from './features/export/subtitleStyle';
import { useBanner, useToast } from './ui';
import './styles/App.css';

const EXPORT_PROGRESS_BANNER_ID = 'export-progress';

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
  const pendingSubtitleModalCutId = useStore(selectPendingSubtitleModalCutId);
  const clearPendingSubtitleModalCutId = useStore(selectClearPendingSubtitleModalCutId);
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

  const exportMp4Sequence = useCallback(async (
    cuts: Cut[],
    config: ResolutionInput & { fps: number; outputFilePath?: string; outputDir?: string; subtitleStyle: SubtitleStyleSettings }
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
        subtitleStyle: config.subtitleStyle,
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
          `${(result.fileSize! / 1024 / 1024).toFixed(2)} MB`
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
        subtitleStyle: getSubtitleStyleForExport(),
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
        subtitleStyle: plan.subtitleStyle,
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
      subtitleStyle: getSubtitleStyleForExport(),
    });
    if (mp4Plan.format !== 'mp4') {
      return;
    }
    await exportMp4Sequence(cuts, {
        width: mp4Plan.width,
        height: mp4Plan.height,
        fps: mp4Plan.fps,
        subtitleStyle: mp4Plan.subtitleStyle,
      });
  }, [exportMp4Sequence]);

  // Find cut data for Single Mode preview modal
  const previewCutData = useCallback(() => {
    if (!videoPreviewCutId) return null;
    for (const scene of orderedScenes) {
      const cut = scene.cuts.find(c => c.id === videoPreviewCutId);
      const resolvedAsset = cut ? (getAsset(cut.assetId) || cut.asset) : undefined;
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

    // Update cut with clip points
    await executeCommand(new UpdateClipPointsCommand(scene.id, cut.id, inPoint, outPoint));

    // Regenerate thumbnail at IN point
    if (asset.path) {
      const newThumbnail = await getThumbnail(asset.path, 'video', { timeOffset: inPoint });
      if (newThumbnail) {
        // Update both the cut's asset and the cache
        updateCutAsset(scene.id, cut.id, { thumbnail: newThumbnail });
        cacheAsset({ ...asset, thumbnail: newThumbnail });
      }
    }
  }, [previewData, executeCommand, cacheAsset, updateCutAsset]);

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

      const thumbnailBase64 = await getThumbnail(outputPath, 'image');

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
    return <StartupModal />;
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
            <Storyline activeId={activeId} activeType={activeType} cropBaseResolution={exportResolution} />
          </main>
          <div className={`details-panel-wrapper ${detailsPanelOpen && selectionType ? 'open' : ''}`}>
            <DetailsPanel />
          </div>
        </div>
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
            openSubtitleModalOnMount={pendingSubtitleModalCutId === previewData.cut.id}
            onSubtitleModalOpenHandled={clearPendingSubtitleModalCutId}
            initialInPoint={previewData.cut.inPoint}
            initialOutPoint={previewData.cut.outPoint}
            onClipSave={handleVideoPreviewClipSave}
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
            openSubtitleModalOnMount={pendingSubtitleModalCutId === sequencePreviewCutId}
            onSubtitleModalOpenHandled={clearPendingSubtitleModalCutId}
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
      </div>
    </DndContext>
  );
}

export default App;
