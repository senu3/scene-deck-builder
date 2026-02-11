import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState, useEffect, useRef } from 'react';
import { Film, Image, Clock, Scissors, Loader2, Mic, Music } from 'lucide-react';
import { useStore } from '../store/useStore';
import type { Asset, CutAudioBinding } from '../types';
import { v4 as uuidv4 } from 'uuid';
import './CutCard.css';
import { getThumbnail } from '../utils/thumbnailCache';
import { CutContextMenu } from './context-menus';
import ImageCropModal, { type ImageCropConfig } from './ImageCropModal';
import { useDialog, useToast } from '../ui';
import { createDerivedCutAndSyncGroup, finalizeClipAndAddCut } from '../features/cut/actions';

interface ResolutionPresetType {
  name: string;
  width: number;
  height: number;
}

interface CutCardProps {
  cut: {
    id: string;
    assetId: string;
    asset?: Asset;
    displayTime: number;
    order: number;
    // Video clip fields
    inPoint?: number;
    outPoint?: number;
    isClip?: boolean;
    // Loading state
    isLoading?: boolean;
    loadingName?: string;
    // Lip sync fields
    isLipSync?: boolean;
    lipSyncFrameCount?: number;
    audioBindings?: CutAudioBinding[];
  };
  sceneId: string;
  index: number;
  isDragging: boolean;
  isHidden?: boolean;
  cropBaseResolution: ResolutionPresetType;
}

