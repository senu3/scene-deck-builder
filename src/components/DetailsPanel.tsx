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
  MessageSquare,
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
  selectAddSceneNote,
  selectRemoveSceneNote,
  selectGetSelectedCuts,
  selectGetSelectedGroup,
  selectToggleGroupCollapsed,
  selectCacheAsset,
  selectUpdateCutAsset,
  selectVaultPath,
  selectMetadataStore,
  selectAttachAudioToCut,
  selectDetachAudioFromCut,
  selectGetAttachedAudioForScene,
  selectGetAttachedAudioForCut,
  selectUpdateCutAudioOffset,
  selectSetCutUseEmbeddedAudio,
  selectRelinkCutAsset,
  selectOpenVideoPreview,
  selectOpenSequencePreview,
} from "../store/selectors";
import { useHistoryStore } from "../store/historyStore";
import {
  UpdateDisplayTimeCommand,
  RemoveCutCommand,
  BatchUpdateDisplayTimeCommand,
  UpdateClipPointsCommand,
  DuplicateCutWithClipCommand,
  ClearClipPointsCommand,
  AddCutCommand,
  CreateGroupCommand,
  DeleteGroupCommand,
  RenameGroupCommand,
  SetSceneAttachAudioCommand,
  UpdateCutSubtitleCommand,
} from "../store/commands";
import { getThumbnail } from "../utils/thumbnailCache";
import { extractVideoMetadata } from "../utils/videoUtils";
import { getLipSyncFrameAssetIds } from "../utils/lipSyncUtils";
import { importFileToVault } from "../utils/assetPath";
// Note: getAudioDuration was removed - duration comes from asset.duration after import
import PreviewModal from "./PreviewModal";
import LipSyncModal from "./LipSyncModal";
import AssetModal from "./AssetModal";
import type { ImageMetadata, Asset } from "../types";
import { v4 as uuidv4 } from "uuid";
import { Toggle, useDialog } from "../ui";
import "./DetailsPanel.css";

const SUBTITLE_SUMMARY_MAX = 15;

function summarizeSubtitleText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= SUBTITLE_SUMMARY_MAX) return normalized;
  return `${normalized.slice(0, SUBTITLE_SUMMARY_MAX)}...`;
}

