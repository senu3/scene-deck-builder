import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useStore } from '../store/useStore';
import {
  selectScenes,
  selectSceneOrder,
  selectPreviewMode,
  selectSelectedSceneId,
  selectGetAsset,
  selectGlobalVolume,
  selectGlobalMuted,
  selectSetGlobalVolume,
  selectToggleGlobalMute,
  selectMetadataStore,
} from '../store/selectors';
import type { Asset, Cut } from '../types';
import { resolveCutAsset, resolveCutThumbnail } from '../utils/assetResolve';
import { useSequencePlaybackController } from '../utils/previewPlaybackController';
import { getScenesInOrder } from '../utils/sceneOrder';
import {
  asCanonicalDurationSec,
  resolveCanonicalCutDuration,
  type CanonicalDurationSec,
} from '../utils/storyTiming';
import { useMiniToast } from '../ui';
import type { PreviewItem, PreviewModalProps, ResolutionPreset } from './preview-modal/types';
import {
  FRAME_DURATION,
  INITIAL_PRELOAD_ITEMS,
  PLAY_SAFE_AHEAD,
  PRELOAD_AHEAD,
  RESOLUTION_PRESETS,
} from './preview-modal/constants';
import {
  clampToDuration,
  revokeIfBlob,
} from './preview-modal/helpers';
import { buildPreviewItems } from './preview-modal/previewItemsBuilder';
import { PreviewModalSequenceView } from './preview-modal/PreviewModalSequenceView';
import { PreviewModalSingleView } from './preview-modal/PreviewModalSingleView';
import { useClipRangeState } from './preview-modal/useClipRangeState';
import { usePreviewSequenceDerived } from './preview-modal/usePreviewSequenceDerived';
import { usePreviewSingleAttachedAudio } from './preview-modal/usePreviewSingleAttachedAudio';
import { usePreviewExportActions } from './preview-modal/usePreviewExportActions';
import { usePreviewSharedViewState } from './preview-modal/usePreviewSharedViewState';
import { usePreviewSingleMediaAsset } from './preview-modal/usePreviewSingleMediaAsset';
import { usePreviewPlaybackControls } from './preview-modal/usePreviewPlaybackControls';
import { usePreviewInteractionCommands } from './preview-modal/usePreviewInteractionCommands';
import { usePreviewViewShell } from './preview-modal/usePreviewViewShell';
import { usePreviewInputs } from './preview-modal/usePreviewInputs';
import { usePreviewSequenceSession } from './preview-modal/usePreviewSequenceSession';
import { resolveCutAudioBinding } from './preview-modal/audioBinding';
import { usePreviewSingleModeSession } from './preview-modal/usePreviewSingleModeSession';
import './PreviewModal.css';
import './shared/playback-controls.css';

