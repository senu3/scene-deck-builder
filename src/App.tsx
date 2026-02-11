import { DndContext, DragEndEvent, DragOverEvent, DragStartEvent, pointerWithin, useSensors, useSensor, PointerSensor, useDndMonitor } from '@dnd-kit/core';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from './store/useStore';
import { useHistoryStore } from './store/historyStore';
import { AddCutCommand, ReorderCutsCommand, MoveCutBetweenScenesCommand, MoveCutsToSceneCommand, PasteCutsCommand, RemoveCutCommand, UpdateClipPointsCommand } from './store/commands';
import AssetDrawer from './components/AssetDrawer';
import Sidebar from './components/Sidebar';
import Storyline from './components/Storyline';
import DetailsPanel from './components/DetailsPanel';
import PreviewModal from './components/PreviewModal';
import Header from './components/Header';
import StartupModal from './components/StartupModal';
import ExportModal, { type ExportSettings } from './components/ExportModal';
import EnvironmentSettingsModal from './components/EnvironmentSettingsModal';
import NotificationTestModal from './components/NotificationTestModal';
import { v4 as uuidv4 } from 'uuid';
import type { Asset, Cut } from './types';
import { getThumbnail } from './utils/thumbnailCache';
import { importFileToVault } from './utils/assetPath';
import { getDragKind, queueExternalFilesToScene } from './utils/dragDrop';
import { buildSequenceItemsForCuts } from './utils/exportSequence';
import { getCutIdsInTimelineOrder, getScenesAndCutsInTimelineOrder } from './utils/timelineOrder';
import { DEFAULT_EXPORT_RESOLUTION } from './constants/export';
import './styles/App.css';

function DndMonitorShim({ onDragStart }: { onDragStart: () => void }) {
  useDndMonitor({
    onDragStart,
  });
  return null;
}

