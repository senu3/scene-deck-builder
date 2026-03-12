import { useState, useEffect } from "react";
import {
  Settings,
  Mic,
  Link,
  Music,
  Trash2,
  Clock,
  Volume2,
  FileImage,
  Film,
  Plus,
  Minus,
  StickyNote,
  X,
  Layers,
  Play,
  Scissors,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  Edit2,
} from "lucide-react";
import { useStore } from "../store/useStore";
import {
  selectScenes,
  selectSelectedSceneId,
  selectSelectedCutId,
  selectSelectedCutIds,
  selectSelectionType,
  selectSelectedGroupId,
  selectGetAsset,
  selectGetSelectedCuts,
  selectGetSelectedGroup,
  selectToggleGroupCollapsed,
  selectCacheAsset,
  selectVaultPath,
  selectMetadataStore,
  selectAttachAudioToCut,
  selectDetachAudioFromCut,
  selectGetAttachedAudioForScene,
  selectGetAttachedAudioForGroup,
  selectGetAttachedAudioForCut,
  selectUpdateCutAudioOffset,
  selectSetCutUseEmbeddedAudio,
  selectCreateStoreEventOperation,
} from "../store/selectors";
import { useHistoryStore } from "../store/historyStore";
import {
  UpdateDisplayTimeCommand,
  RemoveCutCommand,
  BatchUpdateDisplayTimeCommand,
  AddCutCommand,
  AddSceneNoteCommand,
  CreateGroupCommand,
  DeleteGroupCommand,
  RemoveSceneNoteCommand,
  RenameGroupCommand,
  SetGroupAttachAudioCommand,
  SetSceneAttachAudioCommand,
} from "../store/commands";
import {
  getAssetThumbnail,
  resolveCutThumbnailFromCache,
} from "../features/thumbnails/api";
import { selectAndImportAssetToVault } from "../features/asset/import";
import { relinkCutAssetWithLipSyncCleanup } from "../features/metadata/lipSyncActions";
import { useAssetMetadataHydration } from "../features/metadata/useAssetMetadataHydration";
import {
  ensureAssetsFolderBridge,
  extractVideoFrameBridge,
  getFileInfoBridge,
} from "../features/platform/electronGateway";
import { clearPreviewClipPoints, savePreviewClipPoints } from "../features/cut/previewClipUpdate";
import { resolveCutAsset } from "../utils/assetResolve";
import { getLipSyncFrameAssetIds } from "../utils/lipSyncUtils";
import { importFileToVault } from "../utils/assetPath";
// Note: getAudioDuration was removed - duration comes from asset.duration after import
import PreviewModal from "./PreviewModal";
import LipSyncModal from "./LipSyncModal";
import AssetModal from "./AssetModal";
import type { Asset } from "../types";
import { v4 as uuidv4 } from "uuid";
import { Toggle, useDialog } from "../ui";
import "./DetailsPanel.css";