export default function DetailsPanel() {
  const scenes = useStore(selectScenes);
  const selectedSceneId = useStore(selectSelectedSceneId);
  const selectedCutId = useStore(selectSelectedCutId);
  const selectedCutIds = useStore(selectSelectedCutIds);
  const selectionType = useStore(selectSelectionType);
  const selectedGroupId = useStore(selectSelectedGroupId);
  const getAsset = useStore(selectGetAsset);
  const addSceneNote = useStore(selectAddSceneNote);
  const removeSceneNote = useStore(selectRemoveSceneNote);
  const getSelectedCuts = useStore(selectGetSelectedCuts);
  const getSelectedGroup = useStore(selectGetSelectedGroup);
  const toggleGroupCollapsed = useStore(selectToggleGroupCollapsed);
  const cacheAsset = useStore(selectCacheAsset);
  const updateCutAsset = useStore(selectUpdateCutAsset);
  const vaultPath = useStore(selectVaultPath);
  const metadataStore = useStore(selectMetadataStore);
  const attachAudioToCut = useStore(selectAttachAudioToCut);
  const detachAudioFromCut = useStore(selectDetachAudioFromCut);
  const getAttachedAudioForScene = useStore(selectGetAttachedAudioForScene);
  const getAttachedAudioForCut = useStore(selectGetAttachedAudioForCut);
  const updateCutAudioOffset = useStore(selectUpdateCutAudioOffset);
  const setCutUseEmbeddedAudio = useStore(selectSetCutUseEmbeddedAudio);
  const relinkCutAsset = useStore(selectRelinkCutAsset);
  const openVideoPreview = useStore(selectOpenVideoPreview);
  const openSequencePreview = useStore(selectOpenSequencePreview);

  const { executeCommand } = useHistoryStore();
  const { confirm } = useDialog();

  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [localDisplayTime, setLocalDisplayTime] = useState("2.0");
  const [batchDisplayTime, setBatchDisplayTime] = useState("2.0");
  const [metadata, setMetadata] = useState<ImageMetadata | null>(null);
  const [noteText, setNoteText] = useState("");
  const [showVideoPreview, setShowVideoPreview] = useState(false);
  const [showLipSyncModal, setShowLipSyncModal] = useState(false);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [showSceneAudioModal, setShowSceneAudioModal] = useState(false);
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
  const asset =
    cut?.isClip && cut?.asset?.thumbnail
      ? cut.asset
      : (cut?.assetId ? (getAsset(cut.assetId) || cut.asset) : cut?.asset);
  const primaryAudioBinding = cut?.audioBindings?.[0];
  const useEmbeddedAudio = cut?.useEmbeddedAudio ?? true;
  const attachedAudioSourceName =
    primaryAudioBinding?.sourceName || attachedAudio?.name || "Unknown";
  const hasAttachedAudio = !!primaryAudioBinding?.audioAssetId;
  const lipSyncSettings = asset?.id ? metadataStore?.metadata[asset.id]?.lipSync : undefined;
  const isLipSyncCut = !!cut?.isLipSync;
  const showLipSyncDetails = isLipSyncCut && !!lipSyncSettings;
  const sceneAudioBinding = selectedScene ? metadataStore?.sceneMetadata?.[selectedScene.id]?.attachAudio : undefined;
  const attachedSceneAudio = selectedScene ? getAttachedAudioForScene(selectedScene.id) : undefined;
  const subtitleSummary = cut?.subtitle?.text ? summarizeSubtitleText(cut.subtitle.text) : "";

  // Check for multi-selection
  const isMultiSelection = selectedCutIds.size > 1;
  const selectedCuts = isMultiSelection ? getSelectedCuts() : [];

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

      const firstAsset = firstCut.asset || (firstCut.assetId ? getAsset(firstCut.assetId) : undefined);
      if (firstAsset?.thumbnail) {
        if (isActive) setGroupThumbnail(firstAsset.thumbnail);
        return;
      }

      if (firstAsset?.path && (firstAsset.type === "image" || firstAsset.type === "video")) {
        try {
          const cached = await getThumbnail(firstAsset.path, firstAsset.type);
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
      setMetadata(null);

      if (!asset?.path) return;

      // Keep Details preview in thumbnail flow; use larger profile for readability.
      if (asset.type === 'image' && asset.path) {
        try {
          const cached = await getThumbnail(asset.path, 'image', { profile: 'details-panel' });
          if (cached) {
            setThumbnail(cached);
          }
        } catch {
          // Failed to load
        }
      } else if (asset.thumbnail) {
        setThumbnail(asset.thumbnail);
      } else if (asset.type === 'video' && asset.path) {
        try {
          const cached = await getThumbnail(asset.path, asset.type);
          if (cached) {
            setThumbnail(cached);
          }
        } catch {
          // Failed to load
        }
      }

      // Load metadata - use asset.metadata if available (for videos)
      if (asset.metadata) {
        setMetadata(asset.metadata);
      } else if (window.electronAPI && asset.type === "image") {
        // Only call readImageMetadata for images without existing metadata
        try {
          const meta = await window.electronAPI.readImageMetadata(asset.path);
          if (meta) {
            setMetadata(meta);
          }
        } catch {
          // Failed to load
        }
      }
    };

    loadAssetData();
  }, [asset?.path, asset?.thumbnail, asset?.metadata, asset?.type]);

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
            const cached = await getThumbnail(frameAsset.path, "image");
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
      addSceneNote(selectedScene.id, {
        type: "text",
        content: noteText.trim(),
      });
      setNoteText("");
    }
  };

  const handleDeleteNote = (noteId: string) => {
    if (selectedScene) {
      removeSceneNote(selectedScene.id, noteId);
    }
  };

  // Batch operations for multi-select
  const handleBatchDisplayTimeChange = (value: string) => {
    setBatchDisplayTime(value);
  };

  const handleApplyBatchDisplayTime = () => {
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

  const handleSaveClip = async (inPoint: number, outPoint: number) => {
    if (cutScene && cut && asset) {
      let targetCutId = cut.id;
      if (cut.isClip) {
        // Existing clip: update IN/OUT points in place
        await executeCommand(
          new UpdateClipPointsCommand(cutScene.id, cut.id, inPoint, outPoint),
        );
      } else {
        // First-time clip: duplicate source cut and apply clip to duplicated cut
        const duplicateClipCommand = new DuplicateCutWithClipCommand(cutScene.id, cut.id, inPoint, outPoint);
        await executeCommand(duplicateClipCommand);
        targetCutId = duplicateClipCommand.getCreatedCutId() ?? cut.id;
      }

      // Regenerate thumbnail at IN point
      if (asset.path && asset.type === "video") {
        const newThumbnail = await getThumbnail(asset.path, 'video', { timeOffset: inPoint });
        if (newThumbnail) {
          // Clip thumbnail is cut-specific; do not mutate shared asset cache thumbnail.
          updateCutAsset(cutScene.id, targetCutId, { thumbnail: newThumbnail });
          setThumbnail(newThumbnail);
        }
      }
    }
  };

  const handleClearClip = async () => {
    if (cutScene && cut && asset) {
      await executeCommand(new ClearClipPointsCommand(cutScene.id, cut.id));

      // Regenerate thumbnail at time 0
      if (asset.path && asset.type === "video") {
        const newThumbnail = await getThumbnail(asset.path, 'video', { timeOffset: 0 });
        if (newThumbnail) {
          // Clip clear thumbnail is cut-specific; do not mutate shared asset cache thumbnail.
          updateCutAsset(cutScene.id, cut.id, { thumbnail: newThumbnail });
          setThumbnail(newThumbnail);
        }
      }
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

  const handleEditSubtitle = () => {
    if (!cut || !asset) return;
    if (asset.type === "video") {
      openVideoPreview(cut.id, { openSubtitleModal: true });
      return;
    }
    openSequencePreview(cut.id, { openSubtitleModal: true });
  };

  const handleClearSubtitle = async () => {
    if (!cutScene || !cut?.subtitle) return;
    await executeCommand(new UpdateCutSubtitleCommand(cutScene.id, cut.id, undefined));
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

  const handleSceneAttachAudio = async () => {
    if (!selectedScene) return;
    const affectedVideoCuts = selectedScene.cuts.filter((sceneCut) => {
      const sceneCutAsset = sceneCut.asset || (sceneCut.assetId ? getAsset(sceneCut.assetId) : undefined);
      return sceneCutAsset?.type === "video";
    }).length;
    const confirmed = await confirm({
      title: "Apply Scene Audio?",
      message:
        `This applies scene audio to "${selectedScene.name}".\n\n` +
        `Affected video cuts: ${affectedVideoCuts}\n` +
        `- Clear cut attached audio\n` +
        `- Turn off "Audio from the video"\n\n` +
        `You can undo this in one step.`,
      variant: "info",
      confirmLabel: "Continue",
      cancelLabel: "Cancel",
    });
    if (!confirmed) return;
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
    if (!cutScene || !cut || !vaultPath || !window.electronAPI?.vaultGateway) return;
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

    const filePath = await window.electronAPI.showOpenFileDialog({
      title: 'Select New File',
      filters: [{ name: 'Media', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm', 'mov', 'avi', 'mkv'] }],
    });

    if (!filePath) return;

    try {
      const newAssetId = uuidv4();

      // Import to vault
      const importResult = await window.electronAPI.vaultGateway.importAndRegisterAsset(
        filePath,
        vaultPath,
        newAssetId
      );

      if (!importResult.success) {
        alert(`Failed to import file: ${importResult.error}`);
        return;
      }

      // Get file info
      const fileInfo = await window.electronAPI.getFileInfo(importResult.vaultPath!);
      const ext = fileInfo?.extension?.toLowerCase() || '';
      const isVideo = ['.mp4', '.webm', '.mov', '.avi', '.mkv'].includes(ext);
      const type: Asset['type'] = isVideo ? 'video' : 'image';

      let duration: number | undefined;
      if (isVideo) {
        const videoMeta = await extractVideoMetadata(importResult.vaultPath!);
        if (videoMeta) {
          duration = videoMeta.duration;
        }
      }

      // Create new asset
      const newAsset: Asset = {
        id: newAssetId,
        name: fileInfo?.name || 'asset',
        path: importResult.vaultPath!,
        type,
        vaultRelativePath: importResult.relativePath,
        originalPath: filePath,
        hash: importResult.hash,
        fileSize: fileInfo?.size,
        duration,
      };

      // Load thumbnail for images or generate for videos
      const thumbnail = await getThumbnail(importResult.vaultPath!, isVideo ? 'video' : 'image');
      if (thumbnail) {
        newAsset.thumbnail = thumbnail;
      }

      // Relink cut to new asset
      relinkCutAsset(cutScene.id, cut.id, newAsset);
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
    if (!cutScene || !cut || !asset?.path || !vaultPath) {
      throw new Error('Cannot capture frame: missing required data');
    }

    if (
      !window.electronAPI?.extractVideoFrame ||
      !window.electronAPI?.ensureAssetsFolder
    ) {
      throw new Error('Frame capture requires app restart after update.');
    }

    try {
      // Ensure assets folder exists
      const assetsFolder =
        await window.electronAPI.ensureAssetsFolder(vaultPath);
      if (!assetsFolder) {
        throw new Error('Failed to access assets folder');
      }

      // Generate unique filename: {video_name}_frame_{timestamp}_{uuid}.png
      const baseName = asset.name.replace(/\.[^/.]+$/, "");
      const timeStr = timestamp.toFixed(2).replace(".", "_");
      const uniqueId = uuidv4().substring(0, 8);
      const frameFileName = `${baseName}_frame_${timeStr}_${uniqueId}.png`;
      const outputPath = `${assetsFolder}/${frameFileName}`.replace(/\\/g, "/");

      // Extract frame using ffmpeg
      const result = await window.electronAPI.extractVideoFrame({
        sourcePath: asset.path,
        outputPath,
        timestamp,
      });

      if (!result.success) {
        throw new Error(`Failed to capture frame: ${result.error}`);
      }

      // Read the captured image as base64 for thumbnail
      const thumbnailBase64 = await getThumbnail(outputPath, 'image');

      // Load image metadata if available
      let imageMetadata: ImageMetadata | undefined;
      if (window.electronAPI.readImageMetadata) {
        try {
          const meta = await window.electronAPI.readImageMetadata(outputPath);
          imageMetadata = meta ?? undefined;
        } catch {
          // Metadata not critical
        }
      }

      let fileSize: number | undefined;
      if (window.electronAPI.getFileInfo) {
        const info = await window.electronAPI.getFileInfo(outputPath);
        fileSize = info?.size;
      }

      // Create new asset for the captured frame
      const newAssetId = uuidv4();
      const sourceLabel = `${baseName} @ ${formatClipTime(timestamp)}`;
      const baseAsset: Asset = {
        id: newAssetId,
        name: sourceLabel,
        path: outputPath,
        type: "image",
        thumbnail: thumbnailBase64 || undefined,
        metadata: imageMetadata,
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
                  setGroupNameInput(group.name);
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
                />
                <span className="time-unit">s</span>
                <button
                  className="apply-btn"
                  onClick={handleApplyBatchDisplayTime}
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
  if (selectionType === "cut" && cut && asset) {
    const isVideo = asset.type === "video";
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
                  alt={asset.name}
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

          {cut.subtitle?.text && (
          <div className="subtitle-section">
              <div className="subtitle-header">
              <MessageSquare size={14} />
              <span>Subtitle</span>
            </div>
            <div className="subtitle-preview-text">
              {subtitleSummary}
            </div>
            <div className="subtitle-actions">
              <button
                className="audio-btn subtitle-edit"
                onClick={handleEditSubtitle}
              >
                Edit
              </button>
              <button
                className="audio-btn remove"
                onClick={handleClearSubtitle}
                disabled={!cut.subtitle}
              >
                Clear
              </button>
            </div>
          </div>
          )}

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
        {showVideoPreview && asset && (
          <PreviewModal
            asset={asset}
            focusCutId={cut?.id}
            onClose={() => setShowVideoPreview(false)}
            initialInPoint={cut?.inPoint}
            initialOutPoint={cut?.outPoint}
            onClipSave={isVideo ? handleSaveClip : undefined}
            onFrameCapture={isVideo ? handleFrameCapture : undefined}
          />
        )}

        {/* Lip Sync Modal */}
        {showLipSyncModal && asset && (
          <LipSyncModal
            asset={asset}
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