function App() {
  const {
    projectLoaded,
    scenes,
    removeCut,
    vaultPath,
    selectedSceneId,
    getSelectedCutIds,
    getSelectedCuts,
    copySelectedCuts,
    canPaste,
    clearCutSelection,
    videoPreviewCutId,
    closeVideoPreview,
    sequencePreviewCutId,
    closeSequencePreview,
    cacheAsset,
    updateCutAsset,
    createCutFromImport,
    toggleAssetDrawer,
    sidebarOpen,
    toggleSidebar,
    getCutGroup,
    removeCutFromGroup,
    updateGroupCutOrder,
    getAsset,
    metadataStore,
    selectionType,
    detailsPanelOpen,
    closeDetailsPanel,
  } = useStore();

  const { executeCommand, undo, redo } = useHistoryStore();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<'cut' | 'scene' | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showEnvironmentSettings, setShowEnvironmentSettings] = useState(false);
  const [showNotificationTests, setShowNotificationTests] = useState(false);
  const [exportResolution, setExportResolution] = useState({ name: 'Free', width: 0, height: 0 });
  const [isExporting, setIsExporting] = useState(false);
  const dragDataRef = useRef<{ sceneId?: string; index?: number; type?: string }>({});

  const insertCutsIntoGroup = useCallback((sceneId: string, groupId: string, cutIds: string[], insertIndex?: number) => {
    const scene = scenes.find(s => s.id === sceneId);
    const group = scene?.groups?.find(g => g.id === groupId);
    if (!group) return;

    const incoming = cutIds.filter(id => !group.cutIds.includes(id));
    if (incoming.length === 0) return;

    const nextOrder = [...group.cutIds];
    const safeIndex = insertIndex !== undefined
      ? Math.min(Math.max(insertIndex, 0), nextOrder.length)
      : nextOrder.length;
    nextOrder.splice(safeIndex, 0, ...incoming);
    updateGroupCutOrder(sceneId, groupId, nextOrder);
  }, [scenes, updateGroupCutOrder]);

  const removeCutsFromGroups = useCallback((sceneId: string, cutIds: string[], keepGroupId?: string) => {
    for (const cutId of cutIds) {
      const group = getCutGroup(sceneId, cutId);
      if (group && group.id !== keepGroupId) {
        removeCutFromGroup(sceneId, group.id, cutId);
      }
    }
  }, [getCutGroup, removeCutFromGroup]);

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
          const targetSceneId = selectedSceneId || scenes[0]?.id;
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
  }, [undo, redo, copySelectedCuts, canPaste, selectedSceneId, scenes, executeCommand, getSelectedCutIds, getSelectedCuts, clearCutSelection, toggleAssetDrawer, toggleSidebar]);

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
        removeCut(activeData.sceneId, cutId);
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
        const orderedSelectedIds = getCutIdsInTimelineOrder(scenes, selectedIds);

        try {
          await executeCommand(new MoveCutsToSceneCommand(orderedSelectedIds, toSceneId, toIndex));
        } catch (error) {
          console.error('Failed to move cuts:', error);
        }

        // Remove from group if moving out
        if (isMovingOutOfGroup) {
          removeCutsFromGroups(fromSceneId, orderedSelectedIds, targetGroupId);
        }

        if (targetGroupId) {
          insertCutsIntoGroup(toSceneId, targetGroupId, orderedSelectedIds, targetGroupInsertIndex);
        }
      } else if (fromSceneId === toSceneId) {
        // Single drag: Reorder within same scene
        const scene = scenes.find(s => s.id === fromSceneId);
        if (!scene) return;

        const fromIndex = scene.cuts.findIndex(c => c.id === cutId);
        const toIndex = overData.type === 'dropzone' ? scene.cuts.length : (overData.index ?? 0);

        if (fromIndex !== toIndex) {
          try {
            await executeCommand(new ReorderCutsCommand(fromSceneId, cutId, toIndex, fromIndex));
          } catch (error) {
            console.error('Failed to reorder cuts:', error);
          }
        }

        // Remove from group if moving out of the group
        if (isMovingOutOfGroup && cutGroup) {
          removeCutFromGroup(fromSceneId, cutGroup.id, cutId);
        }

        if (targetGroupId && targetGroupId !== cutGroup?.id) {
          insertCutsIntoGroup(toSceneId, targetGroupId, [cutId], targetGroupInsertIndex);
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
          insertCutsIntoGroup(toSceneId, targetGroupId, [cutId], targetGroupInsertIndex);
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

    const targetSceneId = selectedSceneId || scenes[0]?.id;
    if (!targetSceneId) return;

    queueExternalFilesToScene({
      sceneId: targetSceneId,
      files: Array.from(e.dataTransfer.files),
      createCutFromImport,
    });
  }, [selectedSceneId, scenes, createCutFromImport]);

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
    resolution: { width: number; height: number }
  ) => {
    if (!window.electronAPI || isExporting) return;

    setIsExporting(true);
    try {
      const sequenceItems = buildSequenceItemsForCuts(cuts, {
        debugFraming: true,
        metadataByAssetId: metadataStore?.metadata,
        resolveAssetById: getAsset,
      });

      if (sequenceItems.length === 0) {
        alert('No items to export. Add some cuts to the timeline first.');
        return;
      }

      const outputPath = await window.electronAPI.showSaveSequenceDialog('sequence_export.mp4');
      if (!outputPath) {
        return;
      }

      const width = resolution.width > 0 ? resolution.width : DEFAULT_EXPORT_RESOLUTION.width;
      const height = resolution.height > 0 ? resolution.height : DEFAULT_EXPORT_RESOLUTION.height;

      const result = await window.electronAPI.exportSequence({
        items: sequenceItems,
        outputPath,
        width,
        height,
        fps: 30,
      });

      if (result.success) {
        alert(`Export complete!\nFile: ${result.outputPath}\nSize: ${(result.fileSize! / 1024 / 1024).toFixed(2)} MB`);
      } else {
        alert(`Export failed: ${result.error}`);
      }
    } catch (error) {
      alert(`Export error: ${String(error)}`);
    } finally {
      setIsExporting(false);
    }
  }, [getAsset, isExporting, metadataStore]);

  // Handle export from ExportModal
  const handleExport = useCallback(async (settings: ExportSettings) => {
    if (!window.electronAPI || isExporting) return;

    setShowExportModal(false);

    try {
      const orderedCuts = getScenesAndCutsInTimelineOrder(scenes).flatMap((scene) => scene.cuts);

      if (orderedCuts.length === 0) {
        alert('No items to export. Add some cuts to the timeline first.');
        return;
      }

      // For now, use existing MP4 export logic
      // TODO: Implement AviUtl export based on settings.format
      if (settings.format === 'aviutl') {
        // Placeholder: AviUtl export not yet implemented
        alert(`AviUtl export to:\n${settings.outputPath}\n\nRounding: ${settings.aviutl.roundingMode}\nCopy media: ${settings.aviutl.copyMedia}\n\n(Export logic not yet implemented)`);
        return;
      }

      await exportMp4Sequence(orderedCuts, exportResolution);
    } catch (error) {
      alert(`Export error: ${String(error)}`);
    }
  }, [scenes, exportResolution, isExporting, exportMp4Sequence]);

  const handlePreviewExport = useCallback(async (
    cuts: Cut[],
    resolution: { width: number; height: number }
  ) => {
    await exportMp4Sequence(cuts, resolution);
  }, [exportMp4Sequence]);

  // Find cut data for Single Mode preview modal
  const previewCutData = useCallback(() => {
    if (!videoPreviewCutId) return null;
    for (const scene of scenes) {
      const cut = scene.cuts.find(c => c.id === videoPreviewCutId);
      if (cut && cut.asset) {
        return { scene, cut, asset: cut.asset };
      }
    }
    return null;
  }, [videoPreviewCutId, scenes]);

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
            exportResolution={exportResolution}
            onResolutionChange={setExportResolution}
            onExportSequence={handlePreviewExport}
          />
        )}
        <ExportModal
          open={showExportModal}
          onClose={() => setShowExportModal(false)}
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
