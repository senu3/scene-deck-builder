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
  selectGetCutRuntime,
  selectSetCutRuntimeHold,
  selectClearCutRuntimeHold,
} from '../store/selectors';
import type { Cut } from '../types';
import { useSequencePlaybackController } from '../utils/previewPlaybackController';
import { getScenesInOrder } from '../utils/sceneOrder';
import { cyclePlaybackSpeed } from '../utils/timeUtils';
import { useMiniToast } from '../ui';
import type { PreviewModalProps, ResolutionPreset } from './preview-modal/types';
import {
  FRAME_DURATION,
  INITIAL_PRELOAD_ITEMS,
  PLAY_SAFE_AHEAD,
  PRELOAD_AHEAD,
  RESOLUTION_PRESETS,
} from './preview-modal/constants';
import {
  revokeIfBlob,
} from './preview-modal/helpers';
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
import { usePreviewItemsState } from './preview-modal/usePreviewItemsState';
import './PreviewModal.css';
import './preview-modal/styles/playback-controls.css';

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
  const getCutRuntime = useStore(selectGetCutRuntime);
  const setCutRuntimeHold = useStore(selectSetCutRuntimeHold);
  const clearCutRuntimeHold = useStore(selectClearCutRuntimeHold);

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

  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [videoObjectUrl, setVideoObjectUrl] = useState<{ assetId: string; url: string } | null>(null);
  const [singleModeIsLooping, setSingleModeIsLooping] = useState(false);
  const [selectedResolution, setSelectedResolution] = useState<ResolutionPreset>(
    exportResolution ? { ...exportResolution } : RESOLUTION_PRESETS[0]
  );
  const { show: showMiniToast, element: miniToastElement } = useMiniToast();
  const [singleModeDuration, setSingleModeDuration] = useState(0);
  const [singleModeCurrentTime, setSingleModeCurrentTime] = useState(0);
  const [showHoldEditor, setShowHoldEditor] = useState(false);
  const [holdDurationInput, setHoldDurationInput] = useState('1.0');

  const { isLoading, singleModeImageData } = usePreviewSingleMediaAsset({
    isSingleMode,
    asset,
    videoObjectUrl,
    setVideoObjectUrl,
    revokeIfBlob,
  });

  const {
    items,
    resolveAssetForCut,
  } = usePreviewItemsState({
    isSingleMode,
    isSingleModeVideo,
    isSingleModeImage,
    asset,
    singleModeImageData: null,
    orderedScenes,
    previewMode,
    selectedSceneId,
    getAsset,
    metadataStore: metadataStore ?? null,
    focusCutData,
    missingFocusedCut,
    sequenceCuts,
    sequenceContext,
  });
  const {
    previewSequenceItems,
    previewSequenceItemByCutId,
    previewSequenceItemByIndex,
    previewAudioPlan,
  } = usePreviewSequenceDerived({
    items,
    metadataStore: metadataStore ?? null,
    getAsset,
    getCutRuntime,
  });
  const sequenceItems = usesSequenceController ? previewSequenceItems : items;
  const sequenceDurations = useMemo(
    () => sequenceItems.map((item) => item.normalizedDisplayTime),
    [sequenceItems]
  );
  const sequencePlayback = useSequencePlaybackController(sequenceDurations);
  const {
    state: sequenceState,
    setSource: setSequenceSource,
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
    setMarkerTime,
    stepFocusedMarker,
    handleMarkerFocus,
    handleContainerMouseDown,
  } = useClipRangeState({
    usesSequenceController,
    sequenceInPoint: sequenceState.inPoint,
    sequenceOutPoint: sequenceState.outPoint,
    sequenceTotalDuration: sequenceState.totalDuration,
    singleModeDuration,
    initialInPoint,
    initialOutPoint,
    onRangeChange,
    setSequenceRange,
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
    focusCutId: focusCutData?.cut?.id,
    focusCutIsClip: !!focusCutData?.cut?.isClip,
    focusCutInPoint: focusCutData?.cut?.inPoint,
    focusCutOutPoint: focusCutData?.cut?.outPoint,
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
    setMarkerTime,
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
    getCurrentClipRevision: () => {
      const cutId = focusCutData?.cut?.id;
      if (!cutId) return 0;
      return getCutRuntime(cutId)?.clipRevision ?? 0;
    },
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

  const shouldMuteEmbeddedAudio = useCallback((cut: Cut | null | undefined): boolean => {
    return resolveAudioBindingForCut(cut).muteEmbedded;
  }, [resolveAudioBindingForCut]);

  // ===== SINGLE MODE LOGIC =====

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

  useEffect(() => {
    if (!isSingleModeImage || sequenceItems.length === 0) return;
    if (initialInPoint === undefined && initialOutPoint === undefined) return;

    setSequenceRange(initialInPoint ?? null, initialOutPoint ?? null);
    if (typeof initialInPoint === 'number') {
      seekSequenceAbsolute(initialInPoint);
    }
  }, [
    isSingleModeImage,
    sequenceItems.length,
    initialInPoint,
    initialOutPoint,
    setSequenceRange,
    seekSequenceAbsolute,
  ]);

  // ===== SEQUENCE MODE SESSION =====
  const { checkBufferStatus, sequenceMediaElement } = usePreviewSequenceSession({
    isSingleMode,
    usesSequenceController,
    items: sequenceItems,
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
    setSequenceSource,
    sequenceTick,
    sequenceGoToNext,
    previewSequenceItemByIndex,
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
    toggleLooping,
    pauseBeforeExport,
  } = usePreviewPlaybackControls({
    isSingleMode,
    usesSequenceController,
    itemsLength: sequenceItems.length,
    sequenceState,
    getSequenceAbsoluteTime: sequenceSelectors.getAbsoluteTime,
    sequenceGoToNext,
    sequenceGoToPrev,
    sequenceToggle,
    sequencePause,
    setSequenceLooping,
    seekSequenceAbsolute,
    setSequenceBuffering,
    checkBufferStatus,
    setSingleModeIsPlaying,
    setSingleModeIsLooping,
  });

  const cycleSingleModeSpeed = useCallback(() => {
    setPlaybackSpeed(current => cyclePlaybackSpeed(current, 'up'));
  }, []);

  const interactionCommands = usePreviewInteractionCommands({
    isSingleModeVideo,
    isPlaying,
    focusedMarker,
    items: sequenceItems,
    currentIndex,
    inPoint,
    outPoint,
    singleModeDuration,
    singleModeCurrentTime,
    sequenceTotalDuration: sequenceState.totalDuration,
    videoRef,
    resolveAssetForCut,
    setSingleModeCurrentTime,
    setSingleModeIsPlaying,
    getSequenceAbsoluteTime: sequenceSelectors.getAbsoluteTime,
    seekSequenceAbsolute,
    seekSequencePercent,
    sequencePause,
    skipSequence,
    setSequenceRange,
    notifyRangeChange,
    toggleSingleModePlay,
    handlePlayPause,
    stepFocusedMarker,
    handleSingleModeSetInPoint,
    handleSingleModeSetOutPoint,
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
    itemsLength: sequenceItems.length,
    totalDuration: sequenceState.totalDuration,
    onPauseBeforeSeek: sequencePause,
    onSeekAbsolute: interactionCommands.seekToAbsolute,
    onSeekPercent: interactionCommands.seekToPercent,
    onClose,
    onPlayPause: interactionCommands.playPause,
    onSkipBack: interactionCommands.skipBack,
    onSkipForward: interactionCommands.skipForward,
    onStepBack: interactionCommands.stepBack,
    onStepForward: interactionCommands.stepForward,
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
    getCutRuntime,
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
    items: sequenceItems,
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
  const currentFocusHold = focusCutData?.cut?.id ? getCutRuntime(focusCutData.cut.id)?.hold : undefined;
  const isHoldEnabled = !!(currentFocusHold?.enabled && currentFocusHold.durationMs > 0);
  const openHoldEditor = useCallback(() => {
    const currentSec = currentFocusHold?.durationMs ? currentFocusHold.durationMs / 1000 : 1;
    setHoldDurationInput(currentSec.toFixed(2));
    setShowHoldEditor(true);
  }, [currentFocusHold?.durationMs]);
  const handleSingleModeHoldToggle = useCallback(() => {
    const cutId = focusCutData?.cut?.id;
    if (!cutId) return;
    if (isHoldEnabled) {
      clearCutRuntimeHold(cutId);
      setShowHoldEditor(false);
      showMiniToast('VIDEO Hold disabled', 'info');
      return;
    }
    openHoldEditor();
  }, [
    focusCutData?.cut?.id,
    isHoldEnabled,
    clearCutRuntimeHold,
    showMiniToast,
    openHoldEditor,
  ]);
  const handleSingleModeHoldApply = useCallback(() => {
    const cutId = focusCutData?.cut?.id;
    if (!cutId) return;
    const seconds = Number(holdDurationInput.trim());
    if (!Number.isFinite(seconds) || seconds <= 0) {
      showMiniToast('Hold duration must be a positive number', 'warning');
      return;
    }
    setCutRuntimeHold(cutId, {
      enabled: true,
      mode: 'tail',
      durationMs: Math.round(seconds * 1000),
      muteAudio: true,
      composeWithClip: true,
    });
    setShowHoldEditor(false);
    showMiniToast(`VIDEO Hold enabled (${seconds.toFixed(2)}s)`, 'success');
  }, [
    focusCutData?.cut?.id,
    holdDurationInput,
    setCutRuntimeHold,
    showMiniToast,
  ]);

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
        showHoldButton={isSingleModeVideo && !!focusCutData?.cut?.id}
        isHoldEnabled={isHoldEnabled}
        onHoldToggle={handleSingleModeHoldToggle}
        showHoldEditor={showHoldEditor}
        holdDurationInput={holdDurationInput}
        onHoldDurationInputChange={setHoldDurationInput}
        onHoldApply={handleSingleModeHoldApply}
        onHoldCancel={() => setShowHoldEditor(false)}
        isLooping={isLooping}
        toggleLooping={interactionCommands.toggleLooping}
        globalVolume={globalVolume}
        globalMuted={globalMuted}
        setGlobalVolume={setGlobalVolume}
        toggleGlobalMute={interactionCommands.toggleMute}
        playbackSpeed={playbackSpeed}
        cycleSpeedUp={cycleSingleModeSpeed}
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
      items={sequenceItems}
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