export default function DetailsPanel() {
  const scenes = useStore(selectScenes);
  const selectedSceneId = useStore(selectSelectedSceneId);
  const selectedCutId = useStore(selectSelectedCutId);
  const selectedCutIds = useStore(selectSelectedCutIds);
  const selectionType = useStore(selectSelectionType);
  const selectedGroupId = useStore(selectSelectedGroupId);
  const getAsset = useStore(selectGetAsset);
  const getSelectedCuts = useStore(selectGetSelectedCuts);
  const getSelectedGroup = useStore(selectGetSelectedGroup);
  const toggleGroupCollapsed = useStore(selectToggleGroupCollapsed);
  const cacheAsset = useStore(selectCacheAsset);
  const vaultPath = useStore(selectVaultPath);
  const metadataStore = useStore(selectMetadataStore);
  const attachAudioToCut = useStore(selectAttachAudioToCut);
  const detachAudioFromCut = useStore(selectDetachAudioFromCut);
  const getAttachedAudioForScene = useStore(selectGetAttachedAudioForScene);
  const getAttachedAudioForGroup = useStore(selectGetAttachedAudioForGroup);
  const getAttachedAudioForCut = useStore(selectGetAttachedAudioForCut);
  const updateCutAudioOffset = useStore(selectUpdateCutAudioOffset);
  const setCutUseEmbeddedAudio = useStore(selectSetCutUseEmbeddedAudio);
  const createStoreEventOperation = useStore(selectCreateStoreEventOperation);

  const { executeCommand } = useHistoryStore();
  const { confirm } = useDialog();

  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [localDisplayTime, setLocalDisplayTime] = useState("2.0");
  const [batchDisplayTime, setBatchDisplayTime] = useState("2.0");
  const [noteText, setNoteText] = useState("");
  const [showVideoPreview, setShowVideoPreview] = useState(false);
  const [showLipSyncModal, setShowLipSyncModal] = useState(false);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [showSceneAudioModal, setShowSceneAudioModal] = useState(false);
  const [showGroupAudioModal, setShowGroupAudioModal] = useState(false);
  const [pendingLipSyncOpen, setPendingLipSyncOpen] = useState(false);
  const [lipSyncFrames, setLipSyncFrames] = useState<string[]>([]);
  const [groupThumbnail, setGroupThumbnail] = useState<string | null>(null);

  // Attached audio state
  const [attachedAudio, setAttachedAudio] = useState<Asset | undefined>(undefined);
  const [attachedAudioDuration, setAttachedAudioDuration] = useState<number | null>(null);
  const [audioOffset, setAudioOffset] = useState("0.0");

  // Find selected scene
  const selectedScene = selectedSceneId
    ? scenes.find((s) => s.id === selectedSceneId)
    : null;

  // Find selected cut
  const selectedCutData = (() => {
    if (!selectedCutId) return null;

    for (const scene of scenes) {
      const cut = scene.cuts.find((c) => c.id === selectedCutId);
      if (cut) {
        return { scene, cut };
      }
    }
    return null;
  })();

  const cut = selectedCutData?.cut;
  const cutScene = selectedCutData?.scene;
  const asset = cut ? resolveCutAsset(cut, getAsset) : null;
  const { asset: hydratedAsset } = useAssetMetadataHydration({
    asset,
    requirements: asset?.type === "video"
      ? { duration: true, dimensions: true, fileSize: true }
      : asset?.type === "image"
        ? { dimensions: true, fileSize: true }
        : {},
    cacheAsset,
  });
  const activeAsset = hydratedAsset ?? asset;
  const metadata = activeAsset?.metadata ?? null;
  const preferredThumbnail = cut
    ? resolveCutThumbnailFromCache('details-panel', {
      cutId: cut.id,
      kind: cut.isClip ? 'clip' : 'cut',
      assetId: activeAsset?.id ?? cut.assetId,
      assetPath: activeAsset?.path,
      assetType: activeAsset?.type,
      inPointSec: cut.inPoint,
      outPointSec: cut.outPoint,
      assetSnapshotThumbnail: activeAsset?.thumbnail,
    }, {
      includeAssetSnapshotFallback: !cut.isClip,
    })
    : null;
  const primaryAudioBinding = cut?.audioBindings?.[0];
  const useEmbeddedAudio = cut?.useEmbeddedAudio ?? true;
  const isClipDurationLocked = !!(cut?.isClip && typeof cut?.inPoint === "number" && typeof cut?.outPoint === "number");
  const attachedAudioSourceName =
    primaryAudioBinding?.sourceName || attachedAudio?.name || "Unknown";
  const hasAttachedAudio = !!primaryAudioBinding?.audioAssetId;
  const lipSyncSettings = activeAsset?.id ? metadataStore?.metadata[activeAsset.id]?.lipSync : undefined;
  const isLipSyncCut = !!cut?.isLipSync;
  const showLipSyncDetails = isLipSyncCut && !!lipSyncSettings;
  const sceneAudioBinding = selectedScene ? metadataStore?.sceneMetadata?.[selectedScene.id]?.attachAudio : undefined;
  const attachedSceneAudio = selectedScene ? getAttachedAudioForScene(selectedScene.id) : undefined;

  // Check for multi-selection
  const isMultiSelection = selectedCutIds.size > 1;
  const selectedCuts = isMultiSelection ? getSelectedCuts() : [];
  const hasClipInSelection = selectedCuts.some(({ cut: selectedCut }) => !!selectedCut.isClip);

  // Check if a group is selected
  const selectedGroupData = getSelectedGroup();

  useEffect(() => {
    let isActive = true;

    const loadGroupThumbnail = async () => {
      setGroupThumbnail(null);

      if (!selectedGroupData) return;

      const firstCutId = selectedGroupData.group.cutIds[0];
      if (!firstCutId) return;

      const firstCut = selectedGroupData.scene.cuts.find((c) => c.id === firstCutId);
      if (!firstCut) return;

      const firstAsset = resolveCutAsset(firstCut, getAsset);
      const firstThumbnail = resolveCutThumbnailFromCache('details-panel', {
        cutId: firstCut.id,
        kind: firstCut.isClip ? 'clip' : 'cut',
        assetId: firstAsset?.id ?? firstCut.assetId,
        assetPath: firstAsset?.path,
        assetType: firstAsset?.type,
        inPointSec: firstCut.inPoint,
        outPointSec: firstCut.outPoint,
        assetSnapshotThumbnail: firstAsset?.thumbnail,
      }, {
        includeAssetSnapshotFallback: !firstCut.isClip,
      });
      if (firstThumbnail) {
        if (isActive) setGroupThumbnail(firstThumbnail);
        return;
      }

      if (firstAsset?.path && (firstAsset.type === "image" || firstAsset.type === "video")) {
        try {
          const cached = await getAssetThumbnail('details-panel', {
            assetId: firstAsset.id,
            path: firstAsset.path,
            type: firstAsset.type,
          });
          if (isActive && cached) {
            setGroupThumbnail(cached);
          }
        } catch {
          // ignore
        }
      }
    };

    void loadGroupThumbnail();
    return () => {
      isActive = false;
    };
  }, [selectedGroupData, getAsset]);

  // State for group name editing
  const [editingGroupName, setEditingGroupName] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState("");

  // Load cut display time
  useEffect(() => {
    if (cut) {
      setLocalDisplayTime(cut.displayTime.toFixed(1));
    }
  }, [cut?.displayTime, cut]);

  // Load attached audio info
  useEffect(() => {
    const loadAttachedAudio = async () => {
      setAttachedAudio(undefined);
      setAttachedAudioDuration(null);

      if (!cutScene?.id || !cut?.id) return;

      const audio = getAttachedAudioForCut(cutScene.id, cut.id);
      setAttachedAudio(audio);

      setAudioOffset((primaryAudioBinding?.offsetSec ?? 0).toFixed(1));

      // Use duration from asset (set during import)
      setAttachedAudioDuration(audio?.duration ?? null);
    };

    loadAttachedAudio();
  }, [cutScene?.id, cut?.id, getAttachedAudioForCut, primaryAudioBinding?.offsetSec]);

  // Load thumbnail and metadata
  useEffect(() => {
    const loadAssetData = async () => {
      setThumbnail(null);

      if (preferredThumbnail) {
        setThumbnail(preferredThumbnail);
      }

      if (!activeAsset?.path) return;

      // Keep Details preview in thumbnail flow; use larger profile for readability.
      if (!preferredThumbnail && activeAsset.type === 'image' && activeAsset.path) {
        try {
          const cached = await getAssetThumbnail('details-panel', {
            assetId: activeAsset.id,
            path: activeAsset.path,
            type: 'image',
          });
          if (cached) {
            setThumbnail(cached);
          }
        } catch {
          // Failed to load
        }
      } else if (!preferredThumbnail && activeAsset.type === 'video' && activeAsset.path) {
        try {
          const cached = await getAssetThumbnail('details-panel', {
            assetId: activeAsset.id,
            path: activeAsset.path,
            type: activeAsset.type,
          });
          if (cached) {
            setThumbnail(cached);
          }
        } catch {
          // Failed to load
        }
      }
    };

    loadAssetData();
  }, [activeAsset?.id, activeAsset?.path, activeAsset?.type, preferredThumbnail]);

  // Load lip sync frame thumbnails
  useEffect(() => {
    let isActive = true;
    const loadLipSyncFrames = async () => {
      setLipSyncFrames([]);

      if (!lipSyncSettings) return;

      const frameAssetIds = getLipSyncFrameAssetIds(lipSyncSettings);

      const sources: string[] = [];
      for (const frameAssetId of frameAssetIds) {
        let src = "";
        const frameAsset = getAsset(frameAssetId);
        if (frameAsset?.thumbnail) {
          src = frameAsset.thumbnail;
        } else if (frameAsset?.path) {
          try {
            const cached = await getAssetThumbnail('details-panel', {
              assetId: frameAsset.id,
              path: frameAsset.path,
              type: 'image',
            });
            if (cached) src = cached;
          } catch {
            // ignore
          }
        }
        sources.push(src);
      }

      const baseFallback = sources[0] || thumbnail || "";
      const resolved = sources.map((src) => src || baseFallback);

      if (isActive) {
        setLipSyncFrames(resolved);
      }
    };

    void loadLipSyncFrames();
    return () => {
      isActive = false;
    };
  }, [lipSyncSettings, getAsset, thumbnail]);

  const lipSyncFrameLabels = (() => {
    const count = lipSyncFrames.length || (lipSyncSettings ? getLipSyncFrameAssetIds(lipSyncSettings).length : 0);
    if (count === 4) return ["Closed", "Half 1", "Half 2", "Open"];
    if (count <= 0) return [];
    return Array.from({ length: count }, (_, index) => (index === 0 ? "Base" : `Frame ${index + 1}`));
  })();

  const handleDisplayTimeChange = (value: string) => {
    if (isClipDurationLocked) return;
    setLocalDisplayTime(value);
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue > 0 && cutScene && cut) {
      executeCommand(
        new UpdateDisplayTimeCommand(cutScene.id, cut.id, numValue),
      ).catch((error) => {
        console.error("Failed to update display time:", error);
      });
    }
  };

  const handleAddNote = () => {
    if (selectedScene && noteText.trim()) {
      executeCommand(new AddSceneNoteCommand(selectedScene.id, {
        type: "text",
        content: noteText.trim(),
      })).catch((error) => {
        console.error("Failed to add scene note:", error);
      });
      setNoteText("");
    }
  };

  const handleDeleteNote = (noteId: string) => {
    if (selectedScene) {
      executeCommand(new RemoveSceneNoteCommand(selectedScene.id, noteId)).catch((error) => {
        console.error("Failed to remove scene note:", error);
      });
    }
  };

  // Batch operations for multi-select
  const handleBatchDisplayTimeChange = (value: string) => {
    setBatchDisplayTime(value);
  };

  const handleApplyBatchDisplayTime = () => {
    if (hasClipInSelection) return;
    const numValue = parseFloat(batchDisplayTime);
    if (isNaN(numValue) || numValue <= 0) return;

    const updates = selectedCuts.map(({ scene, cut: c }) => ({
      sceneId: scene.id,
      cutId: c.id,
      newTime: numValue,
    }));

    if (updates.length > 0) {
      executeCommand(new BatchUpdateDisplayTimeCommand(updates)).catch(
        (error) => {
          console.error("Failed to batch update display time:", error);
        },
      );
    }
  };

  const handleBatchDelete = () => {
    // Delete all selected cuts
    for (const { scene, cut: c } of selectedCuts) {
      executeCommand(new RemoveCutCommand(scene.id, c.id)).catch((error) => {
        console.error("Failed to remove cut:", error);
      });
    }
  };

  const handleSaveClip = async (
    inPoint: number,
    outPoint: number,
    options?: { expectedClipRevision?: number },
  ) => {
    if (cutScene && cut && activeAsset) {
      await savePreviewClipPoints(
        {
          sceneId: cutScene.id,
          cutId: cut.id,
          isClip: !!cut.isClip,
          asset: activeAsset,
        },
        inPoint,
        outPoint,
        {
          executeCommand,
          getCurrentCut: (sceneId, cutId) => {
            const targetScene = useStore.getState().scenes.find((s) => s.id === sceneId);
            return targetScene?.cuts.find((c) => c.id === cutId);
          },
          getCurrentClipRevision: (cutId) => useStore.getState().getCutRuntime(cutId)?.clipRevision ?? 0,
          thumbnailProfile: "details-panel",
        },
        options,
      );
    }
  };

  const handleClearClip = async () => {
    if (cutScene && cut && activeAsset) {
      await clearPreviewClipPoints(
        {
          sceneId: cutScene.id,
          cutId: cut.id,
          isClip: !!cut.isClip,
          asset: activeAsset,
        },
        {
          executeCommand,
          getCurrentCut: (sceneId, cutId) => {
            const targetScene = useStore.getState().scenes.find((s) => s.id === sceneId);
            return targetScene?.cuts.find((c) => c.id === cutId);
          },
          getCurrentClipRevision: (cutId) => useStore.getState().getCutRuntime(cutId)?.clipRevision ?? 0,
          thumbnailProfile: "details-panel",
        },
      );
    }
  };

  // Attach audio handler - opens AssetModal with audio filter
  const handleAttachAudio = () => {
    setPendingLipSyncOpen(false);
    if (hasAttachedAudio) {
      return;
    }
    setShowAssetModal(true);
  };

  const handleReplaceAudio = () => {
    setPendingLipSyncOpen(false);
    setShowAssetModal(true);
  };

  const handleQuickLipSync = () => {
    if (!hasAttachedAudio) {
      setPendingLipSyncOpen(true);
      setShowAssetModal(true);
      return;
    }
    setShowLipSyncModal(true);
  };

  // Handle audio selection from AssetModal
  const handleAssetModalConfirm = (selectedAsset: Asset) => {
    if (cutScene && cut) {
      attachAudioToCut(cutScene.id, cut.id, selectedAsset);
    }
    setShowAssetModal(false);
    if (pendingLipSyncOpen) {
      setPendingLipSyncOpen(false);
      setShowLipSyncModal(true);
    }
  };

  const handleAssetModalClose = () => {
    setShowAssetModal(false);
    setPendingLipSyncOpen(false);
  };

  const handleSceneAttachAudio = () => {
    if (!selectedScene) return;
    setShowSceneAudioModal(true);
  };

  const handleSceneAudioModalConfirm = async (selectedAsset: Asset) => {
    if (!selectedScene) return;
    await executeCommand(new SetSceneAttachAudioCommand(selectedScene.id, selectedAsset));
    setShowSceneAudioModal(false);
  };

  const handleSceneDetachAudio = async () => {
    if (!selectedScene) return;
    await executeCommand(new SetSceneAttachAudioCommand(selectedScene.id, null));
  };

  const handleGroupAttachAudio = () => {
    if (!selectedGroupData) return;
    setShowGroupAudioModal(true);
  };

  const handleGroupAudioModalConfirm = async (selectedAsset: Asset) => {
    if (!selectedGroupData) return;
    await executeCommand(new SetGroupAttachAudioCommand(
      selectedGroupData.scene.id,
      selectedGroupData.group.id,
      selectedAsset,
    ));
    setShowGroupAudioModal(false);
  };

  const handleGroupDetachAudio = async () => {
    if (!selectedGroupData) return;
    await executeCommand(new SetGroupAttachAudioCommand(
      selectedGroupData.scene.id,
      selectedGroupData.group.id,
      null,
    ));
  };

  // Detach audio handler
  const handleDetachAudio = async () => {
    if (!cutScene || !cut) return;
    if (lipSyncSettings) {
      const confirmed = await confirm({
        title: "Clear attached audio?",
        message: "Lip sync is configured for this cut. Clearing audio may disable lip sync playback.",
        confirmLabel: "Clear Audio",
        cancelLabel: "Cancel",
      });
      if (!confirmed) return;
    }
    detachAudioFromCut(cutScene.id, cut.id);
  };

  // Relink file handler
  const handleRelinkFile = async () => {
    if (!cutScene || !cut || !vaultPath) return;
    const hasLipSyncConfig = !!(cut.assetId && metadataStore?.metadata[cut.assetId]?.lipSync);
    if (cut.isLipSync || hasLipSyncConfig) {
      const confirmed = await confirm({
        title: 'Relink and reset LipSync?',
        message:
          'Relinking this cut will reset LipSync and convert it back to a normal image cut.\n' +
          'Generated LipSync frames for the current source will be cleaned up if no other LipSync cut uses them.',
        variant: 'info',
        confirmLabel: 'Relink and Reset',
        cancelLabel: 'Cancel',
      });
      if (!confirmed) return;
    }

    try {
      const importedAsset = await selectAndImportAssetToVault({
        vaultPath,
        filterType: 'all',
        dialogTitle: 'Select New File',
      });
      if (!importedAsset) {
        return;
      }

      const newAsset: Asset = {
        ...importedAsset,
      };

      // Load thumbnail for images or generate for videos
      const thumbnail = await getAssetThumbnail('timeline-card', {
        assetId: newAsset.id,
        path: newAsset.path,
        type: newAsset.type === 'video' ? 'video' : 'image',
      });
      if (thumbnail) {
        newAsset.thumbnail = thumbnail;
      }

      // Relink cut to new asset
      await relinkCutAssetWithLipSyncCleanup(cutScene.id, cut.id, newAsset, {
        eventContext: createStoreEventOperation('user'),
      });
    } catch (error) {
      console.error('Failed to relink file:', error);
      alert(`Failed to relink file: ${error}`);
    }
  };

  // Audio offset handlers
  const handleAudioOffsetChange = (value: string) => {
    setAudioOffset(value);
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && cutScene && cut) {
      updateCutAudioOffset(cutScene.id, cut.id, numValue);
    }
  };

  const handleAudioOffsetStep = (delta: number) => {
    const currentOffset = parseFloat(audioOffset) || 0;
    const newOffset = (currentOffset + delta).toFixed(1);
    handleAudioOffsetChange(newOffset);
  };

  const handleUseEmbeddedAudioToggle = (enabled: boolean) => {
    if (!cutScene || !cut) return;
    setCutUseEmbeddedAudio(cutScene.id, cut.id, enabled);
  };

  const handleFrameCapture = async (timestamp: number): Promise<string | void> => {
    if (!cutScene || !cut || !activeAsset?.path || !vaultPath) {
      throw new Error('Cannot capture frame: missing required data');
    }

    try {
      // Ensure assets folder exists
      const assetsFolder = await ensureAssetsFolderBridge(vaultPath);
      if (!assetsFolder) {
        throw new Error('Failed to access assets folder');
      }

      // Generate unique filename: {video_name}_frame_{timestamp}_{uuid}.png
      const baseName = activeAsset.name.replace(/\.[^/.]+$/, "");
      const timeStr = timestamp.toFixed(2).replace(".", "_");
      const uniqueId = uuidv4().substring(0, 8);
      const frameFileName = `${baseName}_frame_${timeStr}_${uniqueId}.png`;
      const outputPath = `${assetsFolder}/${frameFileName}`.replace(/\\/g, "/");

      // Extract frame using ffmpeg
      const result = await extractVideoFrameBridge({
        sourcePath: activeAsset.path,
        outputPath,
        timestamp,
      });

      if (!result.success) {
        throw new Error(`Failed to capture frame: ${result.error}`);
      }

      // Read the captured image as base64 for thumbnail
      const thumbnailBase64 = await getAssetThumbnail('timeline-card', {
        path: outputPath,
        type: 'image',
      });

      let fileSize: number | undefined;
      const info = await getFileInfoBridge(outputPath);
      fileSize = info?.size;

      // Create new asset for the captured frame
      const newAssetId = uuidv4();
      const sourceLabel = `${baseName} @ ${formatClipTime(timestamp)}`;
      const baseAsset: Asset = {
        id: newAssetId,
        name: sourceLabel,
        path: outputPath,
        type: "image",
        thumbnail: thumbnailBase64 || undefined,
        fileSize,
        vaultRelativePath: `assets/${frameFileName}`,
      };

      const importedAsset = await importFileToVault(outputPath, vaultPath, newAssetId, baseAsset);
      const finalAsset = importedAsset ?? baseAsset;

      // Cache the new asset
      cacheAsset(finalAsset);

      // Add new cut with the captured frame just below the current cut
      const currentIndex = cutScene.cuts.findIndex((c) => c.id === cut.id);
      const insertIndex = currentIndex >= 0 ? currentIndex + 1 : undefined;
      await executeCommand(new AddCutCommand(cutScene.id, finalAsset, undefined, insertIndex));

      return `Captured frame: ${sourceLabel}`;
    } catch (error) {
      console.error("Frame capture failed:", error);
      throw error;
    }
  };

  const formatClipTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Check if all selected cuts are in the same scene (for grouping)
  const allSameScene = selectedCuts.length > 0 &&
    selectedCuts.every(({ scene }) => scene.id === selectedCuts[0].scene.id);

  // Handler to create a group from selected cuts
  const handleCreateGroup = async () => {
    if (!allSameScene || selectedCuts.length < 2) return;

    const sceneId = selectedCuts[0].scene.id;
    const cutIds = selectedCuts.map(({ cut: c }) => c.id);

    try {
      await executeCommand(new CreateGroupCommand(sceneId, cutIds, `Group ${Date.now()}`));
    } catch (error) {
      console.error("Failed to create group:", error);
    }
  };

  // Show group details if a group is selected
  if (selectedGroupId && selectedGroupData) {
    const { scene, group } = selectedGroupData;
    const groupCuts = group.cutIds
      .map(id => scene.cuts.find(c => c.id === id))
      .filter((c): c is typeof scene.cuts[0] => c !== undefined);

    const totalDuration = groupCuts.reduce((acc, c) => acc + c.displayTime, 0);
    const groupAudioBinding = metadataStore?.sceneMetadata?.[scene.id]?.groupAudioBindings?.[group.id];
    const attachedGroupAudio = getAttachedAudioForGroup(scene.id, group.id);

    const handleRenameGroup = async () => {
      if (!groupNameInput.trim()) return;
      try {
        await executeCommand(new RenameGroupCommand(scene.id, group.id, groupNameInput.trim()));
        setEditingGroupName(false);
      } catch (error) {
        console.error("Failed to rename group:", error);
      }
    };

    const handleDissolveGroup = async () => {
      try {
        await executeCommand(new DeleteGroupCommand(scene.id, group.id));
      } catch (error) {
        console.error("Failed to dissolve group:", error);
      }
    };

    return (
      <aside className="details-panel">
        <div className="details-header">
          <Settings size={18} />
          <span>DETAILS</span>
        </div>

        <div className="details-content">
          <div className="selected-info group-info">
            <span className="selected-label">GROUP</span>
            {editingGroupName ? (
              <div className="group-name-edit">
                <input
                  type="text"
                  value={groupNameInput}
                  onChange={(e) => setGroupNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameGroup();
                    if (e.key === "Escape") setEditingGroupName(false);
                  }}
                  onBlur={() => setEditingGroupName(false)}
                  autoFocus
                />
              </div>
            ) : (
              <span
                className="selected-value editable"
                onClick={() => {
                  setGroupNameInput(group.name || '');
                  setEditingGroupName(true);
                }}
              >
                {group.name}
                <Edit2 size={12} />
              </span>
            )}
          </div>

          <div className="details-preview">
            {groupThumbnail ? (
              <img
                src={groupThumbnail}
                alt={group.name}
                className="preview-image"
              />
            ) : (
              <div className="preview-placeholder">
                <Layers size={48} />
              </div>
            )}
          </div>

          <div className="multi-select-stats">
            <div className="stat-item">
              <Layers size={16} />
              <span>{groupCuts.length} cuts</span>
            </div>
            <div className="stat-item">
              <Clock size={16} />
              <span>{totalDuration.toFixed(1)}s total</span>
            </div>
          </div>

          {/* Group cuts preview list */}
          <div className="group-cuts-list">
            <span className="breakdown-label">Cuts in Group:</span>
            {groupCuts.map((groupCut, idx) => (
              <div key={groupCut.id} className="breakdown-item">
                <span>Cut {idx + 1}</span>
                <span className="count">{groupCut.displayTime.toFixed(1)}s</span>
              </div>
            ))}
          </div>

          {groupAudioBinding?.audioAssetId ? (
            <div className="attached-audio-section">
              <div className="attached-audio-header">
                <Music size={14} />
                <span>Group Audio</span>
              </div>
              <div className="attached-audio-info">
                <span className="audio-name">
                  {groupAudioBinding.sourceName || attachedGroupAudio?.name || "Unknown"}
                </span>
              </div>
              <div className="attached-audio-actions">
                <button
                  className="audio-btn edit"
                  onClick={handleGroupAttachAudio}
                  title="Replace group audio"
                >
                  Replace
                </button>
                <button
                  className="audio-btn remove"
                  onClick={handleGroupDetachAudio}
                  title="Clear group audio"
                >
                  Clear
                </button>
              </div>
            </div>
          ) : (
            <div className="scene-notes-section">
              <div className="notes-header">
                <Music size={16} />
                <span>Group Audio</span>
              </div>
              <div className="details-actions">
                <button className="action-btn secondary" onClick={handleGroupAttachAudio}>
                  <Music size={16} />
                  <span>ATTACH GROUP AUDIO</span>
                </button>
              </div>
            </div>
          )}

          <div className="details-actions">
            <button
              className="action-btn secondary"
              onClick={() => toggleGroupCollapsed(scene.id, group.id)}
            >
              {group.isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
              <span>{group.isCollapsed ? "EXPAND" : "COLLAPSE"}</span>
            </button>
          </div>

          <div className="details-footer">
            <button className="delete-btn" onClick={handleDissolveGroup}>
              <FolderOpen size={14} />
              <span>Dissolve Group</span>
            </button>
          </div>

          <AssetModal
            open={showGroupAudioModal}
            onClose={() => setShowGroupAudioModal(false)}
            onConfirm={handleGroupAudioModalConfirm}
            title="Select Group Audio"
            initialFilterType="audio"
            allowImport={true}
          />
        </div>
      </aside>
    );
  }

  // Show multi-selection details
  if (isMultiSelection && selectionType === "cut") {
    const totalDuration = selectedCuts.reduce(
      (acc, { cut: c }) => acc + c.displayTime,
      0,
    );
    const sceneGroups = new Map<string, number>();
    selectedCuts.forEach(({ scene }) => {
      sceneGroups.set(scene.name, (sceneGroups.get(scene.name) || 0) + 1);
    });

    return (
      <aside className="details-panel">
        <div className="details-header">
          <Settings size={18} />
          <span>DETAILS</span>
        </div>

        <div className="details-content">
          <div className="selected-info multi-select">
            <span className="selected-label">MULTI-SELECT</span>
            <span className="selected-value">
              {selectedCutIds.size} cuts selected
            </span>
          </div>

          <div className="multi-select-stats">
            <div className="stat-item">
              <Clock size={16} />
              <span>{totalDuration.toFixed(1)}s total</span>
            </div>
            <div className="stat-item">
              <Layers size={16} />
              <span>
                {sceneGroups.size} scene{sceneGroups.size > 1 ? "s" : ""}
              </span>
            </div>
          </div>

          <div className="multi-select-breakdown">
            <span className="breakdown-label">By Scene:</span>
            {Array.from(sceneGroups.entries()).map(([sceneName, count]) => (
              <div key={sceneName} className="breakdown-item">
                <span>{sceneName}</span>
                <span className="count">
                  {count} cut{count > 1 ? "s" : ""}
                </span>
              </div>
            ))}
          </div>

          {/* Group creation button - only when all cuts are in same scene */}
          {allSameScene && selectedCuts.length >= 2 && (
            <div className="details-actions">
              <button className="action-btn create-group" onClick={handleCreateGroup}>
                <Layers size={16} />
                <span>CREATE GROUP</span>
              </button>
            </div>
          )}

          <div className="multi-select-batch-actions">
            <div className="batch-action-section">
              <span className="batch-label">
                <Clock size={14} />
                Set Display Time:
              </span>
              <div className="batch-time-input-group">
                <input
                  type="number"
                  value={batchDisplayTime}
                  onChange={(e) => handleBatchDisplayTimeChange(e.target.value)}
                  step="0.1"
                  min="0.1"
                  max="60"
                  className="time-input"
                  disabled={hasClipInSelection}
                  title={hasClipInSelection ? "Display time is locked when clip cuts are selected" : undefined}
                />
                <span className="time-unit">s</span>
                <button
                  className="apply-btn"
                  onClick={handleApplyBatchDisplayTime}
                  disabled={hasClipInSelection}
                  title={hasClipInSelection ? "Display time is locked when clip cuts are selected" : undefined}
                >
                  Apply
                </button>
              </div>
            </div>
          </div>

          <div className="multi-select-actions">
            <p className="hint">
              Ctrl/Cmd+C to copy, Ctrl/Cmd+V to paste, Delete to remove
            </p>
            <button className="delete-btn batch" onClick={handleBatchDelete}>
              <Trash2 size={14} />
              <span>Delete Selected ({selectedCutIds.size})</span>
            </button>
          </div>
        </div>
      </aside>
    );
  }

  // Show scene details
  if (selectionType === "scene" && selectedScene) {
    return (
      <aside className="details-panel">
        <div className="details-header">
          <Settings size={18} />
          <span>DETAILS</span>
        </div>

        <div className="details-content">
          <div className="selected-info">
            <span className="selected-label">SELECTED SCENE</span>
            <span className="selected-value">{selectedScene.name}</span>
          </div>

          <div className="scene-stats">
            <div className="stat-item">
              <Layers size={16} />
              <span>{selectedScene.cuts.length} cuts</span>
            </div>
            <div className="stat-item">
              <Clock size={16} />
              <span>
                {selectedScene.cuts
                  .reduce((acc, c) => acc + c.displayTime, 0)
                  .toFixed(1)}
                s total
              </span>
            </div>
          </div>

          {sceneAudioBinding?.audioAssetId ? (
            <div className="attached-audio-section">
              <div className="attached-audio-header">
                <Music size={14} />
                <span>Scene Audio</span>
              </div>
              <div className="attached-audio-info">
                <span className="audio-name">
                  {sceneAudioBinding.sourceName || attachedSceneAudio?.name || "Unknown"}
                </span>
              </div>
              <div className="attached-audio-actions">
                <button
                  className="audio-btn edit"
                  onClick={handleSceneAttachAudio}
                  title="Replace scene audio"
                >
                  Replace
                </button>
                <button
                  className="audio-btn remove"
                  onClick={handleSceneDetachAudio}
                  title="Clear scene audio"
                >
                  Clear
                </button>
              </div>
            </div>
          ) : (
            <div className="scene-notes-section">
              <div className="notes-header">
                <Music size={16} />
                <span>Scene Audio</span>
              </div>
              <div className="details-actions">
                <button className="action-btn secondary" onClick={handleSceneAttachAudio}>
                  <Music size={16} />
                  <span>ATTACH SCENE AUDIO</span>
                </button>
              </div>
            </div>
          )}

          <div className="scene-notes-section">
            <div className="notes-header">
              <StickyNote size={16} />
              <span>Notes</span>
            </div>

            <div className="notes-input">
              <textarea
                placeholder="Add a note..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={3}
              />
              <button
                className="add-note-btn"
                onClick={handleAddNote}
                disabled={!noteText.trim()}
              >
                <Plus size={16} />
              </button>
            </div>

            <div className="notes-list">
              {selectedScene.notes?.map((note) => (
                <div key={note.id} className="note-item">
                  <p>{note.content}</p>
                  <button
                    className="delete-note-btn"
                    onClick={() => handleDeleteNote(note.id)}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {(!selectedScene.notes || selectedScene.notes.length === 0) && (
                <p className="no-notes">No notes yet</p>
              )}
            </div>
          </div>

          <AssetModal
            open={showSceneAudioModal}
            onClose={() => setShowSceneAudioModal(false)}
            onConfirm={handleSceneAudioModalConfirm}
            title="Select Scene Audio"
            initialFilterType="audio"
            allowImport={true}
          />
        </div>
      </aside>
    );
  }

  // Show cut details
  if (selectionType === "cut" && cut && activeAsset) {
    const isVideo = activeAsset.type === "video";
    const previewImage = showLipSyncDetails ? lipSyncFrames[0] || thumbnail : thumbnail;

    return (
      <aside className="details-panel">
        <div className="details-header">
          <Settings size={18} />
          <span>DETAILS</span>
        </div>

        <div className="details-content">
          <div className={`selected-info ${showLipSyncDetails ? "lipsync-info" : ""}`}>
            <span className="selected-label">
              {showLipSyncDetails ? "LIP SYNC CUT" : "SELECTED"}
            </span>
            <span className="selected-value">
              {cutScene?.name} / Cut {(cut.order || 0) + 1}
            </span>
          </div>

          <div
            className={`details-preview clickable ${showLipSyncDetails ? "lipsync-preview" : ""}`}
            onClick={() => setShowVideoPreview(true)}
            title="Click to preview"
          >
            {previewImage ? (
              <>
                <img
                  src={previewImage}
                  alt={activeAsset.name}
                  className="preview-image"
                />
                {isVideo && (
                  <div className="preview-play-overlay">
                    <Play size={32} />
                  </div>
                )}
              </>
            ) : (
              showLipSyncDetails ? (
                <div className="lipsync-preview-placeholder">
                  <Mic size={48} />
                  <span>
                    {lipSyncFrames.length
                      ? `${lipSyncFrames.length} Frames Registered`
                      : "Frames not available"}
                  </span>
                </div>
              ) : (
                <div className="preview-placeholder">
                  {isVideo ? <Film size={48} /> : <FileImage size={48} />}
                </div>
              )
            )}
          </div>

          {showLipSyncDetails && (
            <>
              <div className="lipsync-frames-info">
                <div className="lipsync-frames-header">
                  <Mic size={14} />
                  <span>Registered Frames</span>
                </div>
                <div className="lipsync-frames-grid">
                  {(lipSyncFrames.length ? lipSyncFrames : new Array(4).fill("")).map((src, index) => {
                    const label = lipSyncFrameLabels[index] || `Frame ${index + 1}`;
                    return (
                      <div key={`${label}-${index}`} className="lipsync-frame-item">
                        <div className={`frame-thumb ${src ? "" : "placeholder"}`}>
                          {src && <img src={src} alt={label} />}
                        </div>
                        <span>{label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

            </>
          )}

          <div className="details-info">
            {isLipSyncCut && !lipSyncSettings && (
              <div className="info-row">
                <span className="info-label">Lip Sync:</span>
                <span className="info-value">Settings missing</span>
              </div>
            )}
            <div className="info-row">
              <span className="info-label">
                <Clock size={14} />
                Display Time:
              </span>
              <div className="time-input-group">
                <input
                  type="number"
                  value={localDisplayTime}
                  onChange={(e) => handleDisplayTimeChange(e.target.value)}
                  step="0.1"
                  min="0.1"
                  max="60"
                  className="time-input"
                  disabled={isClipDurationLocked}
                  title={isClipDurationLocked ? "Display time is locked for clip cuts" : undefined}
                />
                <span className="time-unit">seconds</span>
              </div>
            </div>
            {isVideo && (
              <div className="info-row">
                <span className="info-label">
                  <Volume2 size={14} />
                  Audio from the video:
                </span>
                <Toggle
                  checked={useEmbeddedAudio}
                  onChange={handleUseEmbeddedAudioToggle}
                  size="sm"
                />
              </div>
            )}
          </div>

          {/* Clip Info Section (for video clips) */}
          {isVideo &&
            cut?.isClip &&
            cut.inPoint !== undefined &&
            cut.outPoint !== undefined && (
              <div className="clip-info-section">
                <div className="clip-info-header">
                  <Scissors size={14} />
                  <span>Video Clip</span>
                </div>
                <div className="clip-info-content">
                  <div className="clip-times">
                    <span className="clip-time-label">IN:</span>
                    <span className="clip-time-value">
                      {formatClipTime(cut.inPoint)}
                    </span>
                    <span className="clip-time-separator">→</span>
                    <span className="clip-time-label">OUT:</span>
                    <span className="clip-time-value">
                      {formatClipTime(cut.outPoint)}
                    </span>
                  </div>
                  <div className="clip-actions">
                    <button
                      className="clip-edit-btn"
                      onClick={() => setShowVideoPreview(true)}
                      title="Edit clip points"
                    >
                      Edit
                    </button>
                    <button
                      className="clip-clear-btn"
                      onClick={handleClearClip}
                      title="Clear clip (use full video)"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>
            )}

          {metadata?.prompt && (
            <div className="metadata-section">
              <div className="metadata-header">Prompt</div>
              <div className="metadata-content prompt-text">
                {metadata.prompt}
              </div>
              {metadata.negativePrompt && (
                <>
                  <div className="metadata-header negative">
                    Negative Prompt
                  </div>
                  <div className="metadata-content prompt-text negative">
                    {metadata.negativePrompt}
                  </div>
                </>
              )}
              {(metadata.model || metadata.seed) && (
                <div className="metadata-params">
                  {metadata.model && <span>Model: {metadata.model}</span>}
                  {metadata.seed && <span>Seed: {metadata.seed}</span>}
                  {metadata.steps && <span>Steps: {metadata.steps}</span>}
                  {metadata.cfg && <span>CFG: {metadata.cfg}</span>}
                </div>
              )}
            </div>
          )}

          {/* Attached Audio Section */}
          {hasAttachedAudio && (
            <div className="attached-audio-section">
              <div className="attached-audio-header">
                <Music size={14} />
                <span>Attached Audio</span>
              </div>
              <div className="attached-audio-info">
                <span className="audio-name">{attachedAudioSourceName}</span>
              </div>
              {attachedAudioDuration !== null && (
                <div className="attached-audio-duration">
                  Duration: {formatDuration(attachedAudioDuration)}
                </div>
              )}
              <div className="audio-offset-control">
                <label>Offset:</label>
                <button
                  className="audio-offset-btn"
                  onClick={() => handleAudioOffsetStep(-0.1)}
                  title="Decrease offset"
                >
                  <Minus size={12} />
                </button>
                <input
                  type="number"
                  value={audioOffset}
                  onChange={(e) => handleAudioOffsetChange(e.target.value)}
                  step="0.1"
                  className="offset-input"
                />
                <span className="offset-unit">s</span>
                <button
                  className="audio-offset-btn"
                  onClick={() => handleAudioOffsetStep(0.1)}
                  title="Increase offset"
                >
                  <Plus size={12} />
                </button>
              </div>
              <div className="attached-audio-actions">
                <button
                  className="audio-btn edit"
                  onClick={handleReplaceAudio}
                  title="Replace audio"
                >
                  Replace
                </button>
                <button
                  className="audio-btn remove"
                  onClick={handleDetachAudio}
                  title="Clear audio"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          <div className="details-actions">
            <button className="action-btn lip-sync" onClick={handleQuickLipSync}>
              <Mic size={16} />
              <span>{showLipSyncDetails ? "EDIT LIPSYNC" : "QUICK LIPSYNC"}</span>
            </button>
            <button className="action-btn secondary" onClick={handleAttachAudio}>
              <Music size={16} />
              <span>ATTACH AUDIO</span>
            </button>
          </div>

          <div className="details-footer">
            <button className="relink-btn" onClick={handleRelinkFile}>
              <Link size={14} />
              <span>Relink File</span>
            </button>
          </div>
        </div>

        {/* Single Mode Preview Modal */}
        {showVideoPreview && activeAsset && (
          <PreviewModal
            asset={activeAsset}
            focusCutId={cut?.id}
            onClose={() => setShowVideoPreview(false)}
            initialInPoint={cut?.inPoint}
            initialOutPoint={cut?.outPoint}
            onClipSave={isVideo ? handleSaveClip : undefined}
            onClipClear={isVideo ? handleClearClip : undefined}
            onFrameCapture={isVideo ? handleFrameCapture : undefined}
          />
        )}

        {/* Lip Sync Modal */}
        {showLipSyncModal && activeAsset && (
          <LipSyncModal
            asset={activeAsset}
            sceneId={cutScene?.id || ""}
            cutId={cut?.id}
            onClose={() => setShowLipSyncModal(false)}
          />
        )}

        {/* Asset Modal for attaching audio */}
        <AssetModal
          open={showAssetModal}
          onClose={handleAssetModalClose}
          onConfirm={handleAssetModalConfirm}
          title="Select Audio"
          initialFilterType="audio"
          allowImport={true}
        />
      </aside>
    );
  }

  // Default empty state
  return (
    <aside className="details-panel">
      <div className="details-header">
        <Settings size={18} />
        <span>DETAILS</span>
      </div>
      <div className="details-empty">
        <p>Select a scene or cut to view details</p>
      </div>
    </aside>
  );
}
