import { useEffect, useLayoutEffect, useState, useCallback, useRef, useMemo } from 'react';
import { X, Play, Pause, SkipBack, SkipForward, Download, Loader2, Repeat, Maximize, Scissors, Camera } from 'lucide-react';
import { useStore } from '../store/useStore';
import type { Asset, Cut } from '../types';
import { createVideoObjectUrl } from '../utils/videoUtils';
import { formatTime, cyclePlaybackSpeed } from '../utils/timeUtils';
import { AudioManager } from '../utils/audioUtils';
import { createImageMediaSource, createLipSyncImageMediaSource, createVideoMediaSource } from '../utils/previewMedia';
import { getLipSyncFrameAssetIds } from '../utils/lipSyncUtils';
import { useSequencePlaybackController } from '../utils/previewPlaybackController';
import { getThumbnail } from '../utils/thumbnailCache';
import { buildSequenceItemsForCuts } from '../utils/exportSequence';
import { DEFAULT_EXPORT_RESOLUTION } from '../constants/export';
import { buildPreviewViewportFramingStyle } from '../utils/previewFraming';
import {
  PlaybackRangeMarkers,
  VolumeControl,
  TimeDisplay,
} from './shared';
import type { FocusedMarker } from './shared';
import { useMiniToast } from '../ui';
import './PreviewModal.css';
import './shared/playback-controls.css';

// 再生保証付き LazyLoad constants
const PLAY_SAFE_AHEAD = 2.0; // seconds - minimum buffer required for playback
const PRELOAD_AHEAD = 30.0; // seconds - preload this much ahead for smoother playback
const INITIAL_PRELOAD_ITEMS = 5; // number of items to preload initially