export default function CutCard({ cut, sceneId, index, isDragging, isHidden, cropBaseResolution }: CutCardProps) {
  const {
    selectedCutId,
    selectedCutIds,
    selectCut,
    toggleCutSelection,
    selectCutRange,
    getAsset,
    scenes,
    getSelectedCutIds,
    getSelectedCuts,
    moveCutsToScene,
    removeCut,
    copySelectedCuts,
    canPaste,
    pasteCuts,
    vaultPath,
    openVideoPreview,
    openSequencePreview,
    getCutGroup,
    createGroup,
    removeCutFromGroup,
    createCutFromImport,
    updateGroupCutOrder,
  } = useStore();
  const { toast } = useToast();
  const { confirm: dialogConfirm } = useDialog();
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [showCropModal, setShowCropModal] = useState(false);
  const [showLoadingSpinner, setShowLoadingSpinner] = useState(false);
  const loadingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Show spinner after 1 second of loading
  useEffect(() => {
    if (cut.isLoading) {
      loadingTimerRef.current = setTimeout(() => {
        setShowLoadingSpinner(true);
      }, 1000);
    } else {
      setShowLoadingSpinner(false);
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current);
        loadingTimerRef.current = null;
      }
    }

    return () => {
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current);
      }
    };
  }, [cut.isLoading]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: cut.id,
    data: {
      type: 'cut',
      sceneId,
      index,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    display: isHidden ? 'none' : undefined,
  };

  const asset = cut.asset || getAsset(cut.assetId);
  const isSelected = selectedCutIds.has(cut.id) || selectedCutId === cut.id;
  const isMultiSelected = selectedCutIds.size > 1 && selectedCutIds.has(cut.id);
  const isVideo = asset?.type === 'video';
  const isLipSync = cut.isLipSync;
  const hasAttachedAudio = !!cut.audioBindings?.some((binding) => binding.enabled !== false);

  // Check if this cut is in a group
  const cutGroup = getCutGroup(sceneId, cut.id);
  const isInGroup = !!cutGroup;

  useEffect(() => {
    const loadThumbnail = async () => {
      if (asset?.thumbnail) {
        setThumbnail(asset.thumbnail);
        return;
      }

      if (asset?.path && (asset.type === 'image' || asset.type === 'video')) {
        try {
          const thumbnail = await getThumbnail(asset.path, asset.type);
          if (thumbnail) {
            setThumbnail(thumbnail);
          }
        } catch {
          // Failed to load thumbnail
        }
      }
    };

    loadThumbnail();
  }, [asset]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    // Ctrl/Cmd + click: toggle selection
    if (e.ctrlKey || e.metaKey) {
      toggleCutSelection(cut.id);
      return;
    }

    // Shift + click: range selection
    if (e.shiftKey) {
      selectCutRange(cut.id);
      return;
    }

    // Normal click: single selection
    selectCut(cut.id);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Video cuts use Single Mode preview. Image/lipsync cuts use Sequence Mode.
    if (asset) {
      if (asset.type === 'video') {
        openVideoPreview(cut.id);
      } else {
        openSequencePreview(cut.id);
      }
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // If right-clicking on a non-selected card, select it first
    if (!selectedCutIds.has(cut.id)) {
      selectCut(cut.id);
    }

    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleCopy = () => {
    copySelectedCuts();
    setContextMenu(null);
  };

  const handlePaste = () => {
    // Paste after the current cut's position
    pasteCuts(sceneId, index + 1);
    setContextMenu(null);
  };

  const handleDelete = () => {
    const cutIds = getSelectedCutIds();
    // Delete all selected cuts
    for (const cutId of cutIds) {
      // Find which scene contains this cut
      for (const scene of scenes) {
        if (scene.cuts.some(c => c.id === cutId)) {
          removeCut(scene.id, cutId);
          break;
        }
      }
    }
    setContextMenu(null);
  };

  const handleMoveToScene = (targetSceneId: string) => {
    const cutIds = getSelectedCutIds();
    // Get target scene's cut count for append position
    const targetScene = scenes.find(s => s.id === targetSceneId);
    const toIndex = targetScene?.cuts.length || 0;
    moveCutsToScene(cutIds, targetSceneId, toIndex);
    setContextMenu(null);
  };

  const handleCreateGroup = () => {
    const selectedCuts = getSelectedCuts();
    // Check all cuts are in the same scene
    const allSameScene = selectedCuts.every(({ scene }) => scene.id === sceneId);
    if (!allSameScene || selectedCuts.length < 2) {
      setContextMenu(null);
      return;
    }

    const cutIds = selectedCuts.map(({ cut: c }) => c.id);
    createGroup(sceneId, cutIds, `Group ${Date.now()}`);
    setContextMenu(null);
  };

  const handleRemoveFromGroup = () => {
    if (!cutGroup) {
      setContextMenu(null);
      return;
    }

    removeCutFromGroup(sceneId, cutGroup.id, cut.id);
    setContextMenu(null);
  };

  const handleFinalizeClip = async (reverseOutput: boolean) => {
    if (!cut.isClip || cut.inPoint === undefined || cut.outPoint === undefined || !asset?.path) {
      setContextMenu(null);
      return;
    }

    if (!vaultPath) {
      toast.warning('Vault path not set', 'Please set up a vault first.');
      setContextMenu(null);
      return;
    }

    if (reverseOutput) {
      const proceed = await dialogConfirm({
        title: 'Reverse Clip',
        message: 'Reverse export is memory intensive and may temporarily pause the app.',
        variant: 'warning',
        confirmLabel: 'Continue',
      });
      if (!proceed) {
        setContextMenu(null);
        return;
      }
    }

    try {
      const result = await finalizeClipAndAddCut({
        sceneId,
        sourceCutId: cut.id,
        insertIndex: index + 1,
        sourceAssetPath: asset.path,
        sourceAssetName: asset.name,
        inPoint: cut.inPoint,
        outPoint: cut.outPoint,
        reverseOutput,
        vaultPath,
        createCutFromImport,
        getCutGroup,
        updateGroupCutOrder,
      });

      if (result.success) {
        const sizeText = result.fileSize ? `${(result.fileSize / 1024 / 1024).toFixed(2)} MB` : 'Unknown size';
        toast.success('Clip exported', `${result.fileName} (${sizeText})`);
      } else {
        toast.error('Finalize Clip failed', result.error || 'Unknown error');
      }
    } catch (error) {
      toast.error('Finalize Clip failed', String(error));
    }

    setContextMenu(null);
  };

  const handleReverseClip = () => handleFinalizeClip(true);
  const handleFinalizeClipNormal = () => handleFinalizeClip(false);

  const handleOpenCropModal = () => {
    setContextMenu(null);
    setShowCropModal(true);
  };

  const handleCropImage = async (config: ImageCropConfig) => {
    if (!asset?.path || asset.type !== 'image') {
      setShowCropModal(false);
      return;
    }

    if (!window.electronAPI) {
      toast.error('Crop failed', 'electronAPI not available. Please restart the app.');
      setShowCropModal(false);
      return;
    }

    if (!vaultPath) {
      toast.warning('Vault path not set', 'Please set up a vault first.');
      setShowCropModal(false);
      return;
    }

    if (
      typeof window.electronAPI.cropImageToAspect !== 'function' ||
      typeof window.electronAPI.ensureAssetsFolder !== 'function'
    ) {
      toast.warning('Crop feature requires restart', 'Please restart the Electron app.');
      setShowCropModal(false);
      return;
    }

    try {
      const assetsFolder = await window.electronAPI.ensureAssetsFolder(vaultPath);
      if (!assetsFolder) {
        toast.error('Crop failed', 'Failed to access assets folder in vault.');
        setShowCropModal(false);
        return;
      }

      const baseName = asset.name.replace(/\.[^/.]+$/, '');
      const timestamp = Date.now();
      const fileName = `${baseName}_crop_${config.width}x${config.height}_${timestamp}.png`;
      const outputPath = `${assetsFolder}/${fileName}`.replace(/\\/g, '/');

      const result = await window.electronAPI.cropImageToAspect({
        sourcePath: asset.path,
        outputPath,
        targetWidth: config.width,
        targetHeight: config.height,
        anchorX: config.anchorX,
        anchorY: config.anchorY,
      });

      if (!result.success) {
        toast.error('Crop failed', result.error || 'Unknown error');
        setShowCropModal(false);
        return;
      }

      await createDerivedCutAndSyncGroup({
        sceneId,
        sourceCutId: cut.id,
        insertIndex: index + 1,
        source: {
          assetId: uuidv4(),
          name: fileName,
          sourcePath: outputPath,
          type: 'image',
          fileSize: result.fileSize,
          preferredThumbnail: thumbnail || undefined,
        },
        vaultPath,
        createCutFromImport,
        getCutGroup,
        updateGroupCutOrder,
      });

      toast.success('Image cropped', fileName);
    } catch (error) {
      toast.error('Crop failed', String(error));
    }

    setShowCropModal(false);
  };

  const cropInitialWidth = cropBaseResolution.width > 0 ? cropBaseResolution.width : 1280;
  const cropInitialHeight = cropBaseResolution.height > 0 ? cropBaseResolution.height : 720;

  // If loading, show loading card
  if (cut.isLoading) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className={`cut-card loading ${isDragging ? 'dragging' : ''}`}
      >
        <div className="cut-thumbnail-container">
          <div className="cut-thumbnail placeholder loading-placeholder">
            {showLoadingSpinner && (
              <Loader2 size={24} className="loading-spinner" />
            )}
          </div>
          <div className="cut-loading-name" title={cut.loadingName}>
            {cut.loadingName}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`cut-card ${isSelected ? 'selected' : ''} ${isMultiSelected ? 'multi-selected' : ''} ${isDragging ? 'dragging' : ''} ${isLipSync ? 'lipsync' : ''}`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    >
      <div className="cut-thumbnail-container">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={asset?.name || 'Cut'}
            className="cut-thumbnail"
          />
        ) : (
          <div className="cut-thumbnail placeholder">
            {isLipSync ? (
              <Mic size={24} className="placeholder-icon" />
            ) : isVideo ? (
              <Film size={24} className="placeholder-icon" />
            ) : (
              <Image size={24} className="placeholder-icon" />
            )}
          </div>
        )}

        {/* Asset type badge - icon only */}
        <div className={`cut-type-badge ${isLipSync ? 'lipsync' : isVideo ? 'video' : 'image'}`}>
          {isLipSync ? (
            <Mic size={12} />
          ) : isVideo ? (
            <Film size={12} />
          ) : (
            <Image size={12} />
          )}
        </div>

        {/* Lip sync frame count - top-left (card state indicator area) */}
        {isLipSync && cut.lipSyncFrameCount && (
          <div className="lipsync-frame-count">
            <Image size={10} />
            <span>{cut.lipSyncFrameCount}</span>
          </div>
        )}

        {/* Clip indicator for trimmed videos */}
        {cut.isClip && !isLipSync && (
          <div className="clip-indicator" title={`Clip: ${cut.inPoint?.toFixed(1)}s - ${cut.outPoint?.toFixed(1)}s`}>
            <Scissors size={12} />
          </div>
        )}

        {/* Attached audio indicator */}
        {hasAttachedAudio && !isLipSync && !cut.isClip && (
          <div className="audio-attached-indicator" title="Audio Attached">
            <Music size={12} />
          </div>
        )}

        <div className="cut-duration">
          <Clock size={10} />
          <span>{cut.displayTime.toFixed(1)}s</span>
        </div>
      </div>
    </div>

    {contextMenu && (
      <CutContextMenu
        position={contextMenu}
        isMultiSelect={isMultiSelected}
        selectedCount={selectedCutIds.size}
        scenes={scenes}
        currentSceneId={sceneId}
        canPaste={canPaste()}
        isClip={!!cut.isClip}
        isImage={asset?.type === 'image'}
        isInGroup={isInGroup}
        onClose={() => setContextMenu(null)}
        onCopy={handleCopy}
        onPaste={handlePaste}
        onDelete={handleDelete}
        onMoveToScene={handleMoveToScene}
        onFinalizeClip={handleFinalizeClipNormal}
        onReverseClip={handleReverseClip}
        onCropImage={handleOpenCropModal}
        onCreateGroup={isMultiSelected ? handleCreateGroup : undefined}
        onRemoveFromGroup={isInGroup ? handleRemoveFromGroup : undefined}
      />
    )}

    <ImageCropModal
      open={showCropModal}
      onClose={() => setShowCropModal(false)}
      onConfirm={handleCropImage}
      initialWidth={cropInitialWidth}
      initialHeight={cropInitialHeight}
      sourcePath={asset?.path}
      previewSrc={null}
    />
    </>
  );
}
