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
import { createVideoObjectUrl } from '../utils/videoUtils';
import { formatTime, cyclePlaybackSpeed } from '../utils/timeUtils';
import { resolveCutAsset, resolveCutThumbnail } from '../utils/assetResolve';
import { useSequencePlaybackController } from '../utils/previewPlaybackController';
import { getAssetThumbnail } from '../features/thumbnails/api';
import { buildSequenceItemsForCuts } from '../utils/exportSequence';
import { DEFAULT_EXPORT_RESOLUTION } from '../constants/export';
import { EXPORT_FRAMING_DEFAULTS } from '../constants/framing';
import { buildPreviewViewportFramingStyle, buildPreviewViewportFramingStyleFromResolved } from '../utils/previewFraming';
import { buildExportAudioPlan, canonicalizeCutsForExportAudioPlan } from '../utils/exportAudioPlan';
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
  constrainMarkerTime,
  revokeIfBlob,
} from './preview-modal/helpers';
import { buildPreviewItems } from './preview-modal/previewItemsBuilder';
import { PreviewModalSequenceView } from './preview-modal/PreviewModalSequenceView';
import { PreviewModalSingleView } from './preview-modal/PreviewModalSingleView';
import { useClipRangeState } from './preview-modal/useClipRangeState';
import { usePreviewOverlayVisibility } from './preview-modal/usePreviewOverlayVisibility';
import { usePreviewViewport } from './preview-modal/usePreviewViewport';
import { usePreviewSequenceDerived } from './preview-modal/usePreviewSequenceDerived';
import { usePreviewFullscreen } from './preview-modal/usePreviewFullscreen';
import { useSequenceProgressInteractions } from './preview-modal/useSequenceProgressInteractions';
import { usePreviewKeyboardShortcuts } from './preview-modal/usePreviewKeyboardShortcuts';
import { usePreviewSequenceMediaSource } from './preview-modal/usePreviewSequenceMediaSource';
import { usePreviewSequenceAudio } from './preview-modal/usePreviewSequenceAudio';
import { usePreviewSequenceBuffering } from './preview-modal/usePreviewSequenceBuffering';
import { usePreviewSingleAttachedAudio } from './preview-modal/usePreviewSingleAttachedAudio';
import type { FocusedMarker } from './shared';
import './PreviewModal.css';
import './shared/playback-controls.css';