export default function PreviewModal({
  onClose,
  exportResolution,
  onResolutionChange,
  focusCutId,
  sequenceCuts,
  sequenceContext,
  onExportSequence,
  // Single Mode props
  asset,
  initialInPoint,
  initialOutPoint,
  onRangeChange,
  onClipSave,
  onClipClear,
  onFrameCapture,
}: PreviewModalProps) {
  const scenes = useStore(selectScenes);
  const sceneOrder = useStore(selectSceneOrder);
  const orderedScenes = useMemo(() => getScenesInOrder(scenes, sceneOrder), [scenes, sceneOrder]);
  const previewMode = useStore(selectPreviewMode);
  const selectedSceneId = useStore(selectSelectedSceneId);
  const getAsset = useStore(selectGetAsset);
  const globalVolume = useStore(selectGlobalVolume);
  const globalMuted = useStore(selectGlobalMuted);
  const setGlobalVolume = useStore(selectSetGlobalVolume);
  const toggleGlobalMute = useStore(selectToggleGlobalMute);
  const metadataStore = useStore(selectMetadataStore);

  // Mode detection: Single Mode if asset prop is provided
  const isSingleMode = !!asset;
  const isSingleModeVideo = isSingleMode && asset?.type === 'video';
  const isSingleModeImage = isSingleMode && asset?.type === 'image';
  const usesSequenceController = !isSingleModeVideo;

  const focusCutData = useMemo(() => {
    if (!focusCutId) return null;
    for (let sIdx = 0; sIdx < orderedScenes.length; sIdx++) {
      const scene = orderedScenes[sIdx];
      const cutIndex = scene.cuts.findIndex(c => c.id === focusCutId);
      if (cutIndex >= 0) {
        return { scene, sceneIndex: sIdx, cut: scene.cuts[cutIndex], cutIndex };
      }
    }
    return null;
  }, [focusCutId, orderedScenes]);
  const hasCutContext = !!focusCutData?.cut;
  const isAssetOnlyPreview = isSingleMode && !hasCutContext;
  const missingFocusedCut = !isSingleMode && !!focusCutId && !focusCutData;

  const [items, setItems] = useState<PreviewItem[]>([]);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [videoObjectUrl, setVideoObjectUrl] = useState<{ assetId: string; url: string } | null>(null);
  const [singleModeIsLooping, setSingleModeIsLooping] = useState(false);
  const [selectedResolution, setSelectedResolution] = useState<ResolutionPreset>(
    exportResolution ? { ...exportResolution } : RESOLUTION_PRESETS[0]
  );
  const { show: showMiniToast, element: miniToastElement } = useMiniToast();
  const [singleModeDuration, setSingleModeDuration] = useState(0);
  const [singleModeCurrentTime, setSingleModeCurrentTime] = useState(0);

  const resolveCutDisplayTimeSec = useCallback((cut: Cut | null | undefined): CanonicalDurationSec => {
    const resolved = resolveCanonicalCutDuration(cut, getAsset, {
      fallbackDurationSec: 1.0,
      preferAssetDuration: true,
    });
    return asCanonicalDurationSec(resolved.durationSec);
  }, [getAsset]);

  const sequenceDurations = useMemo(() => items.map(item => item.normalizedDisplayTime), [items]);
  const sequencePlayback = useSequencePlaybackController(sequenceDurations);
  const {
    state: sequenceState,
    setSource: setSequenceSource,
    setRate: setSequenceRate,
    tick: sequenceTick,
    goToNext: sequenceGoToNext,
    goToPrev: sequenceGoToPrev,
    toggle: sequenceToggle,
    pause: sequencePause,
    setLooping: setSequenceLooping,
    setRange: setSequenceRange,
    setBuffering: setSequenceBuffering,
    seekAbsolute: seekSequenceAbsolute,
    seekPercent: seekSequencePercent,
    skip: skipSequence,
    selectors: sequenceSelectors,
    getLiveAbsoluteTime: getSequenceLiveAbsoluteTime,
  } = sequencePlayback;

  const currentIndex = usesSequenceController ? sequenceState.currentIndex : 0;
  const isBuffering = usesSequenceController ? sequenceState.isBuffering : false;

  const modalRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const progressHandleRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const {
    showOverlay,
    showOverlayNow,
    scheduleHideOverlay,
    displayContainerRef,
    getViewportStyle,
    isFullscreen,
    toggleFullscreen,
  } = usePreviewViewShell({
    modalRef,
    selectedResolution,
    overlayHideDelayMs: 300,
  });
  const {
    singleModeInPoint,
    setSingleModeInPoint,
    singleModeOutPoint,
    setSingleModeOutPoint,
    focusedMarker,
    setFocusedMarker,
    inPoint,
    outPoint,
    notifyRangeChange,
    setMarkerTimeAndSeek,
    stepFocusedMarker,
    handleMarkerFocus,
    handleContainerMouseDown,
  } = useClipRangeState({
    usesSequenceController,
    sequenceInPoint: sequenceState.inPoint,
    sequenceOutPoint: sequenceState.outPoint,
    sequenceTotalDuration: sequenceState.totalDuration,
    singleModeDuration,
    itemsLength: items.length,
    initialInPoint,
    initialOutPoint,
    onRangeChange,
    setSequenceRange,
    seekSequenceAbsolute,
    setSingleModeCurrentTime,
    videoRef,
    frameDuration: FRAME_DURATION,
  });

  const {
    singleModeIsPlaying,
    setSingleModeIsPlaying,
    isSingleModeClipEnabled,
    isSingleModeClipPending,
    toggleSingleModePlay,
    handleSingleModeSetInPoint,
    handleSingleModeSetOutPoint,
    handleSingleModeClearClip,
    handleSingleModeSave,
    handleSingleModeCaptureFrame,
    handleSingleModeTimeUpdate,
    handleSingleModeLoadedMetadata,
    handleSingleModeVideoEnded,
    handleSingleModeProgressClick,
    handleMarkerDrag,
    handleMarkerDragEnd,
  } = usePreviewSingleModeSession({
    isSingleMode,
    isSingleModeVideo,
    usesSequenceController,
    focusCut: focusCutData?.cut ?? null,
    inPoint,
    outPoint,
    initialInPoint,
    singleModeInPoint,
    singleModeOutPoint,
    singleModeIsLooping,
    focusedMarker,
    setFocusedMarker,
    setSingleModeInPoint,
    setSingleModeOutPoint,
    notifyRangeChange,
    setMarkerTimeAndSeek,
    seekSequenceAbsolute,
    sequenceTotalDuration: sequenceState.totalDuration,
    progressBarRef,
    videoRef,
    onClipSave,
    onClipClear,
    onFrameCapture,
    showMiniToast,
    playbackSpeed,
    singleModeDuration,
    setSingleModeDuration,
    singleModeCurrentTime,
    setSingleModeCurrentTime,
  });
  const isPlaying = usesSequenceController ? sequenceState.isPlaying : singleModeIsPlaying;
  const isLooping = usesSequenceController ? sequenceState.isLooping : singleModeIsLooping;

  // ===== ATTACHED AUDIO HELPER =====

  const resolveAudioBindingForCut = useCallback((cut: Cut | null | undefined) => {
    return resolveCutAudioBinding({
      cut,
      getAsset,
      globalMuted,
    });
  }, [getAsset, globalMuted]);

  const resolveAssetForCut = useCallback((cut: Cut | null | undefined): Asset | null => {
    return resolveCutAsset(cut, getAsset);
  }, [getAsset]);

  const resolveThumbnailForCut = useCallback((cut: Cut | null | undefined): string | null => {
    return resolveCutThumbnail(cut, getAsset);
  }, [getAsset]);

  const shouldMuteEmbeddedAudio = useCallback((cut: Cut | null | undefined): boolean => {
    return resolveAudioBindingForCut(cut).muteEmbedded;
  }, [resolveAudioBindingForCut]);

  const getDisplayTimeForAsset = useCallback((assetId: string): number | null => {
    if (!metadataStore) return null;
    const metadata = metadataStore.metadata[assetId];
    const displayTime = metadata?.displayTime;
    if (typeof displayTime !== 'number' || !Number.isFinite(displayTime) || displayTime <= 0) {
      return null;
    }
    return displayTime;
  }, [metadataStore]);

  const getLipSyncSettingsForAsset = useCallback((assetId: string) => {
    if (!metadataStore) return undefined;
    return metadataStore.metadata[assetId]?.lipSync;
  }, [metadataStore]);

  // ===== SINGLE MODE LOGIC =====

  const { isLoading, singleModeImageData } = usePreviewSingleMediaAsset({
    isSingleMode,
    asset,
    videoObjectUrl,
    setVideoObjectUrl,
    revokeIfBlob,
  });

  // Frame stepping (Single Mode)
  const stepFrame = useCallback((direction: number) => {
    if (!videoRef.current) return;

    // Pause video when stepping frames
    if (isPlaying) {
      videoRef.current.pause();
      if (isSingleModeVideo) {
        setSingleModeIsPlaying(false);
      } else {
        sequencePause();
      }
    }

    const duration = isSingleModeVideo ? singleModeDuration : videoRef.current.duration;
    const newTime = videoRef.current.currentTime + (direction * FRAME_DURATION);
    videoRef.current.currentTime = Math.max(0, Math.min(duration, newTime));

    if (isSingleModeVideo) {
      setSingleModeCurrentTime(videoRef.current.currentTime);
    }
  }, [isSingleModeVideo, singleModeDuration, isPlaying, FRAME_DURATION, sequencePause]);
  // Skip seconds (Both modes)
  const skip = useCallback((seconds: number) => {
    if (!usesSequenceController) {
      // Single Mode: direct video seeking
      if (!videoRef.current) return;
      const newTime = Math.max(0, Math.min(singleModeDuration, videoRef.current.currentTime + seconds));
      videoRef.current.currentTime = newTime;
      setSingleModeCurrentTime(newTime);
    } else {
      skipSequence(seconds);
    }
  }, [usesSequenceController, singleModeDuration, skipSequence]);

  usePreviewSingleAttachedAudio({
    isSingleMode,
    isSingleModeVideo,
    hasCutContext,
    assetId: asset?.id,
    focusCut: focusCutData?.cut ?? null,
    focusScene: focusCutData?.scene ?? null,
    metadataStore: metadataStore ?? null,
    getAsset,
    resolveAudioBindingForCut,
    inPoint,
    outPoint,
    videoRef,
    singleModeIsPlaying,
    sequenceIsPlaying: sequenceState.isPlaying,
    sequenceIsBuffering: sequenceState.isBuffering,
    getSequenceAbsoluteTime: sequenceSelectors.getAbsoluteTime,
    globalMuted,
    globalVolume,
  });

  // ===== SEQUENCE MODE LOGIC =====

  // Build preview items
  useEffect(() => {
    let cancelled = false;
    void buildPreviewItems({
      isSingleMode,
      isSingleModeVideo,
      isSingleModeImage,
      asset,
      singleModeImageData,
      orderedScenes,
      previewMode,
      selectedSceneId,
      getAsset,
      getDisplayTimeForAsset,
      getLipSyncSettingsForAsset,
      focusCutData,
      missingFocusedCut,
      sequenceCuts,
      sequenceContext,
      resolveAssetForCut,
      resolveThumbnailForCut,
      resolveCutDisplayTimeSec,
    }).then((nextItems) => {
      if (cancelled) return;
      setItems(nextItems);
    });
    return () => {
      cancelled = true;
    };
  }, [
    isSingleMode,
    isSingleModeVideo,
    isSingleModeImage,
    asset,
    singleModeImageData,
    orderedScenes,
    previewMode,
    selectedSceneId,
    getAsset,
    getDisplayTimeForAsset,
    getLipSyncSettingsForAsset,
    focusCutData,
    missingFocusedCut,
    sequenceCuts,
    sequenceContext,
    resolveAssetForCut,
    resolveThumbnailForCut,
    resolveCutDisplayTimeSec,
  ]);

  useEffect(() => {
    if (!isSingleModeImage || items.length === 0) return;
    if (initialInPoint === undefined && initialOutPoint === undefined) return;

    setSequenceRange(initialInPoint ?? null, initialOutPoint ?? null);
    if (typeof initialInPoint === 'number') {
      seekSequenceAbsolute(initialInPoint);
    }
  }, [
    isSingleModeImage,
    items.length,
    initialInPoint,
    initialOutPoint,
    setSequenceRange,
    seekSequenceAbsolute,
  ]);

  const {
    previewSequenceItemByCutId,
    previewAudioPlan,
  } = usePreviewSequenceDerived({
    items,
    metadataStore: metadataStore ?? null,
    getAsset,
  });

  // ===== SEQUENCE MODE SESSION =====
  const { checkBufferStatus, sequenceMediaElement } = usePreviewSequenceSession({
    isSingleMode,
    usesSequenceController,
    items,
    currentIndex,
    sequenceCurrentIndex: sequenceState.currentIndex,
    videoObjectUrl,
    setVideoObjectUrl,
    resolveAssetForCut,
    setSequenceBuffering,
    sequenceIsPlaying: sequenceState.isPlaying,
    sequenceIsBuffering: sequenceState.isBuffering,
    initialPreloadItems: INITIAL_PRELOAD_ITEMS,
    playSafeAhead: PLAY_SAFE_AHEAD,
    preloadAhead: PRELOAD_AHEAD,
    revokeIfBlob,
    playbackSpeed,
    setSequenceSource,
    sequenceTick,
    sequenceGoToNext,
    setSequenceRate,
    previewSequenceItemByCutId,
    getSequenceLiveAbsoluteTime,
    showMiniToast,
    videoRef,
    getSequenceAbsoluteTime: sequenceSelectors.getAbsoluteTime,
    previewAudioPlan,
    globalMuted,
    globalVolume,
  });

  const {
    goToNext,
    goToPrev,
    handlePlayPause,
    cycleSpeed,
    toggleLooping,
    pauseBeforeExport,
  } = usePreviewPlaybackControls({
    isSingleMode,
    usesSequenceController,
    itemsLength: items.length,
    sequenceState,
    getSequenceAbsoluteTime: sequenceSelectors.getAbsoluteTime,
    sequenceGoToNext,
    sequenceGoToPrev,
    sequenceToggle,
    sequencePause,
    setSequenceLooping,
    seekSequenceAbsolute,
    setSequenceRate,
    setSequenceBuffering,
    checkBufferStatus,
    playbackSpeed,
    setPlaybackSpeed,
    setSingleModeIsPlaying,
    setSingleModeIsLooping,
  });

  const getUiPlayheadTime = useCallback(() => {
    if (isSingleModeVideo) {
      return singleModeCurrentTime;
    }
    return sequenceSelectors.getAbsoluteTime();
  }, [isSingleModeVideo, singleModeCurrentTime, sequenceSelectors]);

  // IN/OUT point handlers
  const handleSetInPoint = useCallback(() => {
    if (isSingleModeVideo) {
      handleSingleModeSetInPoint();
      return;
    }
    if (items.length === 0) return;
    const nextInPoint = clampToDuration(getUiPlayheadTime(), sequenceState.totalDuration);
    const nextOutPoint = outPoint !== null && nextInPoint >= outPoint ? null : outPoint;
    setSequenceRange(nextInPoint, nextOutPoint);
    notifyRangeChange(nextInPoint, nextOutPoint);
  }, [
    items.length,
    getUiPlayheadTime,
    isSingleModeVideo,
    outPoint,
    handleSingleModeSetInPoint,
    sequenceState.totalDuration,
    notifyRangeChange,
    setSequenceRange,
  ]);

  const handleSetOutPoint = useCallback(() => {
    if (isSingleModeVideo) {
      handleSingleModeSetOutPoint();
      return;
    }
    if (items.length === 0) return;
    const nextOutPoint = clampToDuration(getUiPlayheadTime(), sequenceState.totalDuration);
    const nextInPoint = inPoint !== null && nextOutPoint <= inPoint ? null : inPoint;
    setSequenceRange(nextInPoint, nextOutPoint);
    notifyRangeChange(nextInPoint, nextOutPoint);
  }, [
    items.length,
    getUiPlayheadTime,
    isSingleModeVideo,
    inPoint,
    handleSingleModeSetOutPoint,
    sequenceState.totalDuration,
    notifyRangeChange,
    setSequenceRange,
  ]);

  const interactionCommands = usePreviewInteractionCommands({
    isSingleModeVideo,
    focusedMarker,
    items,
    currentIndex,
    resolveAssetForCut,
    toggleSingleModePlay,
    handlePlayPause,
    skip,
    stepFocusedMarker,
    stepFrame,
    handleSingleModeSetInPoint,
    handleSingleModeSetOutPoint,
    handleSetInPoint,
    handleSetOutPoint,
    toggleLooping,
    toggleGlobalMute,
    handleMarkerFocus,
    handleMarkerDrag,
    handleMarkerDragEnd,
  });

  const {
    isDragging,
    hoverTime,
    handleProgressBarMouseDown,
    handleProgressBarHover,
    handleProgressBarLeave,
  } = usePreviewInputs({
    progressBarRef,
    itemsLength: items.length,
    totalDuration: sequenceState.totalDuration,
    sequencePause,
    seekSequenceAbsolute,
    seekSequencePercent,
    onClose,
    onPlayPause: interactionCommands.playPause,
    onSkipBack: interactionCommands.skipBack,
    onSkipForward: interactionCommands.skipForward,
    onStepBack: interactionCommands.stepBack,
    onStepForward: interactionCommands.stepForward,
    onSpeedDown: () => cycleSpeed('down'),
    onSpeedUp: () => cycleSpeed('up'),
    onToggleFullscreen: toggleFullscreen,
    onToggleLooping: interactionCommands.toggleLooping,
    onSetInPoint: interactionCommands.setInPoint,
    onSetOutPoint: interactionCommands.setOutPoint,
    onToggleMute: interactionCommands.toggleMute,
  });

  const { isExporting, handleExportFull, handleExportRange } = usePreviewExportActions({
    items,
    selectedResolution,
    metadataStore: metadataStore ?? null,
    getAsset,
    onExportSequence,
    pauseBeforeExport,
    inPoint,
    outPoint,
    resolveAssetForCut,
  });
  // Suppress unused variable warning - code kept for future use
  void handleExportRange;

  // ===== SHARED COMPUTED VALUES =====
  const {
    currentItem,
    sequenceTotalDuration,
    sequenceCurrentTime,
    singleModePlaybackDuration,
    singleModePlaybackTime,
    previewResolutionLabel,
    currentFraming,
    singleModeProgressPercent,
    previewDisplayClassName,
  } = usePreviewSharedViewState({
    isSingleMode,
    isSingleModeVideo,
    usesSequenceController,
    isDragging,
    items,
    currentIndex,
    sequenceCurrentIndex: sequenceState.currentIndex,
    sequenceTotalDuration: sequenceState.totalDuration,
    getSequenceGlobalProgress: sequenceSelectors.getGlobalProgress,
    getSequenceAbsoluteTime: sequenceSelectors.getAbsoluteTime,
    getSequenceLiveAbsoluteTime,
    sequenceIsPlaying: sequenceState.isPlaying,
    singleModeDuration,
    singleModeCurrentTime,
    asset,
    focusCut: focusCutData?.cut ?? null,
    previewSequenceItemByCutId,
    resolveAssetForCut,
    selectedResolution,
    globalVolume,
    shouldMuteEmbeddedAudio,
    videoRef,
    progressFillRef,
    progressHandleRef,
  });

  // _hasRange kept for future range export UI implementation
  const _hasRange = inPoint !== null && outPoint !== null;
  // Suppress unused variable warnings - code kept for future use
  void _hasRange;

  // Single Mode: show Save button only when both IN/OUT are set
  const hasSingleModeRange = isSingleModeVideo && inPoint !== null && outPoint !== null;
  const showSingleModeClipButton = isSingleModeVideo && hasSingleModeRange && !!(onClipSave || onClipClear);

  // ===== SINGLE MODE RENDER =====
  if (isSingleMode) {
    return (
      <PreviewModalSingleView
        modalRef={modalRef}
        displayContainerRef={displayContainerRef}
        progressBarRef={progressBarRef}
        videoRef={videoRef}
        onClose={onClose}
        onContainerMouseDown={handleContainerMouseDown}
        previewDisplayClassName={previewDisplayClassName}
        showOverlayNow={showOverlayNow}
        scheduleHideOverlay={scheduleHideOverlay}
        asset={asset}
        isAssetOnlyPreview={isAssetOnlyPreview}
        isLoading={isLoading}
        isSingleModeVideo={isSingleModeVideo}
        isSingleModeImage={isSingleModeImage}
        videoObjectUrl={videoObjectUrl}
        sequenceMediaElement={sequenceMediaElement}
        singleModeImageData={singleModeImageData}
        getViewportStyle={getViewportStyle}
        currentFraming={currentFraming}
        selectedResolution={selectedResolution}
        onResolutionSelect={(preset) => {
          setSelectedResolution(preset);
          onResolutionChange?.(preset);
        }}
        previewResolutionLabel={previewResolutionLabel}
        showOverlay={showOverlay}
        inPoint={inPoint}
        outPoint={outPoint}
        singleModePlaybackDuration={singleModePlaybackDuration}
        singleModeProgressPercent={singleModeProgressPercent}
        singleModePlaybackTime={singleModePlaybackTime}
        focusedMarker={focusedMarker}
        onMarkerFocus={interactionCommands.markerFocus}
        onMarkerDrag={interactionCommands.markerDrag}
        onMarkerDragEnd={interactionCommands.markerDragEnd}
        handleSingleModeProgressClick={handleSingleModeProgressClick}
        isPlaying={isPlaying}
        skipBack={interactionCommands.skipBack}
        skipForward={interactionCommands.skipForward}
        togglePlay={interactionCommands.playPause}
        handleSetInPoint={interactionCommands.setInPoint}
        handleSetOutPoint={interactionCommands.setOutPoint}
        showSingleModeClipButton={showSingleModeClipButton}
        isSingleModeClipEnabled={isSingleModeClipEnabled}
        onClipPrimaryAction={isSingleModeClipEnabled ? handleSingleModeClearClip : handleSingleModeSave}
        isSingleModeClipPending={isSingleModeClipPending}
        onFrameCapture={onFrameCapture ? handleSingleModeCaptureFrame : undefined}
        isLooping={isLooping}
        toggleLooping={interactionCommands.toggleLooping}
        globalVolume={globalVolume}
        globalMuted={globalMuted}
        setGlobalVolume={setGlobalVolume}
        toggleGlobalMute={interactionCommands.toggleMute}
        playbackSpeed={playbackSpeed}
        cycleSpeedUp={() => cycleSpeed('up')}
        isFullscreen={isFullscreen}
        toggleFullscreen={toggleFullscreen}
        miniToastElement={miniToastElement}
        handleSingleModeTimeUpdate={handleSingleModeTimeUpdate}
        handleSingleModeLoadedMetadata={handleSingleModeLoadedMetadata}
        onSingleModeVideoPlay={() => setSingleModeIsPlaying(true)}
        onSingleModeVideoPause={() => setSingleModeIsPlaying(false)}
        handleSingleModeVideoEnded={handleSingleModeVideoEnded}
      />
    );
  }

  return (
    <PreviewModalSequenceView
      modalRef={modalRef}
      displayContainerRef={displayContainerRef}
      progressBarRef={progressBarRef}
      progressFillRef={progressFillRef}
      progressHandleRef={progressHandleRef}
      onClose={onClose}
      onContainerMouseDown={handleContainerMouseDown}
      showOverlayNow={showOverlayNow}
      scheduleHideOverlay={scheduleHideOverlay}
      previewDisplayClassName={previewDisplayClassName}
      items={items}
      missingFocusedCut={missingFocusedCut}
      currentIndex={currentIndex}
      currentItem={currentItem}
      sequenceMediaElement={sequenceMediaElement}
      resolveAssetForCut={resolveAssetForCut}
      getViewportStyle={getViewportStyle}
      currentFraming={currentFraming}
      selectedResolution={selectedResolution}
      onResolutionSelect={(preset) => {
        setSelectedResolution(preset);
        onResolutionChange?.(preset);
      }}
      previewResolutionLabel={previewResolutionLabel}
      onExportFull={() => {
        void handleExportFull();
      }}
      isExporting={isExporting}
      isBuffering={isBuffering}
      showOverlay={showOverlay}
      inPoint={inPoint}
      outPoint={outPoint}
      sequenceTotalDuration={sequenceTotalDuration}
      focusedMarker={focusedMarker}
      onMarkerFocus={interactionCommands.markerFocus}
      onMarkerDrag={interactionCommands.markerDrag}
      onMarkerDragEnd={interactionCommands.markerDragEnd}
      onProgressBarMouseDown={handleProgressBarMouseDown}
      onProgressBarHover={handleProgressBarHover}
      onProgressBarLeave={handleProgressBarLeave}
      hoverTime={hoverTime}
      sequenceCurrentTime={sequenceCurrentTime}
      goToPrev={goToPrev}
      handlePlayPause={interactionCommands.playPause}
      isPlaying={isPlaying}
      goToNext={goToNext}
      handleSetInPoint={interactionCommands.setInPoint}
      handleSetOutPoint={interactionCommands.setOutPoint}
      isLooping={isLooping}
      toggleLooping={interactionCommands.toggleLooping}
      globalVolume={globalVolume}
      globalMuted={globalMuted}
      setGlobalVolume={setGlobalVolume}
      toggleGlobalMute={interactionCommands.toggleMute}
      isFullscreen={isFullscreen}
      toggleFullscreen={toggleFullscreen}
      miniToastElement={miniToastElement}
    />
  );
}