function revokeIfBlob(url: string): void {
  if (url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

interface ResolutionPresetType {
  name: string;
  width: number;
  height: number;
}

// Single Mode props (for previewing a single asset)
interface SingleModeProps {
  asset: Asset;
  initialInPoint?: number;
  initialOutPoint?: number;
  onInPointSet?: (time: number) => void;
  onOutPointSet?: (time: number) => void;
  onClipSave?: (inPoint: number, outPoint: number) => void;
  onFrameCapture?: (timestamp: number) => Promise<string | void> | void;
}

// Base props shared by both modes
interface BasePreviewModalProps {
  onClose: () => void;
  exportResolution?: ResolutionPresetType;
  onResolutionChange?: (resolution: ResolutionPresetType) => void;
  focusCutId?: string;
  onExportSequence?: (cuts: Cut[], resolution: { width: number; height: number }) => Promise<void> | void;
}

// PreviewModal can be called in Single Mode (with asset) or Sequence Mode (without asset)
type PreviewModalProps = BasePreviewModalProps & Partial<SingleModeProps>;

interface PreviewItem {
  cut: Cut;
  sceneName: string;
  sceneIndex: number;
  cutIndex: number;
  thumbnail: string | null;
}

// Resolution presets for simulation
interface ResolutionPreset {
  name: string;
  width: number;
  height: number;
}

const RESOLUTION_PRESETS: ResolutionPreset[] = [
  { name: 'Free', width: 0, height: 0 },
  { name: 'FHD', width: 1920, height: 1080 },
  { name: 'HD', width: 1280, height: 720 },
  { name: '4K', width: 3840, height: 2160 },
  { name: 'SD', width: 640, height: 480 },
];

export default function PreviewModal({
  onClose,
  exportResolution,
  onResolutionChange,
  focusCutId,
  onExportSequence,
  // Single Mode props
  asset,
  initialInPoint,
  initialOutPoint,
  onInPointSet,
  onOutPointSet,
  onClipSave,
  onFrameCapture,
}: PreviewModalProps) {
  const {
    scenes,
    previewMode,
    selectedSceneId,
    getAsset,
    globalVolume,
    globalMuted,
    setGlobalVolume,
    toggleGlobalMute,
    metadataStore,
  } = useStore();

  // Mode detection: Single Mode if asset prop is provided
  const isSingleMode = !!asset;
  const isSingleModeVideo = isSingleMode && asset?.type === 'video';
  const isSingleModeImage = isSingleMode && asset?.type === 'image';
  const usesSequenceController = !isSingleModeVideo;

  const focusCutData = useMemo(() => {
    if (!focusCutId) return null;
    for (let sIdx = 0; sIdx < scenes.length; sIdx++) {
      const scene = scenes[sIdx];
      const cutIndex = scene.cuts.findIndex(c => c.id === focusCutId);
      if (cutIndex >= 0) {
        return { scene, sceneIndex: sIdx, cut: scene.cuts[cutIndex], cutIndex };
      }
    }
    return null;
  }, [focusCutId, scenes]);
  const hasCutContext = !!focusCutData?.cut;
  const isAssetOnlyPreview = isSingleMode && !hasCutContext;
  const missingFocusedCut = !isSingleMode && !!focusCutId && !focusCutData;

  const [items, setItems] = useState<PreviewItem[]>([]);
  const [singleModeIsPlaying, setSingleModeIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverTime, setHoverTime] = useState<string | null>(null);
  const [videoObjectUrl, setVideoObjectUrl] = useState<{ assetId: string; url: string } | null>(null);
  const [singleModeIsLooping, setSingleModeIsLooping] = useState(false);
  const [selectedResolution, setSelectedResolution] = useState<ResolutionPreset>(
    exportResolution ? { ...exportResolution } : RESOLUTION_PRESETS[0]
  );
  const [isExporting, setIsExporting] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const { show: showMiniToast, element: miniToastElement } = useMiniToast();
  const overlayTimeoutRef = useRef<number | null>(null);
  const lipSyncToastShownRef = useRef<Set<string>>(new Set());
  // NOTE: Known issue (Free resolution only): very tall images can push overlay controls out of view.
  // Using the resolution simulator avoids the disappearance. Keep in mind for future layout tweaks.

  // Buffer management state (Sequence Mode)
  const videoUrlCacheRef = useRef<Map<string, string>>(new Map()); // assetId -> URL
  const readyItemsRef = useRef<Set<string>>(new Set()); // assetIds of ready items
  const preloadingRef = useRef<Set<string>>(new Set()); // assetIds currently being preloaded

  // Single Mode specific state
  const [isLoading, setIsLoading] = useState(isSingleMode);
  const [singleModeDuration, setSingleModeDuration] = useState(0);
  const [singleModeCurrentTime, setSingleModeCurrentTime] = useState(0);

  // IN/OUT point state - initialize from props for Single Mode
  const [singleModeInPoint, setSingleModeInPoint] = useState<number | null>(initialInPoint ?? null);
  const [singleModeOutPoint, setSingleModeOutPoint] = useState<number | null>(initialOutPoint ?? null);

  const sequenceDurations = useMemo(() => items.map(item => item.cut.displayTime), [items]);
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
  const inPoint = usesSequenceController ? sequenceState.inPoint : singleModeInPoint;
  const outPoint = usesSequenceController ? sequenceState.outPoint : singleModeOutPoint;
  const isBuffering = usesSequenceController ? sequenceState.isBuffering : false;

  // Focused marker state for draggable markers
  const [focusedMarker, setFocusedMarker] = useState<FocusedMarker>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const progressHandleRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const displayContainerRef = useRef<HTMLDivElement>(null);
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [sequenceMediaElement, setSequenceMediaElement] = useState<JSX.Element | null>(null);

  // Frame stepping constant (assuming 30fps)
  const FRAME_DURATION = 1 / 30;

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

  const getAudioAnalysisForAsset = useCallback((assetId: string) => {
    if (!metadataStore) return undefined;
    return metadataStore.metadata[assetId]?.audioAnalysis;
  }, [metadataStore]);

  // ===== SINGLE MODE LOGIC =====

  // State for image data in Single Mode
  const [singleModeImageData, setSingleModeImageData] = useState<string | null>(null);

  // Attached audio state (both modes)
  // Keep separate managers for Single/Sequence to avoid cross-mode races.
  const singleAudioManagerRef = useRef(new AudioManager());
  const singleAudioPlayingRef = useRef(false);
  const sequenceAudioManagerRef = useRef(new AudioManager());
  const sequenceAudioPlayingRef = useRef(false);
  const [audioLoaded, setAudioLoaded] = useState(false);

  // Unload audio on unmount (but do NOT dispose the AudioManager)
  useEffect(() => {
    return () => {
      singleAudioManagerRef.current.unload();
      sequenceAudioManagerRef.current.unload();
    };
  }, []);

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
            const previewImage = await getThumbnail(asset.path, 'image', { profile: 'sequence-preview' });
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

  // Step focused marker by one frame
  const stepFocusedMarker = useCallback((direction: number) => {
    if (!focusedMarker) return;

    const duration = usesSequenceController
      ? sequenceState.totalDuration
      : singleModeDuration;
    const stepAmount = direction * FRAME_DURATION;

    if (focusedMarker === 'in' && inPoint !== null) {
      // Constrain IN marker to not go past OUT point
      const maxTime = outPoint !== null ? outPoint : duration;
      const newTime = Math.max(0, Math.min(maxTime, inPoint + stepAmount));
      if (!usesSequenceController) {
        setSingleModeInPoint(newTime);
      } else {
        setSequenceRange(newTime, outPoint ?? null);
        seekSequenceAbsolute(newTime);
      }
      // Also move playback position
      if (!usesSequenceController && videoRef.current) {
        videoRef.current.currentTime = newTime;
        setSingleModeCurrentTime(newTime);
      }
    } else if (focusedMarker === 'out' && outPoint !== null) {
      // Constrain OUT marker to not go before IN point
      const minTime = inPoint !== null ? inPoint : 0;
      const newTime = Math.max(minTime, Math.min(duration, outPoint + stepAmount));
      if (!usesSequenceController) {
        setSingleModeOutPoint(newTime);
      } else {
        setSequenceRange(inPoint ?? null, newTime);
        seekSequenceAbsolute(newTime);
      }
      // Also move playback position
      if (!usesSequenceController && videoRef.current) {
        videoRef.current.currentTime = newTime;
        setSingleModeCurrentTime(newTime);
      }
    }
  }, [
    focusedMarker,
    inPoint,
    outPoint,
    usesSequenceController,
    sequenceState.totalDuration,
    singleModeDuration,
    FRAME_DURATION,
    setSequenceRange,
    seekSequenceAbsolute,
  ]);

  // Handle marker focus
  const handleMarkerFocus = useCallback((marker: FocusedMarker) => {
    setFocusedMarker(marker);
  }, []);

  // Handle marker drag (both modes)
  const handleMarkerDrag = useCallback((marker: 'in' | 'out', newTime: number) => {
    const duration = usesSequenceController
      ? sequenceState.totalDuration
      : singleModeDuration;
    let clampedTime = Math.max(0, Math.min(duration, newTime));

    // Constrain IN marker to not go past OUT point
    if (marker === 'in' && outPoint !== null) {
      clampedTime = Math.min(clampedTime, outPoint);
    }
    // Constrain OUT marker to not go before IN point
    if (marker === 'out' && inPoint !== null) {
      clampedTime = Math.max(clampedTime, inPoint);
    }

    if (marker === 'in') {
      if (!usesSequenceController) {
        setSingleModeInPoint(clampedTime);
      } else {
        setSequenceRange(clampedTime, outPoint ?? null);
      }
    } else {
      if (!usesSequenceController) {
        setSingleModeOutPoint(clampedTime);
      } else {
        setSequenceRange(inPoint ?? null, clampedTime);
      }
    }

    // Also update playback position
    if (!usesSequenceController && videoRef.current) {
      videoRef.current.currentTime = clampedTime;
      setSingleModeCurrentTime(clampedTime);
    } else if (usesSequenceController && items.length > 0) {
      seekSequenceAbsolute(clampedTime);
    }
  }, [
    usesSequenceController,
    sequenceState.totalDuration,
    singleModeDuration,
    items.length,
    inPoint,
    outPoint,
    setSequenceRange,
    seekSequenceAbsolute,
  ]);

  // Handle marker drag end
  const handleMarkerDragEnd = useCallback(() => {
    // Focus will be cleared when clicking outside progress bar
  }, []);

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

  const showOverlayNow = useCallback(() => {
    if (overlayTimeoutRef.current !== null) {
      window.clearTimeout(overlayTimeoutRef.current);
      overlayTimeoutRef.current = null;
    }
    setShowOverlay(true);
  }, []);

  const scheduleHideOverlay = useCallback(() => {
    if (overlayTimeoutRef.current !== null) {
      window.clearTimeout(overlayTimeoutRef.current);
    }
    overlayTimeoutRef.current = window.setTimeout(() => {
      setShowOverlay(false);
      overlayTimeoutRef.current = null;
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (overlayTimeoutRef.current !== null) {
        window.clearTimeout(overlayTimeoutRef.current);
      }
    };
  }, []);

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
      let newTime = Math.max(0, Math.min(singleModeDuration, percent * singleModeDuration));

      // If a marker is focused, move that marker with constraints
      if (focusedMarker === 'in') {
        // Constrain IN marker to not go past OUT point
        if (outPoint !== null) {
          newTime = Math.min(newTime, outPoint);
        }
        setSingleModeInPoint(newTime);
      } else if (focusedMarker === 'out') {
        // Constrain OUT marker to not go before IN point
        if (inPoint !== null) {
          newTime = Math.max(newTime, inPoint);
        }
        setSingleModeOutPoint(newTime);
      }

      // Always update playback position
      videoRef.current.currentTime = newTime;
      setSingleModeCurrentTime(newTime);
      return;
    }

    const duration = sequenceState.totalDuration;
    if (duration <= 0) return;
    let newTime = Math.max(0, Math.min(duration, percent * duration));

    if (focusedMarker === 'in') {
      if (outPoint !== null) {
        newTime = Math.min(newTime, outPoint);
      }
      setSequenceRange(newTime, outPoint ?? null);
    } else if (focusedMarker === 'out') {
      if (inPoint !== null) {
        newTime = Math.max(newTime, inPoint);
      }
      setSequenceRange(inPoint ?? null, newTime);
    }

    seekSequenceAbsolute(newTime);
  }, [
    isSingleMode,
    usesSequenceController,
    singleModeDuration,
    sequenceState.totalDuration,
    focusedMarker,
    inPoint,
    outPoint,
    setSequenceRange,
    seekSequenceAbsolute,
  ]);

  // Single Mode IN/OUT handlers
  const handleSingleModeSetInPoint = useCallback(() => {
    if (!isSingleModeVideo) return;
    if (singleModeInPoint !== null) {
      setSingleModeInPoint(null);
      return;
    }
    setSingleModeInPoint(singleModeCurrentTime);
    onInPointSet?.(singleModeCurrentTime);
  }, [isSingleModeVideo, singleModeInPoint, singleModeCurrentTime, onInPointSet]);

  const handleSingleModeSetOutPoint = useCallback(() => {
    if (!isSingleModeVideo) return;
    if (singleModeOutPoint !== null) {
      setSingleModeOutPoint(null);
      return;
    }
    setSingleModeOutPoint(singleModeCurrentTime);
    onOutPointSet?.(singleModeCurrentTime);
  }, [isSingleModeVideo, singleModeOutPoint, singleModeCurrentTime, onOutPointSet]);

  // Single Mode Save handler: save clip when both IN and OUT are set
  const handleSingleModeSave = useCallback(() => {
    if (!isSingleModeVideo) return;
    if (inPoint === null || outPoint === null) return;

    const start = Math.min(inPoint, outPoint);
    const end = Math.max(inPoint, outPoint);
    onClipSave?.(start, end);
    onClose();
  }, [isSingleModeVideo, inPoint, outPoint, onClipSave, onClose]);

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
    setSingleModeIsPlaying(!singleModeIsPlaying);
  }, [isSingleModeVideo, singleModeIsPlaying, inPoint, outPoint]);

  // Apply playback speed (Single Mode)
  useEffect(() => {
    if (isSingleModeVideo && videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [isSingleModeVideo, playbackSpeed]);

  // ===== SINGLE MODE ATTACHED AUDIO =====

  // Load attached audio for Single Mode (only when asset changes)
  useEffect(() => {
    if (!isSingleMode || !asset?.id) {
      singleAudioManagerRef.current.unload();
      setAudioLoaded(false);
      singleAudioPlayingRef.current = false;
      return;
    }

    if (!hasCutContext) {
      singleAudioManagerRef.current.unload();
      setAudioLoaded(false);
      singleAudioPlayingRef.current = false;
      return;
    }

    const attachedAudio = getAttachedAudioForCut(focusCutData?.cut ?? null);
    singleAudioManagerRef.current.unload();
    setAudioLoaded(false);
    singleAudioPlayingRef.current = false;

    if (!attachedAudio?.path) return;

    const manager = singleAudioManagerRef.current;
    if (manager.isDisposed()) return;

    const loadAudio = async () => {
      const offset = getAudioOffsetForCut(focusCutData?.cut ?? null);
      manager.setOffset(offset);
      const expectedLoadId = manager.getLoadId() + 1;
      const loaded = await manager.load(attachedAudio.path);
      if (!loaded) return;
      if (manager.getActiveLoadId() === expectedLoadId) {
        setAudioLoaded(true);
      }
    };

    loadAudio();
  }, [isSingleMode, asset?.id, hasCutContext, focusCutData?.cut, getAttachedAudioForCut, getAudioOffsetForCut]);

  // Sync Single Mode audio with video playback (only on play/pause change)
  useEffect(() => {
    if (!isSingleMode || !audioLoaded) return;
    const manager = singleAudioManagerRef.current;

    if (isSingleModeVideo) {
      if (singleModeIsPlaying) {
        const currentTime = videoRef.current?.currentTime ?? 0;
        manager.play(currentTime);
      } else {
        manager.pause();
      }
      singleAudioPlayingRef.current = singleModeIsPlaying;
      return;
    }

    if (sequenceState.isPlaying && !sequenceState.isBuffering) {
      if (!singleAudioPlayingRef.current) {
        manager.play(Math.max(0, sequenceSelectors.getAbsoluteTime()));
        singleAudioPlayingRef.current = true;
      }
    } else if (singleAudioPlayingRef.current) {
      manager.pause();
      singleAudioPlayingRef.current = false;
    }
  }, [
    isSingleMode,
    isSingleModeVideo,
    singleModeIsPlaying,
    audioLoaded,
    sequenceState.isPlaying,
    sequenceState.isBuffering,
    sequenceSelectors,
  ]);

  // Apply volume to attached audio
  useEffect(() => {
    singleAudioManagerRef.current.setVolume(globalMuted ? 0 : globalVolume);
    sequenceAudioManagerRef.current.setVolume(globalMuted ? 0 : globalVolume);
  }, [globalVolume, globalMuted]);

  // ===== SEQUENCE MODE LOGIC =====

  const getVideoAssetId = useCallback((index: number): string | null => {
    const item = items[index];
    if (!item) return null;
    if (item.cut.asset?.type !== 'video') return null;
    return item.cut.asset?.id ?? item.cut.assetId ?? null;
  }, [items]);

  // Helper: Get items that fall within a time window from given index
  const getItemsInTimeWindow = useCallback((startIndex: number, windowSeconds: number): number[] => {
    const indices: number[] = [];
    let accumulatedTime = 0;

    for (let i = startIndex; i < items.length && accumulatedTime < windowSeconds; i++) {
      indices.push(i);
      accumulatedTime += items[i].cut.displayTime;
    }

    return indices;
  }, [items]);

  // Helper: Check if an item is ready for playback
  const isItemReady = useCallback((index: number): boolean => {
    const item = items[index];
    if (!item) return false;

    if (item.cut.asset?.type === 'video') {
      const assetId = getVideoAssetId(index);
      if (!assetId) return false;
      return videoUrlCacheRef.current.has(assetId);
    } else {
      // Images are ready if thumbnail is available
      return !!item.thumbnail;
    }
  }, [items, getVideoAssetId]);

  // Helper: Preload items (video URLs or image data)
  const preloadItems = useCallback(async (indices: number[]): Promise<void> => {
    const preloadPromises: Promise<void>[] = [];

    for (const index of indices) {
      const item = items[index];
      if (!item) continue;

      if (item.cut.asset?.type === 'video' && item.cut.asset.path) {
        const assetId = getVideoAssetId(index);
        if (!assetId) continue;

        // Skip if already ready or currently being preloaded
        if (readyItemsRef.current.has(assetId) || preloadingRef.current.has(assetId)) continue;

        if (!videoUrlCacheRef.current.has(assetId)) {
          preloadingRef.current.add(assetId);
          preloadPromises.push(
            createVideoObjectUrl(item.cut.asset.path).then(url => {
              if (url) {
                videoUrlCacheRef.current.set(assetId, url);
                readyItemsRef.current.add(assetId);
              }
              preloadingRef.current.delete(assetId);
            })
          );
        } else {
          readyItemsRef.current.add(assetId);
        }
      } else {
        // Images - consider ready immediately (thumbnail already loaded in buildItems)
        const assetId = item.cut.asset?.id ?? item.cut.assetId;
        if (assetId) {
          readyItemsRef.current.add(assetId);
        }
      }
    }

    await Promise.all(preloadPromises);
  }, [items, getVideoAssetId]);

  // Helper: Check if buffer is sufficient for playback
  const checkBufferStatus = useCallback((): { ready: boolean; neededItems: number[] } => {
    if (items.length === 0) return { ready: true, neededItems: [] };

    const neededItems = getItemsInTimeWindow(currentIndex, PLAY_SAFE_AHEAD);
    const allReady = neededItems.every(idx => isItemReady(idx));

    return { ready: allReady, neededItems };
  }, [items, currentIndex, getItemsInTimeWindow, isItemReady]);

  // Helper: Cleanup old video URLs to prevent memory leaks
  const cleanupOldUrls = useCallback((keepFromIndex: number) => {
    const keepBackWindow = 5; // Keep 5 items back for rewind
    const keepStart = Math.max(0, keepFromIndex - keepBackWindow);

    const keepAssetIds = new Set<string>();
    for (let i = keepStart; i < items.length; i++) {
      const assetId = getVideoAssetId(i);
      if (assetId) {
        keepAssetIds.add(assetId);
      }
    }

    for (const [assetId, url] of videoUrlCacheRef.current) {
      if (!keepAssetIds.has(assetId)) {
        revokeIfBlob(url);
        videoUrlCacheRef.current.delete(assetId);
        readyItemsRef.current.delete(assetId);
        preloadingRef.current.delete(assetId);
      }
    }
  }, [items, getVideoAssetId]);

  // Build preview items
  useEffect(() => {
    if (isSingleModeVideo) {
      setItems([]);
      return;
    }

    if (isSingleModeImage && asset) {
      const displayTime = getDisplayTimeForAsset(asset.id) ?? 1.0;
      const resolvedDisplayTime = Math.max(0.1, displayTime);
      const thumbnail = singleModeImageData ?? asset.thumbnail ?? null;
      const lipSyncSettings = getLipSyncSettingsForAsset(asset.id);
      const singleCut: Cut = {
        id: `single-${asset.id}`,
        assetId: asset.id,
        asset,
        displayTime: resolvedDisplayTime,
        order: 0,
        isLipSync: !!lipSyncSettings,
        lipSyncFrameCount: lipSyncSettings ? getLipSyncFrameAssetIds(lipSyncSettings).length : undefined,
      };

      setItems([{
        cut: singleCut,
        sceneName: asset.name ?? 'Single',
        sceneIndex: 0,
        cutIndex: 0,
        thumbnail,
      }]);
      return;
    }

    if (isSingleMode) return;
    if (missingFocusedCut) {
      setItems([]);
      return;
    }

    if (focusCutData) {
      const buildFocusedItems = async () => {
        const { scene, sceneIndex, cut, cutIndex } = focusCutData;
        const cutAsset = cut.asset || getAsset(cut.assetId);
        if (!cutAsset) {
          setItems([]);
          return;
        }

        const lipSyncSettings = cut.isLipSync && cutAsset.id
          ? getLipSyncSettingsForAsset(cutAsset.id)
          : undefined;

        let thumbnail: string | null = cutAsset.thumbnail || null;

        if (cutAsset.type === 'image' && cutAsset.path) {
          try {
            const cached = await getThumbnail(cutAsset.path, 'image', { profile: 'sequence-preview' });
            if (cached) thumbnail = cached;
          } catch {
            // ignore
          }
        }

        if (lipSyncSettings) {
          const firstFrameAssetId = getLipSyncFrameAssetIds(lipSyncSettings)[0];
          const baseAsset = firstFrameAssetId ? getAsset(firstFrameAssetId) : undefined;
          if (baseAsset?.thumbnail) {
            thumbnail = baseAsset.thumbnail;
          } else if (baseAsset?.path) {
            try {
              const cached = await getThumbnail(baseAsset.path, 'image', { profile: 'sequence-preview' });
              if (cached) thumbnail = cached;
            } catch {
              // ignore
            }
          }
        }

        if (!thumbnail && cutAsset.path) {
          try {
            if (cutAsset.type === 'video') {
              thumbnail = await getThumbnail(cutAsset.path, 'video');
            } else {
              thumbnail = await getThumbnail(cutAsset.path, 'image', { profile: 'sequence-preview' });
            }
          } catch {
            // Failed to load
          }
        }

        setItems([{
          cut,
          sceneName: scene.name,
          sceneIndex,
          cutIndex,
          thumbnail,
        }]);
      };

      void buildFocusedItems();
      return;
    }

    const buildItems = async () => {
      const newItems: PreviewItem[] = [];

      const scenesToPreview = previewMode === 'scene' && selectedSceneId
        ? scenes.filter(s => s.id === selectedSceneId)
        : scenes;

      for (let sIdx = 0; sIdx < scenesToPreview.length; sIdx++) {
        const scene = scenesToPreview[sIdx];
        for (let cIdx = 0; cIdx < scene.cuts.length; cIdx++) {
          const cut = scene.cuts[cIdx];
          const cutAsset = cut.asset || getAsset(cut.assetId);
          const lipSyncSettings = cut.isLipSync && cutAsset?.id
            ? getLipSyncSettingsForAsset(cutAsset.id)
            : undefined;

          let thumbnail: string | null = cutAsset?.thumbnail || null;

          if (cutAsset?.type === 'image' && cutAsset.path) {
            try {
              const cached = await getThumbnail(cutAsset.path, 'image', { profile: 'sequence-preview' });
              if (cached) thumbnail = cached;
            } catch {
              // ignore
            }
          }

          if (lipSyncSettings) {
            const firstFrameAssetId = getLipSyncFrameAssetIds(lipSyncSettings)[0];
            const baseAsset = firstFrameAssetId ? getAsset(firstFrameAssetId) : undefined;
            if (baseAsset?.thumbnail) {
              thumbnail = baseAsset.thumbnail;
            } else if (baseAsset?.path) {
              try {
                const cached = await getThumbnail(baseAsset.path, 'image', { profile: 'sequence-preview' });
                if (cached) thumbnail = cached;
              } catch {
                // ignore
              }
            }
          }

          if (!thumbnail && cutAsset?.path) {
            try {
              if (cutAsset.type === 'video') {
                thumbnail = await getThumbnail(cutAsset.path, 'video');
              } else {
                thumbnail = await getThumbnail(cutAsset.path, 'image', { profile: 'sequence-preview' });
              }
            } catch {
              // Failed to load
            }
          }

          newItems.push({
            cut,
            sceneName: scene.name,
            sceneIndex: sIdx,
            cutIndex: cIdx,
            thumbnail,
          });
        }
      }

      setItems(newItems);
    };

    buildItems();
  }, [
    isSingleMode,
    isSingleModeVideo,
    isSingleModeImage,
    asset,
    singleModeImageData,
    scenes,
    previewMode,
    selectedSceneId,
    getAsset,
    getDisplayTimeForAsset,
    getLipSyncSettingsForAsset,
    focusCutData,
    missingFocusedCut,
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

  // Cleanup cache entries that are no longer present (Sequence Mode only)
  useEffect(() => {
    if (isSingleMode) return;

    const activeAssetIds = new Set<string>();
    for (let i = 0; i < items.length; i++) {
      const assetId = getVideoAssetId(i);
      if (assetId) {
        activeAssetIds.add(assetId);
      }
    }

    for (const [assetId, url] of videoUrlCacheRef.current) {
      if (!activeAssetIds.has(assetId)) {
        revokeIfBlob(url);
        videoUrlCacheRef.current.delete(assetId);
        readyItemsRef.current.delete(assetId);
        preloadingRef.current.delete(assetId);
      }
    }
  }, [isSingleMode, items, getVideoAssetId]);

  // Initial preload when items are loaded (Sequence Mode only)
  useEffect(() => {
    if (isSingleMode || items.length === 0) return;

    const initialPreload = async () => {
      // Preload first N items immediately for instant playback start
      const initialItems: number[] = [];
      for (let i = 0; i < Math.min(INITIAL_PRELOAD_ITEMS, items.length); i++) {
        initialItems.push(i);
      }
      await preloadItems(initialItems);

      // Also preload items within PRELOAD_AHEAD time window
      const timeWindowItems = getItemsInTimeWindow(0, PRELOAD_AHEAD);
      await preloadItems(timeWindowItems);
    };

    initialPreload();
  }, [isSingleMode, items, preloadItems, getItemsInTimeWindow]);

  // Preload and buffer management (Sequence Mode only)
  useEffect(() => {
    if (isSingleMode || items.length === 0) return;

    const manageBuffer = async () => {
      // Preload items well ahead for smoother playback
      const itemsToPreload = getItemsInTimeWindow(currentIndex, PRELOAD_AHEAD);
      // Start preloading in background (don't await)
      preloadItems(itemsToPreload);

      // Update videoObjectUrl from cache
      const currentItem = items[currentIndex];
      const assetId = getVideoAssetId(currentIndex);
      const cachedUrl = assetId ? videoUrlCacheRef.current.get(assetId) : undefined;

      if (currentItem?.cut.asset?.type === 'video') {
        if (cachedUrl && assetId && (!videoObjectUrl || videoObjectUrl.assetId !== assetId || videoObjectUrl.url !== cachedUrl)) {
          setVideoObjectUrl({ assetId, url: cachedUrl });
        } else if (!cachedUrl && currentItem.cut.asset?.path && assetId) {
          // Fallback: create URL if not in cache (shouldn't happen normally)
          const url = await createVideoObjectUrl(currentItem.cut.asset.path);
          if (url) {
            videoUrlCacheRef.current.set(assetId, url);
            readyItemsRef.current.add(assetId);
            setVideoObjectUrl({ assetId, url });
          }
        }
      } else {
        // Not a video - clear video URL
        setVideoObjectUrl(null);
      }

      // Check buffer status and update buffering state
      const { ready } = checkBufferStatus();
      const currentReady = isItemReady(currentIndex);
      if (sequenceState.isPlaying && !ready && !sequenceState.isBuffering) {
        if (!currentReady) {
          setSequenceBuffering(true);
        }
      } else if (sequenceState.isPlaying && (ready || currentReady) && sequenceState.isBuffering) {
        setSequenceBuffering(false);
      }

      // Cleanup old URLs (keep more items for rewinding)
      cleanupOldUrls(currentIndex);
    };

    manageBuffer();
  }, [
    isSingleMode,
    items,
    currentIndex,
    videoObjectUrl,
    getItemsInTimeWindow,
    preloadItems,
    cleanupOldUrls,
    getVideoAssetId,
    checkBufferStatus,
    isItemReady,
    sequenceState.isPlaying,
    sequenceState.isBuffering,
    setSequenceBuffering,
  ]);

  // Cleanup all URLs on unmount (Sequence Mode)
  useEffect(() => {
    if (isSingleMode) return;

    return () => {
      for (const url of videoUrlCacheRef.current.values()) {
        revokeIfBlob(url);
      }
      videoUrlCacheRef.current.clear();
    };
  }, [isSingleMode]);

  // ===== SEQUENCE MODE ATTACHED AUDIO =====

  // Load attached audio when cut changes (Sequence Mode)
  useEffect(() => {
    if (isSingleMode || items.length === 0) {
      sequenceAudioManagerRef.current.unload();
      setAudioLoaded(false);
      sequenceAudioPlayingRef.current = false;
      return;
    }

    const currentItem = items[currentIndex];
    const currentCut = currentItem?.cut;
    if (!currentCut) {
      sequenceAudioManagerRef.current.unload();
      setAudioLoaded(false);
      sequenceAudioPlayingRef.current = false;
      return;
    }

    const attachedAudio = getAttachedAudioForCut(currentCut);
    sequenceAudioManagerRef.current.unload();
    setAudioLoaded(false);
    sequenceAudioPlayingRef.current = false;

    if (!attachedAudio?.path) return;

    const manager = sequenceAudioManagerRef.current;
    if (manager.isDisposed()) return;

    const loadAudio = async () => {
      const offset = getAudioOffsetForCut(currentCut);
      manager.setOffset(offset);
      const expectedLoadId = manager.getLoadId() + 1;
      const loaded = await manager.load(attachedAudio.path);
      if (!loaded) return;
      if (manager.getActiveLoadId() === expectedLoadId) {
        setAudioLoaded(true);
      }
    };

    loadAudio();
  }, [isSingleMode, currentIndex, items, getAttachedAudioForCut, getAudioOffsetForCut]);

  // Sync Sequence Mode audio with playback state (separate effect)
  useEffect(() => {
    if (isSingleMode || !audioLoaded) return;

    const manager = sequenceAudioManagerRef.current;
    if (sequenceState.isPlaying && !sequenceState.isBuffering) {
      if (!sequenceAudioPlayingRef.current) {
        manager.play(Math.max(0, sequenceSelectors.getAbsoluteTime()));
        sequenceAudioPlayingRef.current = true;
      }
    } else if (sequenceAudioPlayingRef.current) {
      manager.pause();
      sequenceAudioPlayingRef.current = false;
    }
  }, [isSingleMode, audioLoaded, sequenceState.isPlaying, sequenceState.isBuffering, sequenceSelectors]);

  // Calculate display size for resolution simulation
  useLayoutEffect(() => {
    const updateDisplaySize = () => {
      if (!displayContainerRef.current) return;
      const container = displayContainerRef.current;
      const rect = container.getBoundingClientRect();
      setDisplaySize({ width: rect.width, height: rect.height });
    };

    updateDisplaySize();
    window.addEventListener('resize', updateDisplaySize);
    return () => window.removeEventListener('resize', updateDisplaySize);
  }, [selectedResolution]);

  // Calculate viewport frame for resolution simulation
  const getViewportStyle = useCallback(() => {
    if (selectedResolution.width === 0) return null;

    const targetWidth = selectedResolution.width;
    const targetHeight = selectedResolution.height;
    const containerWidth = displaySize.width > 0 ? displaySize.width : 800;
    const containerHeight = displaySize.height > 0 ? displaySize.height : 600;

    const scaleX = containerWidth / targetWidth;
    const scaleY = containerHeight / targetHeight;
    const scale = Math.min(scaleX, scaleY) * 0.9;

    return {
      width: targetWidth * scale,
      height: targetHeight * scale,
      scale,
    };
  }, [selectedResolution, displaySize]);

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
    if (!usesSequenceController) {
      setSequenceSource(null);
      setSequenceMediaElement(null);
      return;
    }

    setSequenceSource(null);
    setSequenceMediaElement(null);

    const currentItem = items[sequenceState.currentIndex];
    const asset = currentItem?.cut?.asset;
    if (!currentItem || !asset) return;

    const lipSyncSettings = currentItem.cut.isLipSync ? getLipSyncSettingsForAsset(asset.id) : undefined;
    if (lipSyncSettings) {
      let isActive = true;
      const loadLipSyncSources = async () => {
        const frameAssetIds = [
          ...getLipSyncFrameAssetIds(lipSyncSettings),
        ];

        const sources: string[] = [];
        for (const frameAssetId of frameAssetIds) {
          let src = '';
          const frameAsset = getAsset(frameAssetId);
          if (frameAsset?.thumbnail) {
            src = frameAsset.thumbnail;
          } else if (frameAsset?.path) {
            try {
              const thumb = await getThumbnail(frameAsset.path, 'image');
              if (thumb) src = thumb;
            } catch {
              // ignore
            }
          }
          sources.push(src);
        }

        const baseFallback = sources[0] || currentItem.thumbnail || '';
        const resolvedSources = sources.map((src) => src || baseFallback);

        const analysis = getAudioAnalysisForAsset(lipSyncSettings.rmsSourceAudioAssetId);
        if (!analysis?.rms?.length) {
          if (!lipSyncToastShownRef.current.has(asset.id)) {
            lipSyncToastShownRef.current.add(asset.id);
            showMiniToast('Lip sync RMS not available', 'warning');
          }
          const fallbackSource = createImageMediaSource({
            src: baseFallback,
            alt: `${currentItem.sceneName} - Cut ${currentItem.cutIndex + 1}`,
            className: 'preview-media',
            duration: currentItem.cut.displayTime,
            onTimeUpdate: sequenceTick,
            onEnded: sequenceGoToNext,
          });
          if (!isActive) return;
          setSequenceSource(fallbackSource);
          setSequenceMediaElement(fallbackSource.element);
          setSequenceRate(playbackSpeed);
          return;
        }

        const lipSyncSource = createLipSyncImageMediaSource({
          sources: resolvedSources,
          alt: `${currentItem.sceneName} - Cut ${currentItem.cutIndex + 1}`,
          className: 'preview-media',
          duration: currentItem.cut.displayTime,
          rms: analysis.rms,
          rmsFps: analysis.fps,
          thresholds: lipSyncSettings.thresholds,
          getAbsoluteTime: getSequenceLiveAbsoluteTime,
          audioOffsetSec: getAudioOffsetForCut(currentItem.cut),
          onTimeUpdate: sequenceTick,
          onEnded: sequenceGoToNext,
        });

        if (!isActive) return;
        setSequenceSource(lipSyncSource);
        setSequenceMediaElement(lipSyncSource.element);
        setSequenceRate(playbackSpeed);
      };

      void loadLipSyncSources();
      return () => {
        isActive = false;
      };
    }

    if (asset.type === 'video') {
      const assetId = currentItem.cut.asset?.id ?? currentItem.cut.assetId ?? null;
      if (!videoObjectUrl || !assetId || videoObjectUrl.assetId !== assetId) {
        return;
      }

      const clipInPoint = currentItem.cut.isClip && currentItem.cut.inPoint !== undefined
        ? currentItem.cut.inPoint
        : 0;
      const clipOutPoint = currentItem.cut.isClip && currentItem.cut.outPoint !== undefined
        ? currentItem.cut.outPoint
        : undefined;

      const source = createVideoMediaSource({
        src: videoObjectUrl.url,
        key: videoObjectUrl.url,
        className: 'preview-media',
        muted: shouldMuteEmbeddedAudio(currentItem.cut),
        refObject: videoRef,
        inPoint: clipInPoint,
        outPoint: clipOutPoint,
        onTimeUpdate: sequenceTick,
        onEnded: sequenceGoToNext,
      });
      setSequenceSource(source);
      setSequenceMediaElement(source.element);
      setSequenceRate(playbackSpeed);
      return;
    }

    if (asset.type === 'image') {
      if (currentItem.thumbnail) {
        const source = createImageMediaSource({
          src: currentItem.thumbnail,
          alt: `${currentItem.sceneName} - Cut ${currentItem.cutIndex + 1}`,
          className: 'preview-media',
          duration: currentItem.cut.displayTime,
          onTimeUpdate: sequenceTick,
          onEnded: sequenceGoToNext,
        });
        setSequenceSource(source);
        setSequenceMediaElement(source.element);
        setSequenceRate(playbackSpeed);
      }
    }
  }, [
    usesSequenceController,
    items,
    sequenceState.currentIndex,
    videoObjectUrl,
    playbackSpeed,
    shouldMuteEmbeddedAudio,
    setSequenceSource,
    sequenceTick,
    sequenceGoToNext,
    setSequenceRate,
    getLipSyncSettingsForAsset,
    getAudioAnalysisForAsset,
    getSequenceLiveAbsoluteTime,
    getAudioOffsetForCut,
    showMiniToast,
    getAsset,
  ]);

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

  // IN/OUT point handlers
  const handleSetInPoint = useCallback(() => {
    if (items.length === 0) return;
    if (isSingleModeVideo) {
      if (singleModeInPoint !== null) {
        setSingleModeInPoint(null);
      } else {
        setSingleModeInPoint(singleModeCurrentTime);
      }
      return;
    }
    if (inPoint !== null) {
      setSequenceRange(null, outPoint ?? null);
      return;
    }
    const elapsedDuration = sequenceSelectors.getAbsoluteTime();
    setSequenceRange(elapsedDuration, outPoint ?? null);
  }, [
    items.length,
    isSingleModeVideo,
    singleModeCurrentTime,
    singleModeInPoint,
    inPoint,
    outPoint,
    sequenceSelectors,
    setSequenceRange,
  ]);

  const handleSetOutPoint = useCallback(() => {
    if (items.length === 0) return;
    if (isSingleModeVideo) {
      if (singleModeOutPoint !== null) {
        setSingleModeOutPoint(null);
      } else {
        setSingleModeOutPoint(singleModeCurrentTime);
      }
      return;
    }
    if (outPoint !== null) {
      setSequenceRange(inPoint ?? null, null);
      return;
    }
    const elapsedDuration = sequenceSelectors.getAbsoluteTime();
    setSequenceRange(inPoint ?? null, elapsedDuration);
  }, [
    items.length,
    isSingleModeVideo,
    singleModeCurrentTime,
    singleModeOutPoint,
    inPoint,
    outPoint,
    sequenceSelectors,
    setSequenceRange,
  ]);

  // Keyboard controls - unified for both modes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;

      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case ' ':
          e.preventDefault();
          if (isSingleModeVideo) {
            toggleSingleModePlay();
          } else {
            handlePlayPause();
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          skip(-5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          skip(5);
          break;
        case ',':
          e.preventDefault();
          // If marker is focused, step the marker; otherwise step the frame
          if (focusedMarker) {
            stepFocusedMarker(-1);
          } else if (isSingleModeVideo) {
            stepFrame(-1);
          } else {
            // In Sequence Mode, frame step only works during video clip playback
            const currentItem = items[currentIndex];
            if (currentItem?.cut.asset?.type === 'video') {
              stepFrame(-1);
            }
          }
          break;
        case '.':
          e.preventDefault();
          // If marker is focused, step the marker; otherwise step the frame
          if (focusedMarker) {
            stepFocusedMarker(1);
          } else if (isSingleModeVideo) {
            stepFrame(1);
          } else {
            // In Sequence Mode, frame step only works during video clip playback
            const currentItem = items[currentIndex];
            if (currentItem?.cut.asset?.type === 'video') {
              stepFrame(1);
            }
          }
          break;
        case '[':
          e.preventDefault();
          cycleSpeed('down');
          break;
        case ']':
          e.preventDefault();
          cycleSpeed('up');
          break;
        case 'f':
          toggleFullscreen();
          break;
        case 'l':
          toggleLooping();
          break;
        case 'i':
          if (isSingleModeVideo) {
            handleSingleModeSetInPoint();
          } else {
            handleSetInPoint();
          }
          break;
        case 'o':
          if (isSingleModeVideo) {
            handleSingleModeSetOutPoint();
          } else {
            handleSetOutPoint();
          }
          break;
        case 'm':
          toggleGlobalMute();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    onClose,
    isSingleModeVideo,
    toggleSingleModePlay,
    handlePlayPause,
    skip,
    stepFrame,
    stepFocusedMarker,
    focusedMarker,
    items,
    currentIndex,
    cycleSpeed,
    handleSingleModeSetInPoint,
    handleSingleModeSetOutPoint,
    handleSetInPoint,
    handleSetOutPoint,
    toggleGlobalMute,
  ]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement && modalRef.current) {
      modalRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Export full sequence (no range)
  const handleExportFull = useCallback(async () => {
    if (items.length === 0) return;

    setIsExporting(true);
    if (!usesSequenceController) {
      setSingleModeIsPlaying(false);
    } else {
      sequencePause();
    }

    try {
      const exportWidth = selectedResolution.width > 0 ? selectedResolution.width : DEFAULT_EXPORT_RESOLUTION.width;
      const exportHeight = selectedResolution.height > 0 ? selectedResolution.height : DEFAULT_EXPORT_RESOLUTION.height;
      const exportCuts = items.map((item) => item.cut);

      if (onExportSequence) {
        await onExportSequence(exportCuts, { width: exportWidth, height: exportHeight });
        return;
      }

      if (!window.electronAPI) {
        return;
      }

      const outputPath = await window.electronAPI.showSaveSequenceDialog('sequence_export.mp4');
      if (!outputPath) {
        setIsExporting(false);
        return;
      }

      const sequenceItems = buildSequenceItemsForCuts(
        exportCuts,
        {
          debugFraming: true,
          metadataByAssetId: metadataStore?.metadata,
          resolveAssetById: getAsset,
        }
      );

      const result = await window.electronAPI.exportSequence({
        items: sequenceItems,
        outputPath,
        width: exportWidth,
        height: exportHeight,
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
  }, [items, selectedResolution, usesSequenceController, sequencePause, metadataStore, getAsset, onExportSequence]);

  // Export with IN/OUT range (Save button) - kept for future UI implementation
  const _handleExportRange = useCallback(async () => {
    if (!window.electronAPI || items.length === 0) return;
    if (inPoint === null || outPoint === null) return;

    setIsExporting(true);
    if (!usesSequenceController) {
      setSingleModeIsPlaying(false);
    } else {
      sequencePause();
    }

    try {
      const exportWidth = selectedResolution.width > 0 ? selectedResolution.width : DEFAULT_EXPORT_RESOLUTION.width;
      const exportHeight = selectedResolution.height > 0 ? selectedResolution.height : DEFAULT_EXPORT_RESOLUTION.height;

      const outputPath = await window.electronAPI.showSaveSequenceDialog('sequence_export.mp4');
      if (!outputPath) {
        setIsExporting(false);
        return;
      }

      const rangeStart = Math.min(inPoint, outPoint);
      const rangeEnd = Math.max(inPoint, outPoint);

      const sequenceItems: Array<{
        type: 'image' | 'video';
        path: string;
        duration: number;
        inPoint?: number;
        outPoint?: number;
      }> = [];

      let accumulatedTime = 0;
      for (const item of items) {
        const asset = item.cut.asset;
        if (!asset?.path) continue;

        const itemStart = accumulatedTime;
        const itemEnd = accumulatedTime + item.cut.displayTime;
        accumulatedTime = itemEnd;

        if (itemEnd <= rangeStart || itemStart >= rangeEnd) continue;

        const clipStart = Math.max(0, rangeStart - itemStart);
        const clipEnd = Math.min(item.cut.displayTime, rangeEnd - itemStart);
        const clipDuration = clipEnd - clipStart;

        if (clipDuration <= 0) continue;

        if (asset.type === 'video') {
          const originalInPoint = item.cut.isClip && item.cut.inPoint !== undefined ? item.cut.inPoint : 0;
          sequenceItems.push({
            type: 'video',
            path: asset.path,
            duration: clipDuration,
            inPoint: originalInPoint + clipStart,
            outPoint: originalInPoint + clipEnd,
          });
        } else {
          sequenceItems.push({
            type: 'image',
            path: asset.path,
            duration: clipDuration,
          });
        }
      }

      if (sequenceItems.length === 0) {
        alert('No items in the selected range');
        setIsExporting(false);
        return;
      }

      const result = await window.electronAPI.exportSequence({
        items: sequenceItems,
        outputPath,
        width: exportWidth,
        height: exportHeight,
        fps: 30,
      });

      if (result.success) {
        alert(`Export complete! (${formatTime(rangeStart)} - ${formatTime(rangeEnd)})\nFile: ${result.outputPath}\nSize: ${(result.fileSize! / 1024 / 1024).toFixed(2)} MB`);
      } else {
        alert(`Export failed: ${result.error}`);
      }
    } catch (error) {
      alert(`Export error: ${String(error)}`);
    } finally {
      setIsExporting(false);
    }
  }, [items, selectedResolution, inPoint, outPoint, usesSequenceController, sequencePause]);
  // Suppress unused variable warning - code kept for future use
  void _handleExportRange;

  // Progress bar handlers
  const handleProgressBarClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || items.length === 0) return;

    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const progressPercent = Math.max(0, Math.min(100, (clickX / rect.width) * 100));

    const totalDuration = sequenceState.totalDuration;
    if (totalDuration <= 0) return;
    let newTime = (progressPercent / 100) * totalDuration;

    // If a marker is focused, move that marker with constraints
    if (focusedMarker === 'in') {
      // Constrain IN marker to not go past OUT point
      if (outPoint !== null) {
        newTime = Math.min(newTime, outPoint);
      }
      setSequenceRange(newTime, outPoint ?? null);
    } else if (focusedMarker === 'out') {
      // Constrain OUT marker to not go before IN point
      if (inPoint !== null) {
        newTime = Math.max(newTime, inPoint);
      }
      setSequenceRange(inPoint ?? null, newTime);
    }

    // Always update playback position (recalculate from constrained newTime)
    seekSequenceAbsolute(newTime);
  }, [items, sequenceState.totalDuration, focusedMarker, inPoint, outPoint, setSequenceRange, seekSequenceAbsolute]);

  const handleProgressBarMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    sequencePause();
    if (!isSingleMode && audioLoaded) {
      sequenceAudioManagerRef.current.pause();
      sequenceAudioPlayingRef.current = false;
    }
    handleProgressBarClick(e);
  }, [handleProgressBarClick, sequencePause, isSingleMode, audioLoaded]);

  const handleProgressBarMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !progressBarRef.current || items.length === 0) return;

    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const progressPercent = (clickX / rect.width) * 100;
    seekSequencePercent(progressPercent);
  }, [isDragging, items, seekSequencePercent]);

  const handleProgressBarMouseUp = useCallback(() => {
    setIsDragging(false);
    if (!isSingleMode && audioLoaded && sequenceState.isPlaying) {
      sequenceAudioManagerRef.current.play(Math.max(0, sequenceSelectors.getAbsoluteTime()));
      sequenceAudioPlayingRef.current = true;
    }
  }, [isSingleMode, audioLoaded, sequenceState.isPlaying, sequenceSelectors]);

  const handleProgressBarHover = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || items.length === 0) return;

    const rect = progressBarRef.current.getBoundingClientRect();
    const hoverX = e.clientX - rect.left;
    const progressPercent = (hoverX / rect.width) * 100;

    const totalDuration = sequenceState.totalDuration;
    const hoverTimeSeconds = (progressPercent / 100) * totalDuration;
    setHoverTime(formatTime(hoverTimeSeconds));
  }, [items, sequenceState.totalDuration]);

  const handleProgressBarLeave = useCallback(() => {
    setHoverTime(null);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleProgressBarMouseMove);
      window.addEventListener('mouseup', handleProgressBarMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleProgressBarMouseMove);
        window.removeEventListener('mouseup', handleProgressBarMouseUp);
      };
    }
  }, [isDragging, handleProgressBarMouseMove, handleProgressBarMouseUp]);

  // Apply volume/mute to the active video element (embedded audio only)
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = globalVolume;
      const activeCut = isSingleMode
        ? (focusCutData?.cut ?? null)
        : (items[sequenceState.currentIndex]?.cut ?? null);
      videoRef.current.muted = shouldMuteEmbeddedAudio(activeCut);
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
    const targetAsset = isSingleMode ? asset : currentItem?.cut.asset;
    const width = targetAsset?.metadata?.width;
    const height = targetAsset?.metadata?.height;
    if (typeof width === 'number' && typeof height === 'number') {
      return `${width}×${height}`;
    }
    return null;
  }, [isSingleMode, asset, currentItem]);
  const currentFraming = useMemo(() => {
    const targetCut = isSingleMode
      ? focusCutData?.cut
      : currentItem?.cut;
    return buildPreviewViewportFramingStyle(targetCut?.framing);
  }, [isSingleMode, focusCutData?.cut, currentItem?.cut]);

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
  const showSingleModeSaveButton = isSingleModeVideo && inPoint !== null && outPoint !== null && !!onClipSave;

  // Single Mode progress
  const singleModeProgressPercent = singleModePlaybackDuration > 0
    ? (singleModePlaybackTime / singleModePlaybackDuration) * 100
    : 0;

  // ===== SINGLE MODE RENDER =====
  if (isSingleMode) {
    return (
      <div className="preview-modal" ref={modalRef} onMouseDown={handleContainerMouseDown}>
        <div className="preview-backdrop" onClick={onClose} />
        <div className="preview-container preview-container--compact">
          {/* Display area */}
          <div
            className="preview-display preview-display--expanded"
            ref={displayContainerRef}
            onMouseEnter={showOverlayNow}
            onMouseMove={showOverlayNow}
            onMouseLeave={scheduleHideOverlay}
          >
            {/* Minimal header overlay */}
            <div className="preview-header preview-header--compact">
              <div className="preview-header-left">
                <span className="preview-title">{asset.name}</span>
                {isAssetOnlyPreview && (
                  <span className="preview-badge">Asset Preview</span>
                )}
              </div>
              <div className="preview-header-right">
                <button className="preview-close-btn" onClick={onClose} title="Close (Esc)">
                  <X size={20} />
                </button>
              </div>
            </div>

            {isLoading ? (
              <div className="preview-placeholder">
                <div className="loading-spinner" />
                <p>Loading {isSingleModeVideo ? 'video' : 'image'}...</p>
              </div>
            ) : isSingleModeVideo && videoObjectUrl?.url ? (
              (() => {
                const viewportStyle = getViewportStyle();
                const videoContent = (
                  <video
                    ref={videoRef}
                    src={videoObjectUrl.url}
                    className="preview-media"
                    onClick={toggleSingleModePlay}
                    onTimeUpdate={handleSingleModeTimeUpdate}
                    onLoadedMetadata={handleSingleModeLoadedMetadata}
                    onPlay={() => setSingleModeIsPlaying(true)}
                    onPause={() => setSingleModeIsPlaying(false)}
                    onEnded={handleSingleModeVideoEnded}
                  />
                );

                if (viewportStyle) {
                  return (
                    <div
                      className="resolution-viewport"
                      style={{
                        width: viewportStyle.width,
                        height: viewportStyle.height,
                        ...currentFraming,
                      }}
                    >
                      <div className="resolution-label">
                        {selectedResolution.name} ({selectedResolution.width}×{selectedResolution.height})
                      </div>
                      {videoContent}
                    </div>
                  );
                }

                return (
                  <>
                    {videoContent}
                    {/* Play overlay */}
                    {!isPlaying && !isLoading && (
                      <div className="play-overlay" onClick={toggleSingleModePlay}>
                        <Play size={40} />
                      </div>
                    )}
                  </>
                );
              })()
            ) : isSingleModeImage && singleModeImageData ? (
              (() => {
                const viewportStyle = getViewportStyle();
                const imageContent = sequenceMediaElement ?? (
                  <img
                    src={singleModeImageData}
                    alt={asset?.name || 'Preview'}
                    className="preview-media"
                  />
                );

                if (viewportStyle) {
                  return (
                    <div
                      className="resolution-viewport"
                      style={{
                        width: viewportStyle.width,
                        height: viewportStyle.height,
                        ...currentFraming,
                      }}
                    >
                      <div className="resolution-label">
                        {selectedResolution.name} ({selectedResolution.width}×{selectedResolution.height})
                      </div>
                      {imageContent}
                    </div>
                  );
                }

                return imageContent;
              })()
            ) : (
              <div className="preview-placeholder">
                <p>Failed to load {isSingleModeVideo ? 'video' : 'image'}</p>
              </div>
            )}

            {/* Overlay controls */}
            <div
              className={`preview-overlay ${showOverlay ? 'is-visible' : ''}`}
              onMouseEnter={showOverlayNow}
              onMouseLeave={scheduleHideOverlay}
            >
              <div className="preview-overlay-row preview-overlay-row--top">
                <div className="preview-overlay-left">
                  {previewResolutionLabel && (
                    <span className="preview-resolution-badge">{previewResolutionLabel}</span>
                  )}
                </div>
                <div className="preview-overlay-right">
                  <select
                    className="preview-resolution-select"
                    value={selectedResolution.name}
                    onChange={(e) => {
                      const preset = RESOLUTION_PRESETS.find(p => p.name === e.target.value);
                      if (preset) {
                        setSelectedResolution(preset);
                        onResolutionChange?.(preset);
                      }
                    }}
                    title="Resolution Simulation"
                  >
                    {RESOLUTION_PRESETS.map(preset => (
                      <option key={preset.name} value={preset.name}>
                        {preset.name}{preset.width > 0 ? ` (${preset.width}×${preset.height})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="preview-overlay-row preview-overlay-row--bottom">
                {/* Progress bar with time display */}
                {(isSingleModeVideo || isSingleModeImage) && (
                  <div className="preview-progress">
                    <div
                      className="preview-progress-bar preview-progress-bar--scrub"
                      ref={progressBarRef}
                      onClick={handleSingleModeProgressClick}
                    >
                      <PlaybackRangeMarkers
                        inPoint={inPoint}
                        outPoint={outPoint}
                        duration={singleModePlaybackDuration}
                        showMilliseconds={isSingleModeVideo}
                        focusedMarker={focusedMarker}
                        onMarkerFocus={handleMarkerFocus}
                        onMarkerDrag={handleMarkerDrag}
                        onMarkerDragEnd={handleMarkerDragEnd}
                        progressBarRef={progressBarRef}
                      />
                      <div className="preview-progress-fill" style={{ width: `${singleModeProgressPercent}%` }} />
                      <div className="preview-progress-handle" style={{ left: `${singleModeProgressPercent}%` }} />
                    </div>
                    <div className="preview-progress-info">
                      <TimeDisplay
                        currentTime={singleModePlaybackTime}
                        totalDuration={singleModePlaybackDuration}
                        showMilliseconds={isSingleModeVideo}
                      />
                    </div>
                  </div>
                )}

                {/* Controls */}
                <div className="preview-controls-row">
                  <button
                    className="preview-ctrl-btn"
                    onClick={isSingleModeVideo ? () => skip(-5) : () => skip(-5)}
                    title="Rewind 5s (←)"
                  >
                    <SkipBack size={18} />
                  </button>
                  <button
                    className="preview-ctrl-btn preview-ctrl-btn--primary"
                    onClick={isSingleModeVideo ? toggleSingleModePlay : handlePlayPause}
                    title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                  >
                    {isPlaying ? <Pause size={22} /> : <Play size={22} />}
                  </button>
                  <button
                    className="preview-ctrl-btn"
                    onClick={isSingleModeVideo ? () => skip(5) : () => skip(5)}
                    title="Forward 5s (→)"
                  >
                    <SkipForward size={18} />
                  </button>
                  <div className="preview-ctrl-divider" />
                  <button
                    className={`preview-ctrl-btn preview-ctrl-btn--text ${inPoint !== null ? 'is-active' : ''}`}
                    onClick={isSingleModeVideo ? handleSingleModeSetInPoint : handleSetInPoint}
                    title={inPoint !== null ? 'Clear IN point (I)' : 'Set IN point (I)'}
                  >
                    I
                  </button>
                  <button
                    className={`preview-ctrl-btn preview-ctrl-btn--text ${outPoint !== null ? 'is-active' : ''}`}
                    onClick={isSingleModeVideo ? handleSingleModeSetOutPoint : handleSetOutPoint}
                    title={outPoint !== null ? 'Clear OUT point (O)' : 'Set OUT point (O)'}
                  >
                    O
                  </button>
                  {isSingleModeVideo && showSingleModeSaveButton && (
                    <button
                      className="preview-ctrl-btn"
                      onClick={handleSingleModeSave}
                      title="Save clip"
                    >
                      <Scissors size={18} />
                    </button>
                  )}
                  <div className="preview-ctrl-divider" />
                  {isSingleModeVideo && onFrameCapture && (
                    <button
                      className="preview-ctrl-btn"
                      onClick={handleSingleModeCaptureFrame}
                      title="Capture frame"
                    >
                      <Camera size={18} />
                    </button>
                  )}
                  <button
                    className={`preview-ctrl-btn ${isLooping ? 'is-active' : ''}`}
                    onClick={toggleLooping}
                    title={`Loop (L) - ${isLooping ? 'On' : 'Off'}`}
                  >
                    <Repeat size={16} />
                  </button>
                  <VolumeControl
                    volume={globalVolume}
                    isMuted={globalMuted}
                    onVolumeChange={setGlobalVolume}
                    onMuteToggle={toggleGlobalMute}
                  />
                  {isSingleModeVideo && (
                    <button
                      className="preview-ctrl-btn preview-ctrl-btn--text"
                      onClick={() => cycleSpeed('up')}
                      title="Speed ([/])"
                    >
                      {playbackSpeed.toFixed(1)}x
                    </button>
                  )}
                  <button
                    className="preview-ctrl-btn"
                    onClick={toggleFullscreen}
                    title={isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
                  >
                    <Maximize size={16} />
                  </button>
                  {miniToastElement}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== SEQUENCE MODE RENDER =====

  // Empty state for Sequence Mode
  if (items.length === 0) {
    return (
      <div className="preview-modal" ref={modalRef}>
        <div className="preview-backdrop" onClick={onClose} />
        <div className="preview-container">
          <div className="preview-header preview-header--static">
            <span>Preview</span>
            <button className="preview-close-btn" onClick={onClose} title="Close (Esc)">
              <X size={20} />
            </button>
          </div>
          <div className="preview-empty">
            {missingFocusedCut ? (
              <>
                <p>Selected cut is no longer available</p>
                <p className="hint">The cut may have been deleted or moved.</p>
              </>
            ) : (
              <>
                <p>No cuts to preview</p>
                <p className="hint">Add some images or videos to your timeline first.</p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="preview-modal" ref={modalRef} onMouseDown={handleContainerMouseDown}>
      <div className="preview-backdrop" onClick={onClose} />
      <div className="preview-container preview-container--compact">
        {/* Display area */}
        <div
          className="preview-display preview-display--expanded"
          ref={displayContainerRef}
          onMouseEnter={showOverlayNow}
          onMouseMove={showOverlayNow}
          onMouseLeave={scheduleHideOverlay}
        >
          {/* Minimal header overlay */}
          <div className="preview-header preview-header--compact">
            <div className="preview-header-left">
              <span className="preview-badge">{currentIndex + 1}/{items.length}</span>
              <span className="preview-title">{currentItem?.sceneName}</span>
              <span className="preview-subtitle">Cut {(currentItem?.cutIndex || 0) + 1}</span>
            </div>
            <div className="preview-header-right">
              <button className="preview-close-btn" onClick={onClose} title="Close (Esc)">
                <X size={20} />
              </button>
            </div>
          </div>

          {(() => {
            const viewportStyle = getViewportStyle();
            const content = sequenceMediaElement ?? (() => {
              if (currentItem?.cut.asset?.type === 'video') {
                return (
                  <div className="preview-placeholder">
                    <p>Loading video...</p>
                  </div>
                );
              }
              return (
                <div className="preview-placeholder">
                  <p>No preview available</p>
                </div>
              );
            })();

            if (viewportStyle) {
              return (
                <div
                  className="resolution-viewport"
                  style={{
                    width: viewportStyle.width,
                    height: viewportStyle.height,
                    ...currentFraming,
                  }}
                >
                  <div className="resolution-label">
                    {selectedResolution.name} ({selectedResolution.width}×{selectedResolution.height})
                  </div>
                  {content}
                  {/* Buffering overlay */}
                  {isBuffering && (
                    <div className="buffering-overlay">
                      <Loader2 size={48} className="buffering-spinner" />
                      <span>Loading...</span>
                    </div>
                  )}
                </div>
              );
            }

            return (
              <>
                {content}
                {/* Buffering overlay */}
                {isBuffering && (
                  <div className="buffering-overlay">
                    <Loader2 size={48} className="buffering-spinner" />
                    <span>Loading...</span>
                  </div>
                )}
              </>
            );
          })()}

          {/* Overlay controls */}
          <div
            className={`preview-overlay ${showOverlay ? 'is-visible' : ''}`}
            onMouseEnter={showOverlayNow}
            onMouseLeave={scheduleHideOverlay}
          >
            <div className="preview-overlay-row preview-overlay-row--top">
              <div className="preview-overlay-left">
                {previewResolutionLabel && (
                  <span className="preview-resolution-badge">{previewResolutionLabel}</span>
                )}
              </div>
              <div className="preview-overlay-right">
                <select
                  className="preview-resolution-select"
                  value={selectedResolution.name}
                  onChange={(e) => {
                    const preset = RESOLUTION_PRESETS.find(p => p.name === e.target.value);
                    if (preset) {
                      setSelectedResolution(preset);
                      onResolutionChange?.(preset);
                    }
                  }}
                  title="Resolution Simulation"
                >
                  {RESOLUTION_PRESETS.map(preset => (
                    <option key={preset.name} value={preset.name}>
                      {preset.name}{preset.width > 0 ? ` (${preset.width}×${preset.height})` : ''}
                    </option>
                  ))}
                </select>
                <button
                  className="preview-icon-btn"
                  onClick={handleExportFull}
                  disabled={isExporting || items.length === 0}
                  title="Export full sequence to MP4"
                >
                  <Download size={16} />
                </button>
              </div>
            </div>

            <div className="preview-overlay-row preview-overlay-row--bottom">
              {/* Progress bar with time display */}
              <div className="preview-progress">
                <div
                  className="preview-progress-bar preview-progress-bar--scrub"
                  ref={progressBarRef}
                  onMouseDown={handleProgressBarMouseDown}
                  onMouseMove={handleProgressBarHover}
                  onMouseLeave={handleProgressBarLeave}
                >
                  <PlaybackRangeMarkers
                    inPoint={inPoint}
                    outPoint={outPoint}
                    duration={sequenceTotalDuration}
                    showMilliseconds={false}
                    focusedMarker={focusedMarker}
                    onMarkerFocus={handleMarkerFocus}
                    onMarkerDrag={handleMarkerDrag}
                    onMarkerDragEnd={handleMarkerDragEnd}
                    progressBarRef={progressBarRef}
                  />
                  <div
                    ref={progressFillRef}
                    className="preview-progress-fill"
                    style={{ width: `${globalProgress}%` }}
                  />
                  <div
                    ref={progressHandleRef}
                    className="preview-progress-handle"
                    style={{ left: `${globalProgress}%` }}
                  />
                  {hoverTime && (
                    <div className="preview-progress-tooltip">
                      {hoverTime}
                    </div>
                  )}
                </div>
                <div className="preview-progress-info">
                  <TimeDisplay currentTime={sequenceCurrentTime} totalDuration={sequenceTotalDuration} />
                </div>
              </div>

              {/* Controls */}
              <div className="preview-controls-row">
                <button
                  className="preview-ctrl-btn"
                  onClick={goToPrev}
                  disabled={currentIndex === 0}
                  title="Previous Cut"
                >
                  <SkipBack size={18} />
                </button>
                <button
                  className="preview-ctrl-btn preview-ctrl-btn--primary"
                  onClick={handlePlayPause}
                  title="Play/Pause (Space)"
                >
                  {isPlaying ? <Pause size={22} /> : <Play size={22} />}
                </button>
                <button
                  className="preview-ctrl-btn"
                  onClick={goToNext}
                  disabled={currentIndex >= items.length - 1}
                  title="Next Cut"
                >
                  <SkipForward size={18} />
                </button>
                <div className="preview-ctrl-divider" />
                <button
                  className={`preview-ctrl-btn preview-ctrl-btn--text ${inPoint !== null ? 'is-active' : ''}`}
                  onClick={handleSetInPoint}
                  title={inPoint !== null ? 'Clear IN point (I)' : 'Set IN point (I)'}
                >
                  I
                </button>
                <button
                  className={`preview-ctrl-btn preview-ctrl-btn--text ${outPoint !== null ? 'is-active' : ''}`}
                  onClick={handleSetOutPoint}
                  title={outPoint !== null ? 'Clear OUT point (O)' : 'Set OUT point (O)'}
                >
                  O
                </button>
                <div className="preview-ctrl-divider" />
                <button
                  className={`preview-ctrl-btn ${isLooping ? 'is-active' : ''}`}
                  onClick={toggleLooping}
                  title={`Loop (L) - ${isLooping ? 'On' : 'Off'}`}
                >
                  <Repeat size={16} />
                </button>
                <VolumeControl
                  volume={globalVolume}
                  isMuted={globalMuted}
                  onVolumeChange={setGlobalVolume}
                  onMuteToggle={toggleGlobalMute}
                />
                <button
                  className="preview-ctrl-btn"
                  onClick={toggleFullscreen}
                  title={isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
                >
                  <Maximize size={16} />
                </button>
                {miniToastElement}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