const CLIP_POINT_EPSILON = 0.0001;

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
  const [singleModeIsPlaying, setSingleModeIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [videoObjectUrl, setVideoObjectUrl] = useState<{ assetId: string; url: string } | null>(null);
  const [singleModeIsLooping, setSingleModeIsLooping] = useState(false);
  const [selectedResolution, setSelectedResolution] = useState<ResolutionPreset>(
    exportResolution ? { ...exportResolution } : RESOLUTION_PRESETS[0]
  );
  const [isExporting, setIsExporting] = useState(false);
  // Overlay is view-only helper UI; it must not persist state or affect export decisions.
  const { showOverlay, showOverlayNow, scheduleHideOverlay } = usePreviewOverlayVisibility({ hideDelayMs: 300 });
  const { show: showMiniToast, element: miniToastElement } = useMiniToast();

  // Single Mode specific state
  const [isLoading, setIsLoading] = useState(isSingleMode);
  const [singleModeDuration, setSingleModeDuration] = useState(0);
  const [singleModeCurrentTime, setSingleModeCurrentTime] = useState(0);
  const [isSingleModeClipEnabled, setIsSingleModeClipEnabled] = useState(false);
  const [isSingleModeClipPending, setIsSingleModeClipPending] = useState(false);
  const lastCommittedClipPointsRef = useRef<{ start: number; end: number } | null>(null);
  const singleModeClipDragDirtyRef = useRef(false);
  const queuedClipCommitRef = useRef<{ inPoint: number | null; outPoint: number | null } | null>(null);
  const singleModeRangeRef = useRef<{ inPoint: number | null; outPoint: number | null }>({
    inPoint: initialInPoint ?? null,
    outPoint: initialOutPoint ?? null,
  });

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
  const isPlaying = usesSequenceController ? sequenceState.isPlaying : singleModeIsPlaying;
  const isLooping = usesSequenceController ? sequenceState.isLooping : singleModeIsLooping;
  const isBuffering = usesSequenceController ? sequenceState.isBuffering : false;

  const modalRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, toggleFullscreen } = usePreviewFullscreen(modalRef);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const progressHandleRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { displayContainerRef, getViewportStyle } = usePreviewViewport(selectedResolution);
  const {
    isDragging,
    hoverTime,
    handleProgressBarMouseDown,
    handleProgressBarHover,
    handleProgressBarLeave,
  } = useSequenceProgressInteractions({
    progressBarRef,
    itemsLength: items.length,
    totalDuration: sequenceState.totalDuration,
    sequencePause,
    seekSequenceAbsolute,
    seekSequencePercent,
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

  // ===== ATTACHED AUDIO HELPER =====

  const getPrimaryAudioBindingForCut = useCallback((cut: Cut | null | undefined) => {
    if (!cut?.audioBindings?.length) return undefined;
    const enabledBindings = cut.audioBindings.filter((binding) => binding.enabled !== false);
    if (enabledBindings.length === 0) return cut.audioBindings[0];

    const kindPriority: Record<'voice.lipsync' | 'voice.other' | 'se', number> = {
      'voice.lipsync': 0,
      'voice.other': 1,
      'se': 2,
    };

    return enabledBindings
      .slice()
      .sort((a, b) => kindPriority[a.kind] - kindPriority[b.kind])[0];
  }, []);

  const getAttachedAudioForCut = useCallback((cut: Cut | null | undefined): Asset | undefined => {
    const binding = getPrimaryAudioBindingForCut(cut);
    if (!binding?.audioAssetId) return undefined;
    return getAsset(binding.audioAssetId);
  }, [getPrimaryAudioBindingForCut, getAsset]);

  const resolveAssetForCut = useCallback((cut: Cut | null | undefined): Asset | null => {
    return resolveCutAsset(cut, getAsset);
  }, [getAsset]);

  const resolveThumbnailForCut = useCallback((cut: Cut | null | undefined): string | null => {
    return resolveCutThumbnail(cut, getAsset);
  }, [getAsset]);

  const getAudioOffsetForCut = useCallback((cut: Cut | null | undefined): number => {
    return getPrimaryAudioBindingForCut(cut)?.offsetSec ?? 0;
  }, [getPrimaryAudioBindingForCut]);

  const shouldMuteEmbeddedAudio = useCallback((cut: Cut | null | undefined): boolean => {
    const useEmbeddedAudio = cut?.useEmbeddedAudio ?? true;
    return globalMuted || !useEmbeddedAudio;
  }, [globalMuted]);

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

  // State for image data in Single Mode
  const [singleModeImageData, setSingleModeImageData] = useState<string | null>(null);

  // Load video URL or image data for Single Mode
  useEffect(() => {
    if (!isSingleMode || !asset?.path) return;

    let isMounted = true;

    const loadAsset = async () => {
      setIsLoading(true);

      if (asset.type === 'video') {
        const url = await createVideoObjectUrl(asset.path);
        if (isMounted && url) {
          setVideoObjectUrl({ assetId: asset.id, url });
        }
      } else if (asset.type === 'image') {
        if (asset.path) {
          try {
            const previewImage = await getAssetThumbnail('sequence-preview', {
              assetId: asset.id,
              path: asset.path,
              type: 'image',
            });
            if (isMounted && previewImage) {
              setSingleModeImageData(previewImage);
            }
          } catch {
            // Failed to load image
          }
        }
      }

      setIsLoading(false);
    };

    loadAsset();

    return () => {
      isMounted = false;
    };
  }, [isSingleMode, asset?.path, asset?.type, asset?.thumbnail]);

  // Cleanup Object URL on unmount (Single Mode)
  useEffect(() => {
    if (!isSingleMode) return;

    return () => {
      if (videoObjectUrl?.url) {
        revokeIfBlob(videoObjectUrl.url);
      }
    };
  }, [isSingleMode, videoObjectUrl]);

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

  const notifyRangeChange = useCallback((nextInPoint: number | null, nextOutPoint: number | null) => {
    onRangeChange?.({ inPoint: nextInPoint, outPoint: nextOutPoint });
  }, [onRangeChange]);

  const setSingleModeRange = useCallback((nextInPoint: number | null, nextOutPoint: number | null) => {
    singleModeRangeRef.current = { inPoint: nextInPoint, outPoint: nextOutPoint };
    setSingleModeInPoint(nextInPoint);
    setSingleModeOutPoint(nextOutPoint);
  }, []);

  const commitSingleModeClipPoints = useCallback(async (nextInPoint: number | null, nextOutPoint: number | null) => {
    if (!isSingleModeVideo || !isSingleModeClipEnabled || !onClipSave) return;
    if (nextInPoint === null || nextOutPoint === null) return;
    if (isSingleModeClipPending) {
      queuedClipCommitRef.current = { inPoint: nextInPoint, outPoint: nextOutPoint };
      return;
    }

    const start = Math.min(nextInPoint, nextOutPoint);
    const end = Math.max(nextInPoint, nextOutPoint);
    const committed = lastCommittedClipPointsRef.current;
    if (
      committed &&
      Math.abs(committed.start - start) < CLIP_POINT_EPSILON &&
      Math.abs(committed.end - end) < CLIP_POINT_EPSILON
    ) {
      return;
    }

    setIsSingleModeClipPending(true);
    try {
      await onClipSave(start, end);
      lastCommittedClipPointsRef.current = { start, end };
    } catch (error) {
      console.error('Failed to update clip points:', error);
      showMiniToast(error instanceof Error ? error.message : 'Failed to update clip points', 'error');
    } finally {
      setIsSingleModeClipPending(false);
    }
  }, [isSingleModeVideo, isSingleModeClipEnabled, onClipSave, isSingleModeClipPending, showMiniToast]);

  useEffect(() => {
    if (!isSingleModeVideo || !isSingleModeClipEnabled) return;
    if (isSingleModeClipPending) return;
    const queued = queuedClipCommitRef.current;
    if (!queued) return;
    queuedClipCommitRef.current = null;
    void commitSingleModeClipPoints(queued.inPoint, queued.outPoint);
  }, [isSingleModeVideo, isSingleModeClipEnabled, isSingleModeClipPending, commitSingleModeClipPoints]);

  const setMarkerTimeAndSeek = useCallback((marker: 'in' | 'out', newTime: number) => {
    const duration = usesSequenceController
      ? sequenceState.totalDuration
      : singleModeDuration;
    const constrainedTime = constrainMarkerTime(marker, newTime, duration, inPoint, outPoint);

    if (marker === 'in') {
      if (!usesSequenceController) {
        const nextOutPoint = singleModeRangeRef.current.outPoint;
        setSingleModeRange(constrainedTime, nextOutPoint);
        notifyRangeChange(constrainedTime, nextOutPoint);
      } else {
        setSequenceRange(constrainedTime, outPoint ?? null);
        notifyRangeChange(constrainedTime, outPoint ?? null);
      }
    } else {
      if (!usesSequenceController) {
        const nextInPoint = singleModeRangeRef.current.inPoint;
        setSingleModeRange(nextInPoint, constrainedTime);
        notifyRangeChange(nextInPoint, constrainedTime);
      } else {
        setSequenceRange(inPoint ?? null, constrainedTime);
        notifyRangeChange(inPoint ?? null, constrainedTime);
      }
    }

    if (!usesSequenceController && videoRef.current) {
      videoRef.current.currentTime = constrainedTime;
      setSingleModeCurrentTime(constrainedTime);
    } else if (usesSequenceController && items.length > 0) {
      seekSequenceAbsolute(constrainedTime);
    }
  }, [
    usesSequenceController,
    sequenceState.totalDuration,
    singleModeDuration,
    items.length,
    inPoint,
    outPoint,
    notifyRangeChange,
    setSingleModeRange,
    setSequenceRange,
    seekSequenceAbsolute,
  ]);

  // Step focused marker by one frame
  const stepFocusedMarker = useCallback((direction: number) => {
    if (!focusedMarker) return;
    const currentMarkerTime = focusedMarker === 'in' ? inPoint : outPoint;
    if (currentMarkerTime === null) return;
    setMarkerTimeAndSeek(focusedMarker, currentMarkerTime + (direction * FRAME_DURATION));
  }, [focusedMarker, inPoint, outPoint, setMarkerTimeAndSeek]);

  // Handle marker focus
  const handleMarkerFocus = useCallback((marker: FocusedMarker) => {
    setFocusedMarker(marker);
  }, []);

  // Handle marker drag (both modes)
  const handleMarkerDrag = useCallback((marker: 'in' | 'out', newTime: number) => {
    if (isSingleModeVideo && isSingleModeClipEnabled) {
      singleModeClipDragDirtyRef.current = true;
    }
    setMarkerTimeAndSeek(marker, newTime);
  }, [setMarkerTimeAndSeek, isSingleModeVideo, isSingleModeClipEnabled]);

  // Handle marker drag end
  const handleMarkerDragEnd = useCallback(async () => {
    if (isSingleModeVideo && isSingleModeClipEnabled && singleModeClipDragDirtyRef.current) {
      singleModeClipDragDirtyRef.current = false;
      const { inPoint: latestInPoint, outPoint: latestOutPoint } = singleModeRangeRef.current;
      await commitSingleModeClipPoints(latestInPoint, latestOutPoint);
    }
    setFocusedMarker(null);
  }, [isSingleModeVideo, isSingleModeClipEnabled, commitSingleModeClipPoints]);

  // Clear focused marker when clicking outside progress bar
  const handleContainerMouseDown = useCallback((e: React.MouseEvent) => {
    if (!focusedMarker) return;

    // Check if click was inside the progress bar
    const target = e.target as HTMLElement;
    const progressBar = target.closest('.preview-progress-bar');

    // If clicked outside progress bar, clear focus
    if (!progressBar) {
      setFocusedMarker(null);
    }
  }, [focusedMarker]);
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

  // Single Mode video event handlers
  const handleSingleModeTimeUpdate = useCallback(() => {
    if (!videoRef.current || !isSingleModeVideo) return;

    setSingleModeCurrentTime(videoRef.current.currentTime);

    // If both IN and OUT points are set, constrain playback
    if (singleModeIsPlaying && inPoint !== null && outPoint !== null) {
      const clipStart = Math.min(inPoint, outPoint);
      const clipEnd = Math.max(inPoint, outPoint);
      if (videoRef.current.currentTime >= clipEnd) {
        if (isLooping) {
          videoRef.current.currentTime = clipStart;
        } else {
          videoRef.current.pause();
          setSingleModeIsPlaying(false);
          videoRef.current.currentTime = clipEnd;
          setSingleModeCurrentTime(clipEnd);
        }
      }
    }
  }, [isSingleModeVideo, inPoint, outPoint, isLooping, singleModeIsPlaying]);

  const handleSingleModeLoadedMetadata = useCallback(() => {
    if (!videoRef.current || !isSingleModeVideo) return;

    setSingleModeDuration(videoRef.current.duration);

    if (initialInPoint !== undefined) {
      videoRef.current.currentTime = initialInPoint;
      setSingleModeCurrentTime(initialInPoint);
    }
  }, [isSingleModeVideo, initialInPoint]);

  const handleSingleModeVideoEnded = useCallback(() => {
    if (!isSingleModeVideo) return;

    if (isLooping && videoRef.current) {
      // If IN/OUT are set, loop from IN point
      const loopStart = inPoint !== null ? Math.min(inPoint, outPoint ?? inPoint) : 0;
      videoRef.current.currentTime = loopStart;
      videoRef.current.play();
    } else {
      setSingleModeIsPlaying(false);
    }
  }, [isSingleModeVideo, isLooping, inPoint, outPoint]);

  // Single Mode progress bar click
  const handleSingleModeProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || !isSingleMode) return;

    const rect = progressBarRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;

    if (!usesSequenceController) {
      if (!videoRef.current) return;
      const newTime = clampToDuration(percent * singleModeDuration, singleModeDuration);
      // Always update playback position
      videoRef.current.currentTime = newTime;
      setSingleModeCurrentTime(newTime);
      return;
    }

    const duration = sequenceState.totalDuration;
    if (duration <= 0) return;
    seekSequenceAbsolute(clampToDuration(percent * duration, duration));
  }, [
    isSingleMode,
    usesSequenceController,
    singleModeDuration,
    sequenceState.totalDuration,
    seekSequenceAbsolute,
  ]);

  // Single Mode IN/OUT handlers
  const handleSingleModeSetInPoint = useCallback(() => {
    if (!isSingleModeVideo) return;
    const candidateInPoint = clampToDuration(singleModeCurrentTime, singleModeDuration);
    const nextInPoint = isSingleModeClipEnabled && outPoint !== null
      ? Math.min(candidateInPoint, outPoint)
      : candidateInPoint;
    const nextOutPoint = isSingleModeClipEnabled
      ? outPoint
      : (outPoint !== null && nextInPoint >= outPoint ? null : outPoint);
    setSingleModeRange(nextInPoint, nextOutPoint);
    if (focusedMarker === 'out' && nextOutPoint === null) {
      setFocusedMarker(null);
    }
    notifyRangeChange(nextInPoint, nextOutPoint);
    if (isSingleModeClipEnabled) {
      void commitSingleModeClipPoints(nextInPoint, nextOutPoint);
    }
  }, [
    isSingleModeVideo,
    singleModeCurrentTime,
    singleModeDuration,
    outPoint,
    focusedMarker,
    notifyRangeChange,
    isSingleModeClipEnabled,
    commitSingleModeClipPoints,
    setSingleModeRange,
  ]);

  const handleSingleModeSetOutPoint = useCallback(() => {
    if (!isSingleModeVideo) return;
    const candidateOutPoint = clampToDuration(singleModeCurrentTime, singleModeDuration);
    const nextOutPoint = isSingleModeClipEnabled && inPoint !== null
      ? Math.max(candidateOutPoint, inPoint)
      : candidateOutPoint;
    const nextInPoint = isSingleModeClipEnabled
      ? inPoint
      : (inPoint !== null && nextOutPoint <= inPoint ? null : inPoint);
    setSingleModeRange(nextInPoint, nextOutPoint);
    if (focusedMarker === 'in' && nextInPoint === null) {
      setFocusedMarker(null);
    }
    notifyRangeChange(nextInPoint, nextOutPoint);
    if (isSingleModeClipEnabled) {
      void commitSingleModeClipPoints(nextInPoint, nextOutPoint);
    }
  }, [
    isSingleModeVideo,
    singleModeCurrentTime,
    singleModeDuration,
    inPoint,
    focusedMarker,
    notifyRangeChange,
    isSingleModeClipEnabled,
    commitSingleModeClipPoints,
    setSingleModeRange,
  ]);

  const handleSingleModeClearClip = useCallback(async () => {
    if (!isSingleModeVideo) return;
    setIsSingleModeClipPending(true);
    try {
      await onClipClear?.();
      setSingleModeRange(null, null);
      setFocusedMarker(null);
      setIsSingleModeClipEnabled(false);
      lastCommittedClipPointsRef.current = null;
      queuedClipCommitRef.current = null;
      notifyRangeChange(null, null);
      showMiniToast('VIDEOCLIP cleared', 'success');
    } catch (error) {
      console.error('Failed to clear clip:', error);
      showMiniToast(error instanceof Error ? error.message : 'Failed to clear clip', 'error');
    } finally {
      setIsSingleModeClipPending(false);
    }
  }, [isSingleModeVideo, notifyRangeChange, onClipClear, setSingleModeRange, showMiniToast]);

  // Single Mode Save handler: save clip when both IN and OUT are set
  const handleSingleModeSave = useCallback(async () => {
    if (!isSingleModeVideo) return;
    if (inPoint === null || outPoint === null) return;

    const start = Math.min(inPoint, outPoint);
    const end = Math.max(inPoint, outPoint);
    setIsSingleModeClipPending(true);
    try {
      await onClipSave?.(start, end);
      setIsSingleModeClipEnabled(true);
      lastCommittedClipPointsRef.current = { start, end };
      showMiniToast('VIDEOCLIP set', 'success');
    } catch (error) {
      console.error('Failed to save clip:', error);
      showMiniToast(error instanceof Error ? error.message : 'Failed to save clip', 'error');
    } finally {
      setIsSingleModeClipPending(false);
    }
  }, [isSingleModeVideo, inPoint, outPoint, onClipSave, showMiniToast]);

  const handleSingleModeCaptureFrame = useCallback(async () => {
    if (!isSingleModeVideo || !onFrameCapture) return;
    const timestamp = videoRef.current?.currentTime ?? singleModeCurrentTime;
    try {
      const message = await onFrameCapture(timestamp);
      if (message) {
        showMiniToast(message, 'success');
      }
    } catch (error) {
      console.error('Frame capture failed:', error);
      const message = error instanceof Error ? error.message : 'Capture failed';
      showMiniToast(message, 'error');
    }
  }, [isSingleModeVideo, onFrameCapture, singleModeCurrentTime]);

  // Single Mode play/pause
  const toggleSingleModePlay = useCallback(() => {
    if (!videoRef.current || !isSingleModeVideo) return;

    if (singleModeIsPlaying) {
      videoRef.current.pause();
    } else {
      if (inPoint !== null && outPoint !== null) {
        const clipStart = Math.min(inPoint, outPoint);
        const clipEnd = Math.max(inPoint, outPoint);
        if (videoRef.current.currentTime < clipStart || videoRef.current.currentTime >= clipEnd) {
          videoRef.current.currentTime = clipStart;
          setSingleModeCurrentTime(clipStart);
        }
      }
      videoRef.current.play();
    }
    setSingleModeIsPlaying(prev => !prev);
  }, [isSingleModeVideo, singleModeIsPlaying, inPoint, outPoint]);

  // Apply playback speed (Single Mode)
  useEffect(() => {
    if (isSingleModeVideo && videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [isSingleModeVideo, playbackSpeed]);

  useEffect(() => {
    if (!isSingleModeVideo) return;
    setIsSingleModeClipEnabled(!!focusCutData?.cut?.isClip);
    const sourceInPoint = focusCutData?.cut?.inPoint;
    const sourceOutPoint = focusCutData?.cut?.outPoint;
    if (
      focusCutData?.cut?.isClip &&
      typeof sourceInPoint === 'number' &&
      typeof sourceOutPoint === 'number'
    ) {
      lastCommittedClipPointsRef.current = {
        start: Math.min(sourceInPoint, sourceOutPoint),
        end: Math.max(sourceInPoint, sourceOutPoint),
      };
      singleModeRangeRef.current = {
        inPoint: sourceInPoint,
        outPoint: sourceOutPoint,
      };
      return;
    }
    lastCommittedClipPointsRef.current = null;
    singleModeRangeRef.current = {
      inPoint: singleModeInPoint,
      outPoint: singleModeOutPoint,
    };
  }, [isSingleModeVideo, focusCutData?.cut?.id, focusCutData?.cut?.isClip, focusCutData?.cut?.inPoint, focusCutData?.cut?.outPoint]);

  usePreviewSingleAttachedAudio({
    isSingleMode,
    isSingleModeVideo,
    hasCutContext,
    assetId: asset?.id,
    focusCut: focusCutData?.cut ?? null,
    focusScene: focusCutData?.scene ?? null,
    metadataStore: metadataStore ?? null,
    getAsset,
    getAttachedAudioForCut,
    getAudioOffsetForCut,
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

  const { checkBufferStatus } = usePreviewSequenceBuffering({
    isSingleMode,
    items,
    currentIndex,
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
  });

  // ===== SEQUENCE MODE ATTACHED AUDIO =====

  const {
    previewSequenceItemByCutId,
    previewAudioPlan,
  } = usePreviewSequenceDerived({
    items,
    metadataStore: metadataStore ?? null,
    getAsset,
  });
  const { sequenceMediaElement } = usePreviewSequenceMediaSource({
    usesSequenceController,
    items,
    currentIndex: sequenceState.currentIndex,
    videoObjectUrl,
    playbackSpeed,
    setSequenceSource,
    sequenceTick,
    sequenceGoToNext,
    setSequenceRate,
    previewSequenceItemByCutId,
    getSequenceLiveAbsoluteTime,
    showMiniToast,
    resolveAssetForCut,
    videoRef,
  });
  usePreviewSequenceAudio({
    isSingleMode,
    itemsLength: items.length,
    getAbsoluteTime: sequenceSelectors.getAbsoluteTime,
    isPlaying: sequenceState.isPlaying,
    isBuffering: sequenceState.isBuffering,
    previewAudioPlan,
    globalMuted,
    globalVolume,
  });

  const goToNext = useCallback(() => {
    if (isSingleMode) return;
    sequenceGoToNext();
  }, [isSingleMode, sequenceGoToNext]);

  const goToPrev = useCallback(() => {
    if (isSingleMode) return;
    sequenceGoToPrev();
  }, [isSingleMode, sequenceGoToPrev]);

  const handlePlayPause = useCallback(() => {
    if (!usesSequenceController || items.length === 0) return;

    if (!sequenceState.isPlaying) {
      const currentAbsTime = sequenceSelectors.getAbsoluteTime();
      if (sequenceState.inPoint !== null && sequenceState.outPoint !== null) {
        const effectiveOutPoint = Math.max(sequenceState.inPoint, sequenceState.outPoint);
        const effectiveInPoint = Math.min(sequenceState.inPoint, sequenceState.outPoint);
        if (currentAbsTime < effectiveInPoint - 0.001 || currentAbsTime >= effectiveOutPoint - 0.001) {
          seekSequenceAbsolute(effectiveInPoint);
        }
      } else if (sequenceState.currentIndex >= items.length - 1 && sequenceState.localProgress >= 99) {
        seekSequenceAbsolute(0);
      }
    }

    sequenceToggle();
  }, [usesSequenceController, items.length, sequenceState, sequenceSelectors, sequenceToggle, seekSequenceAbsolute]);

  useEffect(() => {
    if (!usesSequenceController) return;
    setSequenceRate(playbackSpeed);
  }, [usesSequenceController, playbackSpeed, setSequenceRate]);

  // Auto pause/resume based on buffer status (Sequence Mode)
  useEffect(() => {
    if (isSingleMode || items.length === 0) return;

    const { ready } = checkBufferStatus();

    if (sequenceState.isPlaying && !ready && !sequenceState.isBuffering) {
      setSequenceBuffering(true);
    } else if (sequenceState.isPlaying && ready && sequenceState.isBuffering) {
      setSequenceBuffering(false);
    }
  }, [isSingleMode, items, sequenceState.isPlaying, sequenceState.isBuffering, checkBufferStatus, setSequenceBuffering]);

  // Cycle playback speed
  const cycleSpeed = useCallback((direction: 'up' | 'down') => {
    setPlaybackSpeed(current => cyclePlaybackSpeed(current, direction));
  }, []);

  const toggleLooping = useCallback(() => {
    if (!usesSequenceController) {
      setSingleModeIsLooping(prev => !prev);
    } else {
      setSequenceLooping(!sequenceState.isLooping);
    }
  }, [usesSequenceController, sequenceState.isLooping, setSequenceLooping]);

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

  const handleShortcutPlayPause = useCallback(() => {
    if (isSingleModeVideo) {
      toggleSingleModePlay();
      return;
    }
    handlePlayPause();
  }, [isSingleModeVideo, toggleSingleModePlay, handlePlayPause]);

  const handleShortcutStepFrameOrMarker = useCallback((direction: -1 | 1) => {
    if (focusedMarker) {
      stepFocusedMarker(direction);
      return;
    }
    if (isSingleModeVideo) {
      stepFrame(direction);
      return;
    }
    // In Sequence Mode, frame step only works during video clip playback
    const currentItem = items[currentIndex];
    const currentAsset = currentItem ? resolveAssetForCut(currentItem.cut) : undefined;
    if (currentAsset?.type === 'video') {
      stepFrame(direction);
    }
  }, [focusedMarker, isSingleModeVideo, stepFocusedMarker, stepFrame, items, currentIndex, resolveAssetForCut]);

  const handleShortcutSetInPoint = useCallback(() => {
    if (isSingleModeVideo) {
      handleSingleModeSetInPoint();
      return;
    }
    handleSetInPoint();
  }, [isSingleModeVideo, handleSingleModeSetInPoint, handleSetInPoint]);

  const handleShortcutSetOutPoint = useCallback(() => {
    if (isSingleModeVideo) {
      handleSingleModeSetOutPoint();
      return;
    }
    handleSetOutPoint();
  }, [isSingleModeVideo, handleSingleModeSetOutPoint, handleSetOutPoint]);

  const pauseBeforeExport = useCallback(() => {
    if (!usesSequenceController) {
      setSingleModeIsPlaying(false);
      return;
    }
    sequencePause();
  }, [usesSequenceController, sequencePause]);

  usePreviewKeyboardShortcuts({
    onClose,
    onPlayPause: handleShortcutPlayPause,
    onSkipBack: () => skip(-5),
    onSkipForward: () => skip(5),
    onStepBack: () => handleShortcutStepFrameOrMarker(-1),
    onStepForward: () => handleShortcutStepFrameOrMarker(1),
    onSpeedDown: () => cycleSpeed('down'),
    onSpeedUp: () => cycleSpeed('up'),
    onToggleFullscreen: toggleFullscreen,
    onToggleLooping: toggleLooping,
    onSetInPoint: handleShortcutSetInPoint,
    onSetOutPoint: handleShortcutSetOutPoint,
    onToggleMute: toggleGlobalMute,
  });

  // Export full sequence (no range)
  const handleExportFull = useCallback(async () => {
    if (items.length === 0) return;

    setIsExporting(true);
    pauseBeforeExport();

    try {
      const exportWidth = selectedResolution.width > 0 ? selectedResolution.width : DEFAULT_EXPORT_RESOLUTION.width;
      const exportHeight = selectedResolution.height > 0 ? selectedResolution.height : DEFAULT_EXPORT_RESOLUTION.height;
      const exportCuts = items.map((item) => ({
        ...item.cut,
        displayTime: item.normalizedDisplayTime,
      }));

      if (onExportSequence) {
        await onExportSequence(exportCuts, { width: exportWidth, height: exportHeight });
        return;
      }

      if (!window.electronAPI) {
        return;
      }

      const outputPath = await window.electronAPI.showSaveSequenceDialog('sequence_export.mp4');
      if (!outputPath) {
        return;
      }

      const sequenceItems = buildSequenceItemsForCuts(
        exportCuts,
        {
          debugFraming: true,
          framingDefaults: EXPORT_FRAMING_DEFAULTS,
          metadataByAssetId: metadataStore?.metadata,
          resolveAssetById: getAsset,
        }
      );
      const cutSceneMap = new Map<string, string>();
      for (const item of items) {
        cutSceneMap.set(item.cut.id, item.sceneId);
      }
      const audioPlan = buildExportAudioPlan({
        cuts: canonicalizeCutsForExportAudioPlan(exportCuts, getAsset).cuts,
        metadataStore: metadataStore ?? null,
        getAssetById: getAsset,
        resolveSceneIdByCutId: (cutId) => cutSceneMap.get(cutId),
      });

      const result = await window.electronAPI.exportSequence({
        items: sequenceItems,
        outputPath,
        width: exportWidth,
        height: exportHeight,
        fps: 30,
        audioPlan,
      });

      if (result.success) {
        alert(
          `Export complete!\nFile: ${result.outputPath}\nSize: ${(result.fileSize! / 1024 / 1024).toFixed(2)} MB` +
          `${result.audioOutputPath ? `\nAudio: ${result.audioOutputPath}` : ''}`
        );
      } else {
        alert(`Export failed: ${result.error}`);
      }
    } catch (error) {
      alert(`Export error: ${String(error)}`);
    } finally {
      setIsExporting(false);
    }
  }, [items, selectedResolution, pauseBeforeExport, metadataStore, getAsset, onExportSequence]);

  // Export with IN/OUT range (Save button) - kept for future UI implementation
  const _handleExportRange = useCallback(async () => {
    if (!window.electronAPI || items.length === 0) return;
    if (inPoint === null || outPoint === null) return;

    setIsExporting(true);
    pauseBeforeExport();

    try {
      const exportWidth = selectedResolution.width > 0 ? selectedResolution.width : DEFAULT_EXPORT_RESOLUTION.width;
      const exportHeight = selectedResolution.height > 0 ? selectedResolution.height : DEFAULT_EXPORT_RESOLUTION.height;

      const outputPath = await window.electronAPI.showSaveSequenceDialog('sequence_export.mp4');
      if (!outputPath) {
        return;
      }

      const rangeStart = Math.min(inPoint, outPoint);
      const rangeEnd = Math.max(inPoint, outPoint);

      const rangeCuts: Cut[] = [];

      let accumulatedTime = 0;
      for (const item of items) {
        const asset = resolveAssetForCut(item.cut);
        if (!asset?.path) continue;

        const itemStart = accumulatedTime;
        const itemEnd = accumulatedTime + item.normalizedDisplayTime;
        accumulatedTime = itemEnd;

        if (itemEnd <= rangeStart || itemStart >= rangeEnd) continue;

        const clipStart = Math.max(0, rangeStart - itemStart);
        const clipEnd = Math.min(item.normalizedDisplayTime, rangeEnd - itemStart);
        const clipDuration = clipEnd - clipStart;

        if (clipDuration <= 0) continue;

        if (asset.type === 'video') {
          const originalInPoint = item.cut.isClip && item.cut.inPoint !== undefined ? item.cut.inPoint : 0;
          const clippedCut: Cut = {
            ...item.cut,
            displayTime: clipDuration,
            isClip: true,
            inPoint: originalInPoint + clipStart,
            outPoint: originalInPoint + clipEnd,
          };
          rangeCuts.push(clippedCut);
        } else {
          rangeCuts.push({
            ...item.cut,
            displayTime: clipDuration,
            isClip: false,
            inPoint: undefined,
            outPoint: undefined,
          });
        }
      }

      const sequenceItems = buildSequenceItemsForCuts(
        rangeCuts,
        {
          debugFraming: true,
          framingDefaults: EXPORT_FRAMING_DEFAULTS,
          metadataByAssetId: metadataStore?.metadata,
          resolveAssetById: getAsset,
        }
      );

      if (sequenceItems.length === 0) {
        alert('No items in the selected range');
        return;
      }
      const cutSceneMap = new Map<string, string>();
      for (const item of items) {
        cutSceneMap.set(item.cut.id, item.sceneId);
      }
      const audioPlan = buildExportAudioPlan({
        cuts: canonicalizeCutsForExportAudioPlan(rangeCuts, getAsset).cuts,
        metadataStore: metadataStore ?? null,
        getAssetById: getAsset,
        resolveSceneIdByCutId: (cutId) => cutSceneMap.get(cutId),
      });

      const result = await window.electronAPI.exportSequence({
        items: sequenceItems,
        outputPath,
        width: exportWidth,
        height: exportHeight,
        fps: 30,
        audioPlan,
      });

      if (result.success) {
        alert(
          `Export complete! (${formatTime(rangeStart)} - ${formatTime(rangeEnd)})\nFile: ${result.outputPath}\nSize: ${(result.fileSize! / 1024 / 1024).toFixed(2)} MB` +
          `${result.audioOutputPath ? `\nAudio: ${result.audioOutputPath}` : ''}`
        );
      } else {
        alert(`Export failed: ${result.error}`);
      }
    } catch (error) {
      alert(`Export error: ${String(error)}`);
    } finally {
      setIsExporting(false);
    }
  }, [items, selectedResolution, inPoint, outPoint, pauseBeforeExport, resolveAssetForCut, metadataStore, getAsset]);
  // Suppress unused variable warning - code kept for future use
  void _handleExportRange;

  // Apply volume/mute to the active video element (embedded audio only)
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = globalVolume;
      const activeCut = isSingleMode
        ? (focusCutData?.cut ?? null)
        : (items[sequenceState.currentIndex]?.cut ?? null);
      videoRef.current.muted = isSingleMode ? shouldMuteEmbeddedAudio(activeCut) : true;
    }
  }, [
    globalVolume,
    isSingleMode,
    focusCutData?.cut,
    items,
    sequenceState.currentIndex,
    shouldMuteEmbeddedAudio,
  ]);

  // ===== SHARED COMPUTED VALUES =====
  const currentItem = items[currentIndex];
  const globalProgress = isSingleMode ? 0 : sequenceSelectors.getGlobalProgress();
  const sequenceTotalDuration = isSingleMode ? 0 : sequenceState.totalDuration;
  const sequenceCurrentTime = isSingleMode ? 0 : sequenceSelectors.getAbsoluteTime();
  const singleModePlaybackDuration = isSingleModeVideo ? singleModeDuration : sequenceState.totalDuration;
  const singleModePlaybackTime = isSingleModeVideo ? singleModeCurrentTime : sequenceSelectors.getAbsoluteTime();
  const previewResolutionLabel = useMemo(() => {
    const targetAsset = isSingleMode ? asset : resolveAssetForCut(currentItem?.cut);
    const width = targetAsset?.metadata?.width;
    const height = targetAsset?.metadata?.height;
    if (typeof width === 'number' && typeof height === 'number') {
      return `${width}×${height}`;
    }
    return null;
  }, [isSingleMode, asset, currentItem, resolveAssetForCut]);
  const currentFraming = useMemo(() => {
    const targetCut = isSingleMode
      ? focusCutData?.cut
      : currentItem?.cut;
    if (targetCut) {
      const fromSequenceSpec = previewSequenceItemByCutId.get(targetCut.id);
      if (fromSequenceSpec) {
        return buildPreviewViewportFramingStyleFromResolved(
          fromSequenceSpec.framingMode,
          fromSequenceSpec.framingAnchor
        );
      }
    }
    return buildPreviewViewportFramingStyle(targetCut?.framing, EXPORT_FRAMING_DEFAULTS);
  }, [isSingleMode, focusCutData?.cut, currentItem?.cut, previewSequenceItemByCutId]);

  // _hasRange kept for future range export UI implementation
  const _hasRange = inPoint !== null && outPoint !== null;
  // Suppress unused variable warnings - code kept for future use
  void _hasRange;

  useEffect(() => {
    if (progressFillRef.current) {
      progressFillRef.current.style.width = `${globalProgress}%`;
    }
    if (progressHandleRef.current) {
      progressHandleRef.current.style.left = `${globalProgress}%`;
    }
  }, [globalProgress]);

  useEffect(() => {
    if (!usesSequenceController || !sequenceState.isPlaying || isDragging) return;

    let rafId = 0;
    const update = () => {
      // Hotpath rule (Gate 10): requestAnimationFrame loop updates UI only.
      const totalDuration = sequenceState.totalDuration;
      if (totalDuration > 0) {
        const liveTime = getSequenceLiveAbsoluteTime();
        const percent = Math.max(0, Math.min(100, (liveTime / totalDuration) * 100));
        if (progressFillRef.current) {
          progressFillRef.current.style.width = `${percent}%`;
        }
        if (progressHandleRef.current) {
          progressHandleRef.current.style.left = `${percent}%`;
        }
      }
      rafId = window.requestAnimationFrame(update);
    };

    rafId = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(rafId);
  }, [
    usesSequenceController,
    sequenceState.isPlaying,
    sequenceState.totalDuration,
    isDragging,
    getSequenceLiveAbsoluteTime,
  ]);

  // Single Mode: show Save button only when both IN/OUT are set
  const hasSingleModeRange = isSingleModeVideo && inPoint !== null && outPoint !== null;
  const showSingleModeClipButton = isSingleModeVideo && hasSingleModeRange && !!(onClipSave || onClipClear);

  // Single Mode progress
  const singleModeProgressPercent = singleModePlaybackDuration > 0
    ? (singleModePlaybackTime / singleModePlaybackDuration) * 100
    : 0;
  const isFreeResolution = selectedResolution.width === 0;
  const previewDisplayClassName = isFreeResolution
    ? 'preview-display'
    : 'preview-display preview-display--expanded';

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
        onMarkerFocus={handleMarkerFocus}
        onMarkerDrag={handleMarkerDrag}
        onMarkerDragEnd={handleMarkerDragEnd}
        handleSingleModeProgressClick={handleSingleModeProgressClick}
        isPlaying={isPlaying}
        skipBack={() => skip(-5)}
        skipForward={() => skip(5)}
        togglePlay={isSingleModeVideo ? toggleSingleModePlay : handlePlayPause}
        handleSetInPoint={isSingleModeVideo ? handleSingleModeSetInPoint : handleSetInPoint}
        handleSetOutPoint={isSingleModeVideo ? handleSingleModeSetOutPoint : handleSetOutPoint}
        showSingleModeClipButton={showSingleModeClipButton}
        isSingleModeClipEnabled={isSingleModeClipEnabled}
        onClipPrimaryAction={isSingleModeClipEnabled ? handleSingleModeClearClip : handleSingleModeSave}
        isSingleModeClipPending={isSingleModeClipPending}
        onFrameCapture={onFrameCapture ? handleSingleModeCaptureFrame : undefined}
        isLooping={isLooping}
        toggleLooping={toggleLooping}
        globalVolume={globalVolume}
        globalMuted={globalMuted}
        setGlobalVolume={setGlobalVolume}
        toggleGlobalMute={toggleGlobalMute}
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
      onMarkerFocus={handleMarkerFocus}
      onMarkerDrag={handleMarkerDrag}
      onMarkerDragEnd={handleMarkerDragEnd}
      onProgressBarMouseDown={handleProgressBarMouseDown}
      onProgressBarHover={handleProgressBarHover}
      onProgressBarLeave={handleProgressBarLeave}
      hoverTime={hoverTime}
      sequenceCurrentTime={sequenceCurrentTime}
      goToPrev={goToPrev}
      handlePlayPause={handlePlayPause}
      isPlaying={isPlaying}
      goToNext={goToNext}
      handleSetInPoint={handleSetInPoint}
      handleSetOutPoint={handleSetOutPoint}
      isLooping={isLooping}
      toggleLooping={toggleLooping}
      globalVolume={globalVolume}
      globalMuted={globalMuted}
      setGlobalVolume={setGlobalVolume}
      toggleGlobalMute={toggleGlobalMute}
      isFullscreen={isFullscreen}
      toggleFullscreen={toggleFullscreen}
      miniToastElement={miniToastElement}
    />
  );
}
