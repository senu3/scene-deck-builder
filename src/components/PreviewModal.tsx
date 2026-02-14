import { useEffect, useLayoutEffect, useState, useCallback, useRef, useMemo, type CSSProperties } from 'react';
import { X, Play, Pause, SkipBack, SkipForward, Download, Loader2, Repeat, Maximize, Scissors, Camera, MessageSquare, SlidersHorizontal } from 'lucide-react';
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
  selectSetAutoClipMetadata,
} from '../store/selectors';
import type { Asset, Cut, AutoClipMetadata } from '../types';
import { useHistoryStore } from '../store/historyStore';
import { AutoClipVideoCutCommand, UpdateCutSubtitleCommand } from '../store/commands';
import { createVideoObjectUrl } from '../utils/videoUtils';
import { formatTime, cyclePlaybackSpeed } from '../utils/timeUtils';
import { resolveCutAsset, resolveCutThumbnail } from '../utils/assetResolve';
import { AudioManager, analyzeAudioRms } from '../utils/audioUtils';
import { createImageMediaSource, createLipSyncImageMediaSource, createVideoMediaSource } from '../utils/previewMedia';
import { getLipSyncFrameAssetIds } from '../utils/lipSyncUtils';
import { useSequencePlaybackController } from '../utils/previewPlaybackController';
import { getThumbnail } from '../utils/thumbnailCache';
import { buildSequenceItemsForCuts } from '../utils/exportSequence';
import { resolvePreviewAudioTracks } from '../utils/previewAudioTracks';
import { DEFAULT_EXPORT_RESOLUTION } from '../constants/export';
import { EXPORT_FRAMING_DEFAULTS } from '../constants/framing';
import { buildPreviewViewportFramingStyle } from '../utils/previewFraming';
import { resolveSubtitleVisibility, normalizeSubtitleRange } from '../utils/subtitleUtils';
import { getSubtitleStyleSettings } from '../utils/subtitleStyleSettings';
import { getSubtitleStyleForExport } from '../features/export/subtitleStyle';
import { getScenesInOrder } from '../utils/sceneOrder';
import {
  addExcludeRange,
  buildClipSegments,
  extractHistogramCandidates,
  extractRmsCandidates,
  filterCandidatesByExcludeRanges,
  makeAutoClipParamsHash,
  normalizeExcludeRanges,
  removeExcludeRange,
  toggleNearestExcludeRange,
  type TimeRange as AutoClipTimeRange,
} from '../utils/autoClip';
import {
  PlaybackRangeMarkers,
  VolumeControl,
  TimeDisplay,
} from './shared';
import type { FocusedMarker } from './shared';
import { useMiniToast } from '../ui';
import SubtitleModal from './SubtitleModal';
import './PreviewModal.css';
import './shared/playback-controls.css';

// 再生保証付き LazyLoad constants
const PLAY_SAFE_AHEAD = 2.0; // seconds - minimum buffer required for playback
const PRELOAD_AHEAD = 30.0; // seconds - preload this much ahead for smoother playback
const INITIAL_PRELOAD_ITEMS = 5; // number of items to preload initially
const FRAME_DURATION = 1 / 30;
const AUTO_CLIP_SAMPLE_FPS = 4;
const AUTO_CLIP_SCALE_WIDTH = 64;
const AUTO_CLIP_SCALE_HEIGHT = 36;
const AUTO_CLIP_BRUSH_MIN_SEC = 0.3;

function clampToDuration(time: number, duration: number): number {
  return Math.max(0, Math.min(duration, time));
}

function normalizeTimeRange(start: number, end: number): AutoClipTimeRange {
  return {
    start: Math.min(start, end),
    end: Math.max(start, end),
  };
}

function constrainMarkerTime(
  marker: 'in' | 'out',
  candidateTime: number,
  duration: number,
  inPoint: number | null,
  outPoint: number | null,
): number {
  let next = clampToDuration(candidateTime, duration);
  if (marker === 'in' && outPoint !== null) {
    next = Math.min(next, outPoint);
  }
  if (marker === 'out' && inPoint !== null) {
    next = Math.max(next, inPoint);
  }
  return next;
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  if (element.isContentEditable) return true;
  const tagName = element.tagName;
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
}

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
  onClipSave?: (inPoint: number, outPoint: number) => void;
  onFrameCapture?: (timestamp: number) => Promise<string | void> | void;
}

// Base props shared by both modes
interface BasePreviewModalProps {
  onClose: () => void;
  exportResolution?: ResolutionPresetType;
  onResolutionChange?: (resolution: ResolutionPresetType) => void;
  focusCutId?: string;
  onRangeChange?: (range: { inPoint: number | null; outPoint: number | null }) => void;
  onExportSequence?: (cuts: Cut[], resolution: { width: number; height: number }) => Promise<void> | void;
  openSubtitleModalOnMount?: boolean;
  onSubtitleModalOpenHandled?: () => void;
}

// PreviewModal can be called in Single Mode (with asset) or Sequence Mode (without asset)
type PreviewModalProps = BasePreviewModalProps & Partial<SingleModeProps>;

interface PreviewItem {
  cut: Cut;
  sceneId: string;
  sceneName: string;
  sceneIndex: number;
  cutIndex: number;
  sceneStartAbs: number;
  previewOffsetSec: number;
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
  openSubtitleModalOnMount,
  onSubtitleModalOpenHandled,
  // Single Mode props
  asset,
  initialInPoint,
  initialOutPoint,
  onRangeChange,
  onClipSave,
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
  const setAutoClipMetadata = useStore(selectSetAutoClipMetadata);
  const { executeCommand } = useHistoryStore();

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
  const [showSubtitleModal, setShowSubtitleModal] = useState(false);
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
  const [autoClipOpen, setAutoClipOpen] = useState(true);
  const [autoClipSource, setAutoClipSource] = useState<'hist' | 'rms' | 'both'>('both');
  const [histThreshold, setHistThreshold] = useState(0.18);
  const [rmsThreshold, setRmsThreshold] = useState(0.12);
  const [minGapSec, setMinGapSec] = useState(0.8);
  const [minCandidatePercent, setMinCandidatePercent] = useState(10);
  const [groupResults, setGroupResults] = useState(true);
  const [excludeRanges, setExcludeRanges] = useState<AutoClipTimeRange[]>([]);
  const [histScores, setHistScores] = useState<number[]>([]);
  const [rmsScores, setRmsScores] = useState<number[]>([]);
  const [candidatesHist, setCandidatesHist] = useState<number[]>([]);
  const [candidatesRms, setCandidatesRms] = useState<number[]>([]);
  const [autoClipBusy, setAutoClipBusy] = useState(false);

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
  const autoClipBarRef = useRef<HTMLDivElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const progressHandleRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const displayContainerRef = useRef<HTMLDivElement>(null);
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [sequenceMediaElement, setSequenceMediaElement] = useState<JSX.Element | null>(null);
  const autoClipDragRef = useRef<{
    mode: 'add' | 'erase';
    startTime: number;
    moved: boolean;
    currentRange: AutoClipTimeRange | null;
  } | null>(null);
  const autoClipDebounceTimerRef = useRef<number | null>(null);

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
  const sequenceAudioSourceKeyRef = useRef<string | null>(null);

  // Unload audio on unmount (but do NOT dispose the AudioManager)
  useEffect(() => {
    return () => {
      singleAudioManagerRef.current.unload();
      sequenceAudioManagerRef.current.unload();
      sequenceAudioSourceKeyRef.current = null;
    };
  }, []);

  const singleSceneAudioTrack = useMemo(() => {
    const sceneId = focusCutData?.scene.id ?? null;
    const previewOffsetSec = focusCutData
      ? focusCutData.scene.cuts
          .slice(0, focusCutData.cutIndex)
          .reduce((acc, item) => acc + item.displayTime, 0)
      : 0;
    return resolvePreviewAudioTracks({
      sceneId,
      sceneStartAbs: 0,
      previewOffsetSec,
      metadataStore,
      getAssetById: getAsset,
    })[0] || null;
  }, [focusCutData, metadataStore, getAsset]);

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

  const notifyRangeChange = useCallback((nextInPoint: number | null, nextOutPoint: number | null) => {
    onRangeChange?.({ inPoint: nextInPoint, outPoint: nextOutPoint });
  }, [onRangeChange]);

  const setMarkerTimeAndSeek = useCallback((marker: 'in' | 'out', newTime: number) => {
    const duration = usesSequenceController
      ? sequenceState.totalDuration
      : singleModeDuration;
    const constrainedTime = constrainMarkerTime(marker, newTime, duration, inPoint, outPoint);

    if (marker === 'in') {
      if (!usesSequenceController) {
        setSingleModeInPoint(constrainedTime);
        notifyRangeChange(constrainedTime, outPoint);
      } else {
        setSequenceRange(constrainedTime, outPoint ?? null);
        notifyRangeChange(constrainedTime, outPoint ?? null);
      }
    } else {
      if (!usesSequenceController) {
        setSingleModeOutPoint(constrainedTime);
        notifyRangeChange(inPoint, constrainedTime);
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
    setMarkerTimeAndSeek(marker, newTime);
  }, [setMarkerTimeAndSeek]);

  // Handle marker drag end
  const handleMarkerDragEnd = useCallback(() => {
    setFocusedMarker(null);
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
    if (singleModeInPoint !== null) {
      setSingleModeInPoint(null);
      return;
    }
    setSingleModeInPoint(singleModeCurrentTime);
    notifyRangeChange(singleModeCurrentTime, outPoint);
  }, [isSingleModeVideo, singleModeInPoint, singleModeCurrentTime, outPoint, notifyRangeChange]);

  const handleSingleModeSetOutPoint = useCallback(() => {
    if (!isSingleModeVideo) return;
    if (singleModeOutPoint !== null) {
      setSingleModeOutPoint(null);
      return;
    }
    setSingleModeOutPoint(singleModeCurrentTime);
    notifyRangeChange(inPoint, singleModeCurrentTime);
  }, [isSingleModeVideo, singleModeOutPoint, singleModeCurrentTime, inPoint, notifyRangeChange]);

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

  const autoClipTarget = useMemo(() => {
    if (!isSingleModeVideo || !focusCutData?.cut || !asset) return null;
    if (!asset.path || !asset.path.trim()) return null;
    const cut = focusCutData.cut;
    const clipStart = cut.isClip && cut.inPoint !== undefined ? Math.min(cut.inPoint, cut.outPoint ?? cut.inPoint) : 0;
    const fallbackDuration = Number.isFinite(asset.duration) && (asset.duration as number) > 0
      ? (asset.duration as number)
      : singleModeDuration;
    const clipEnd = cut.isClip && cut.outPoint !== undefined
      ? Math.max(cut.inPoint ?? 0, cut.outPoint)
      : Math.max(clipStart, fallbackDuration);
    const duration = Math.max(0, clipEnd - clipStart);
    return {
      sceneId: focusCutData.scene.id,
      cutId: cut.id,
      assetId: asset.id,
      sourcePath: asset.path,
      clipStart,
      clipEnd,
      duration,
    };
  }, [isSingleModeVideo, focusCutData, asset, singleModeDuration]);

  const autoClipCandidates = useMemo(() => {
    if (!autoClipTarget) return [];
    const combined = autoClipSource === 'hist'
      ? candidatesHist
      : autoClipSource === 'rms'
        ? candidatesRms
        : Array.from(new Set([...candidatesHist, ...candidatesRms])).sort((a, b) => a - b);
    const normalizedExcludes = normalizeExcludeRanges(excludeRanges, autoClipTarget.duration, AUTO_CLIP_BRUSH_MIN_SEC);
    return filterCandidatesByExcludeRanges(combined, normalizedExcludes)
      .filter((time) => time > 0.5 && time < autoClipTarget.duration - 0.5)
      .sort((a, b) => a - b);
  }, [autoClipTarget, autoClipSource, candidatesHist, candidatesRms, excludeRanges]);

  const analyzeAutoClip = useCallback(async () => {
    if (!autoClipTarget || !window.electronAPI) return;
    if (!autoClipTarget.sourcePath || !autoClipTarget.sourcePath.trim()) {
      setHistScores([]);
      setRmsScores([]);
      setCandidatesHist([]);
      setCandidatesRms([]);
      return;
    }

    const metadata = metadataStore?.metadata[autoClipTarget.assetId];
    const histParamsHash = makeAutoClipParamsHash({
      sourcePath: autoClipTarget.sourcePath,
      start: autoClipTarget.clipStart.toFixed(3),
      end: autoClipTarget.clipEnd.toFixed(3),
      fps: AUTO_CLIP_SAMPLE_FPS,
      width: AUTO_CLIP_SCALE_WIDTH,
      height: AUTO_CLIP_SCALE_HEIGHT,
    });

    const rmsParamsHash = makeAutoClipParamsHash({
      sourcePath: autoClipTarget.sourcePath,
      start: autoClipTarget.clipStart.toFixed(3),
      end: autoClipTarget.clipEnd.toFixed(3),
      smoothingMs: 240,
      fps: 60,
    });
    const minPeakRatio = Math.max(0, Math.min(1, minCandidatePercent / 100));

    setAutoClipBusy(true);
    try {
      let nextAutoClipCache: AutoClipMetadata = { ...(metadata?.autoClip || {}) };

      if (autoClipSource !== 'rms') {
        let histMeta = nextAutoClipCache.hist;
        if (!histMeta || histMeta.paramsHash !== histParamsHash || histMeta.sampleFps !== AUTO_CLIP_SAMPLE_FPS) {
          const result = await window.electronAPI.analyzeVideoHistogram({
            sourcePath: autoClipTarget.sourcePath,
            startSec: autoClipTarget.clipStart,
            endSec: autoClipTarget.clipEnd,
            sampleFps: AUTO_CLIP_SAMPLE_FPS,
            width: AUTO_CLIP_SCALE_WIDTH,
            height: AUTO_CLIP_SCALE_HEIGHT,
          });
          if (!result.success || !result.scores || !result.sampleFps) {
            console.warn('[AutoClip] histogram analysis skipped:', result.error || 'unknown error');
            setHistScores([]);
            setCandidatesHist([]);
            return;
          }
          const candidates = extractHistogramCandidates(result.scores, histThreshold, minGapSec, result.sampleFps, 0.5, minPeakRatio);
          histMeta = {
            sampleFps: result.sampleFps,
            scores: result.scores,
            candidates,
            paramsHash: histParamsHash,
          };
          nextAutoClipCache = { ...nextAutoClipCache, hist: histMeta };
          setAutoClipMetadata(autoClipTarget.assetId, nextAutoClipCache);
        }
        setHistScores(histMeta.scores);
        setCandidatesHist(extractHistogramCandidates(histMeta.scores, histThreshold, minGapSec, histMeta.sampleFps, 0.5, minPeakRatio));
      }

      if (autoClipSource !== 'hist') {
        let rmsMeta = nextAutoClipCache.rms;
        if (!rmsMeta || rmsMeta.paramsHash !== rmsParamsHash || !Array.isArray(rmsMeta.series)) {
          const analysis = await analyzeAudioRms(autoClipTarget.sourcePath, 60);
          if (!analysis) {
            setRmsScores([]);
            setCandidatesRms([]);
            return;
          }
          const startIndex = Math.max(0, Math.floor(autoClipTarget.clipStart * analysis.fps));
          const endIndex = Math.min(analysis.rms.length, Math.ceil(autoClipTarget.clipEnd * analysis.fps));
          const localRms = analysis.rms.slice(startIndex, endIndex);
          const peak = extractRmsCandidates(localRms, {
            fps: analysis.fps,
            threshold: rmsThreshold,
            minGapSec,
            smoothingMs: 240,
            minPeakRatio,
          });
          rmsMeta = {
            fps: analysis.fps,
            smoothingMs: 240,
            series: localRms,
            peaks: peak.peaks,
            candidates: peak.candidates,
            paramsHash: rmsParamsHash,
          };
          nextAutoClipCache = { ...nextAutoClipCache, rms: rmsMeta };
          setAutoClipMetadata(autoClipTarget.assetId, nextAutoClipCache);
          setRmsScores(peak.smoothed);
          setCandidatesRms(peak.candidates);
        } else {
          const peak = extractRmsCandidates(rmsMeta.series, {
            fps: rmsMeta.fps,
            threshold: rmsThreshold,
            minGapSec,
            smoothingMs: rmsMeta.smoothingMs,
            minPeakRatio,
          });
          setCandidatesRms(peak.candidates);
          setRmsScores(peak.smoothed);
        }
      }
    } catch (error) {
      console.error('[AutoClip] analyze failed:', error);
      setHistScores([]);
      setRmsScores([]);
      setCandidatesHist([]);
      setCandidatesRms([]);
    } finally {
      setAutoClipBusy(false);
    }
  }, [
    autoClipTarget,
    metadataStore,
    autoClipSource,
    histThreshold,
    minGapSec,
    minCandidatePercent,
    rmsThreshold,
    setAutoClipMetadata,
  ]);

  const applyAutoClip = useCallback(() => {
    if (!autoClipTarget || autoClipCandidates.length === 0) return;
    const segments = buildClipSegments(autoClipTarget.duration, autoClipCandidates, 0.2);
    if (segments.length === 0) return;

    const ranges = segments.map((segment) => ({
      inPoint: autoClipTarget.clipStart + segment.start,
      outPoint: autoClipTarget.clipStart + segment.end,
    }));

    executeCommand(new AutoClipVideoCutCommand(autoClipTarget.sceneId, autoClipTarget.cutId, ranges, groupResults)).catch((error) => {
      console.error('Failed to apply auto clip:', error);
    });
  }, [autoClipTarget, autoClipCandidates, executeCommand, groupResults]);

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

    const attachedAudio = singleSceneAudioTrack?.asset || getAttachedAudioForCut(focusCutData?.cut ?? null);
    singleAudioManagerRef.current.unload();
    setAudioLoaded(false);
    singleAudioPlayingRef.current = false;

    if (!attachedAudio?.path) {
      sequenceAudioManagerRef.current.unload();
      setAudioLoaded(false);
      sequenceAudioPlayingRef.current = false;
      sequenceAudioSourceKeyRef.current = null;
      return;
    }

    const manager = singleAudioManagerRef.current;
    if (manager.isDisposed()) return;

    const loadAudio = async () => {
      const offset = singleSceneAudioTrack ? 0 : getAudioOffsetForCut(focusCutData?.cut ?? null);
      manager.setOffset(offset);
      const expectedLoadId = manager.getLoadId() + 1;
      const loaded = await manager.load(attachedAudio.path);
      if (!loaded) return;
      if (manager.getActiveLoadId() === expectedLoadId) {
        setAudioLoaded(true);
      }
    };

    loadAudio();
  }, [isSingleMode, asset?.id, hasCutContext, focusCutData?.cut, getAttachedAudioForCut, getAudioOffsetForCut, singleSceneAudioTrack]);

  // Sync Single Mode audio with video playback (only on play/pause change)
  useEffect(() => {
    if (!isSingleMode || !audioLoaded) return;
    const manager = singleAudioManagerRef.current;

    if (isSingleModeVideo) {
      if (singleModeIsPlaying) {
        const currentTime = videoRef.current?.currentTime ?? 0;
        const sceneStartOffset = singleSceneAudioTrack?.previewOffsetSec ?? 0;
        manager.play(currentTime + sceneStartOffset);
      } else {
        manager.pause();
      }
      singleAudioPlayingRef.current = singleModeIsPlaying;
      return;
    }

    if (sequenceState.isPlaying && !sequenceState.isBuffering) {
      if (!singleAudioPlayingRef.current) {
        const sceneStartOffset = singleSceneAudioTrack?.previewOffsetSec ?? 0;
        manager.play(Math.max(0, sequenceSelectors.getAbsoluteTime() + sceneStartOffset));
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
    singleSceneAudioTrack,
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
    const cutAsset = resolveAssetForCut(item.cut);
    if (cutAsset?.type !== 'video') return null;
    return cutAsset.id ?? item.cut.assetId ?? null;
  }, [items, resolveAssetForCut]);

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

    const cutAsset = resolveAssetForCut(item.cut);
    if (cutAsset?.type === 'video') {
      const assetId = getVideoAssetId(index);
      if (!assetId) return false;
      return videoUrlCacheRef.current.has(assetId);
    } else {
      // Images are ready if thumbnail is available
      return !!item.thumbnail;
    }
  }, [items, getVideoAssetId, resolveAssetForCut]);

  // Helper: Preload items (video URLs or image data)
  const preloadItems = useCallback(async (indices: number[]): Promise<void> => {
    const preloadPromises: Promise<void>[] = [];

    for (const index of indices) {
      const item = items[index];
      if (!item) continue;

      const cutAsset = resolveAssetForCut(item.cut);
      if (cutAsset?.type === 'video' && cutAsset.path) {
        const assetId = getVideoAssetId(index);
        if (!assetId) continue;

        // Skip if already ready or currently being preloaded
        if (readyItemsRef.current.has(assetId) || preloadingRef.current.has(assetId)) continue;

        if (!videoUrlCacheRef.current.has(assetId)) {
          preloadingRef.current.add(assetId);
          preloadPromises.push(
            createVideoObjectUrl(cutAsset.path).then(url => {
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
        const assetId = cutAsset?.id ?? item.cut.assetId;
        if (assetId) {
          readyItemsRef.current.add(assetId);
        }
      }
    }

    await Promise.all(preloadPromises);
  }, [items, getVideoAssetId, resolveAssetForCut]);

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
      const thumbnail = singleModeImageData ?? resolveThumbnailForCut(singleCut) ?? null;

      setItems([{
        cut: singleCut,
        sceneId: focusCutData?.scene.id || 'single',
        sceneName: asset.name ?? 'Single',
        sceneIndex: 0,
        cutIndex: 0,
        sceneStartAbs: 0,
        previewOffsetSec: 0,
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
        const cutAsset = resolveAssetForCut(cut);
        if (!cutAsset) {
          setItems([]);
          return;
        }

        const lipSyncSettings = cut.isLipSync && cutAsset.id
          ? getLipSyncSettingsForAsset(cutAsset.id)
          : undefined;

        let thumbnail: string | null = resolveThumbnailForCut(cut) ?? null;

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
          sceneId: scene.id,
          sceneName: scene.name,
          sceneIndex,
          cutIndex,
          sceneStartAbs: 0,
          previewOffsetSec: scene.cuts
            .slice(0, cutIndex)
            .reduce((acc, item) => acc + item.displayTime, 0),
          thumbnail,
        }]);
      };

      void buildFocusedItems();
      return;
    }

    const buildItems = async () => {
      const newItems: PreviewItem[] = [];
      let absoluteCursor = 0;

      const scenesToPreview = previewMode === 'scene' && selectedSceneId
        ? orderedScenes.filter(s => s.id === selectedSceneId)
        : orderedScenes;

      for (let sIdx = 0; sIdx < scenesToPreview.length; sIdx++) {
        const scene = scenesToPreview[sIdx];
        const sceneStartAbs = absoluteCursor;
        let sceneLocalCursor = 0;
        for (let cIdx = 0; cIdx < scene.cuts.length; cIdx++) {
          const cut = scene.cuts[cIdx];
          const cutAsset = resolveAssetForCut(cut);
          const lipSyncSettings = cut.isLipSync && cutAsset?.id
            ? getLipSyncSettingsForAsset(cutAsset.id)
            : undefined;

          let thumbnail: string | null = resolveThumbnailForCut(cut) ?? null;

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
            sceneId: scene.id,
            sceneName: scene.name,
            sceneIndex: sIdx,
            cutIndex: cIdx,
            sceneStartAbs,
            previewOffsetSec: 0,
            thumbnail,
          });
          sceneLocalCursor += cut.displayTime;
          absoluteCursor += cut.displayTime;
        }
        if (scene.cuts.length === 0) {
          absoluteCursor = sceneStartAbs + sceneLocalCursor;
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
    orderedScenes,
    previewMode,
    selectedSceneId,
    getAsset,
    getDisplayTimeForAsset,
    getLipSyncSettingsForAsset,
    focusCutData,
    missingFocusedCut,
    resolveAssetForCut,
    resolveThumbnailForCut,
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
      const currentAsset = currentItem ? resolveAssetForCut(currentItem.cut) : undefined;

      if (currentAsset?.type === 'video') {
        if (cachedUrl && assetId && (!videoObjectUrl || videoObjectUrl.assetId !== assetId || videoObjectUrl.url !== cachedUrl)) {
          setVideoObjectUrl({ assetId, url: cachedUrl });
        } else if (!cachedUrl && currentAsset.path && assetId) {
          // Fallback: create URL if not in cache (shouldn't happen normally)
          const url = await createVideoObjectUrl(currentAsset.path);
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
    resolveAssetForCut,
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

  const currentSequenceItem = items[currentIndex] ?? null;
  const currentSceneAudioTrack = useMemo(() => resolvePreviewAudioTracks({
    sceneId: currentSequenceItem?.sceneId ?? null,
    sceneStartAbs: currentSequenceItem?.sceneStartAbs ?? 0,
    previewOffsetSec: currentSequenceItem?.previewOffsetSec ?? 0,
    metadataStore,
    getAssetById: getAsset,
  })[0] || null, [currentSequenceItem, metadataStore, getAsset]);

  // Load attached audio when cut changes (Sequence Mode)
  useEffect(() => {
    if (isSingleMode || items.length === 0) {
      sequenceAudioManagerRef.current.unload();
      setAudioLoaded(false);
      sequenceAudioPlayingRef.current = false;
      sequenceAudioSourceKeyRef.current = null;
      return;
    }

    const currentItem = items[currentIndex];
    const currentCut = currentItem?.cut;
    if (!currentCut) {
      sequenceAudioManagerRef.current.unload();
      setAudioLoaded(false);
      sequenceAudioPlayingRef.current = false;
      sequenceAudioSourceKeyRef.current = null;
      return;
    }

    const attachedAudio = currentSceneAudioTrack?.asset || getAttachedAudioForCut(currentCut);
    const nextSourceKey = currentSceneAudioTrack
      ? `scene:${currentSceneAudioTrack.assetId}:${currentSceneAudioTrack.sceneId}`
      : `cut:${attachedAudio?.id || ''}:${currentCut.id}`;
    const shouldReload = sequenceAudioSourceKeyRef.current !== nextSourceKey;

    if (!attachedAudio?.path) return;

    const manager = sequenceAudioManagerRef.current;
    if (manager.isDisposed()) return;

    if (shouldReload) {
      manager.unload();
      setAudioLoaded(false);
      sequenceAudioPlayingRef.current = false;
      sequenceAudioSourceKeyRef.current = nextSourceKey;
    } else if (manager.isLoaded()) {
      setAudioLoaded(true);
      return;
    }

    const loadAudio = async () => {
      const offset = currentSceneAudioTrack ? 0 : getAudioOffsetForCut(currentCut);
      manager.setOffset(offset);
      const expectedLoadId = manager.getLoadId() + 1;
      const loaded = await manager.load(attachedAudio.path);
      if (!loaded) return;
      if (manager.getActiveLoadId() === expectedLoadId) {
        setAudioLoaded(true);
      }
    };

    loadAudio();
  }, [isSingleMode, currentIndex, items, getAttachedAudioForCut, getAudioOffsetForCut, currentSceneAudioTrack]);

  // Sync Sequence Mode audio with playback state (separate effect)
  useEffect(() => {
    if (isSingleMode || !audioLoaded) return;

    const manager = sequenceAudioManagerRef.current;
    const absoluteTime = Math.max(0, sequenceSelectors.getAbsoluteTime());
    const playPosition = currentSceneAudioTrack
      ? Math.max(0, absoluteTime - currentSceneAudioTrack.startAbs + currentSceneAudioTrack.previewOffsetSec)
      : absoluteTime;
    if (sequenceState.isPlaying && !sequenceState.isBuffering) {
      if (!sequenceAudioPlayingRef.current) {
        manager.play(playPosition);
        sequenceAudioPlayingRef.current = true;
      }
    } else if (sequenceAudioPlayingRef.current) {
      manager.pause();
      sequenceAudioPlayingRef.current = false;
    }
  }, [isSingleMode, audioLoaded, sequenceState.isPlaying, sequenceState.isBuffering, sequenceSelectors, currentSceneAudioTrack]);

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
    const asset = resolveAssetForCut(currentItem?.cut);
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
              const thumb = await getThumbnail(frameAsset.path, 'image', { profile: 'sequence-preview' });
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
      const assetId = asset.id ?? currentItem.cut.assetId ?? null;
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
    resolveAssetForCut,
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

  const getUiPlayheadTime = useCallback(() => {
    if (isSingleModeVideo) {
      return singleModeCurrentTime;
    }
    return sequenceSelectors.getAbsoluteTime();
  }, [isSingleModeVideo, singleModeCurrentTime, sequenceSelectors]);

  // IN/OUT point handlers
  const handleSetInPoint = useCallback(() => {
    if (items.length === 0) return;
    const currentTime = getUiPlayheadTime();
    if (isSingleModeVideo) {
      if (singleModeInPoint !== null) {
        setSingleModeInPoint(null);
      } else {
        setSingleModeInPoint(currentTime);
        notifyRangeChange(currentTime, outPoint);
      }
      return;
    }
    if (inPoint !== null) {
      setSequenceRange(null, outPoint ?? null);
      return;
    }
    setSequenceRange(currentTime, outPoint ?? null);
    notifyRangeChange(currentTime, outPoint ?? null);
  }, [
    items.length,
    getUiPlayheadTime,
    isSingleModeVideo,
    singleModeInPoint,
    inPoint,
    outPoint,
    notifyRangeChange,
    setSequenceRange,
  ]);

  const handleSetOutPoint = useCallback(() => {
    if (items.length === 0) return;
    const currentTime = getUiPlayheadTime();
    if (isSingleModeVideo) {
      if (singleModeOutPoint !== null) {
        setSingleModeOutPoint(null);
      } else {
        setSingleModeOutPoint(currentTime);
        notifyRangeChange(inPoint, currentTime);
      }
      return;
    }
    if (outPoint !== null) {
      setSequenceRange(inPoint ?? null, null);
      return;
    }
    setSequenceRange(inPoint ?? null, currentTime);
    notifyRangeChange(inPoint ?? null, currentTime);
  }, [
    items.length,
    getUiPlayheadTime,
    isSingleModeVideo,
    singleModeOutPoint,
    inPoint,
    outPoint,
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

  // Keyboard controls - unified for both modes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;

      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case ' ':
          e.preventDefault();
          handleShortcutPlayPause();
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
          handleShortcutStepFrameOrMarker(-1);
          break;
        case '.':
          e.preventDefault();
          handleShortcutStepFrameOrMarker(1);
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
          handleShortcutSetInPoint();
          break;
        case 'o':
          handleShortcutSetOutPoint();
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
    handleShortcutPlayPause,
    skip,
    handleShortcutStepFrameOrMarker,
    cycleSpeed,
    handleShortcutSetInPoint,
    handleShortcutSetOutPoint,
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
    pauseBeforeExport();

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

      const result = await window.electronAPI.exportSequence({
        items: sequenceItems,
        outputPath,
        width: exportWidth,
        height: exportHeight,
        fps: 30,
        subtitleStyle: getSubtitleStyleForExport(),
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

      const sequenceItems: Array<{
        type: 'image' | 'video';
        path: string;
        duration: number;
        inPoint?: number;
        outPoint?: number;
      }> = [];

      let accumulatedTime = 0;
      for (const item of items) {
        const asset = resolveAssetForCut(item.cut);
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
        return;
      }

      const result = await window.electronAPI.exportSequence({
        items: sequenceItems,
        outputPath,
        width: exportWidth,
        height: exportHeight,
        fps: 30,
        subtitleStyle: getSubtitleStyleForExport(),
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
  }, [items, selectedResolution, inPoint, outPoint, pauseBeforeExport, resolveAssetForCut]);
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
    const newTime = (progressPercent / 100) * totalDuration;

    // Progress bar click always seeks. Marker movement is drag/keyboard only.
    seekSequenceAbsolute(newTime);
  }, [items, sequenceState.totalDuration, seekSequenceAbsolute]);

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
      const absoluteTime = Math.max(0, sequenceSelectors.getAbsoluteTime());
      const playPosition = currentSceneAudioTrack
        ? Math.max(0, absoluteTime - currentSceneAudioTrack.startAbs + currentSceneAudioTrack.previewOffsetSec)
        : absoluteTime;
      sequenceAudioManagerRef.current.play(playPosition);
      sequenceAudioPlayingRef.current = true;
    }
  }, [isSingleMode, audioLoaded, sequenceState.isPlaying, sequenceSelectors, currentSceneAudioTrack]);

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

  const getAutoClipTimeFromClientX = useCallback((clientX: number): number | null => {
    if (!autoClipBarRef.current || !autoClipTarget) return null;
    const rect = autoClipBarRef.current.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const ratio = clampToDuration((clientX - rect.left) / rect.width, 1);
    return ratio * autoClipTarget.duration;
  }, [autoClipTarget]);

  const handleAutoClipBarMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!autoClipTarget) return;
    const time = getAutoClipTimeFromClientX(e.clientX);
    if (time === null) return;

    const mode: 'add' | 'erase' = e.altKey ? 'erase' : 'add';
    autoClipDragRef.current = {
      mode,
      startTime: time,
      moved: false,
      currentRange: { start: time, end: time },
    };
    e.preventDefault();
  }, [autoClipTarget, getAutoClipTimeFromClientX]);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!autoClipDragRef.current || !autoClipTarget) return;
      const time = getAutoClipTimeFromClientX(e.clientX);
      if (time === null) return;
      autoClipDragRef.current.moved = autoClipDragRef.current.moved || Math.abs(time - autoClipDragRef.current.startTime) > 0.02;
      autoClipDragRef.current.currentRange = normalizeTimeRange(autoClipDragRef.current.startTime, time);
    };

    const handleUp = (e: MouseEvent) => {
      if (!autoClipDragRef.current || !autoClipTarget) return;
      const drag = autoClipDragRef.current;
      autoClipDragRef.current = null;
      const time = getAutoClipTimeFromClientX(e.clientX);
      if (time === null) return;

      if (!drag.moved) {
        setExcludeRanges((prev) => toggleNearestExcludeRange(
          prev,
          time,
          autoClipTarget.duration,
          AUTO_CLIP_BRUSH_MIN_SEC,
          0.35
        ));
        return;
      }

      const normalized = normalizeTimeRange(drag.startTime, time);
      const width = Math.max(AUTO_CLIP_BRUSH_MIN_SEC, normalized.end - normalized.start);
      const center = (normalized.start + normalized.end) / 2;
      const nextRange = normalizeTimeRange(center - width / 2, center + width / 2);
      setExcludeRanges((prev) =>
        drag.mode === 'erase'
          ? removeExcludeRange(prev, nextRange, autoClipTarget.duration, AUTO_CLIP_BRUSH_MIN_SEC)
          : addExcludeRange(prev, nextRange, autoClipTarget.duration, AUTO_CLIP_BRUSH_MIN_SEC)
      );
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [autoClipTarget, getAutoClipTimeFromClientX]);

  useEffect(() => {
    if (!autoClipTarget) {
      if (autoClipDebounceTimerRef.current !== null) {
        window.clearTimeout(autoClipDebounceTimerRef.current);
        autoClipDebounceTimerRef.current = null;
      }
      setExcludeRanges([]);
      setHistScores([]);
      setRmsScores([]);
      setCandidatesHist([]);
      setCandidatesRms([]);
      return;
    }
    if (autoClipDebounceTimerRef.current !== null) {
      window.clearTimeout(autoClipDebounceTimerRef.current);
    }
    autoClipDebounceTimerRef.current = window.setTimeout(() => {
      void analyzeAutoClip();
      autoClipDebounceTimerRef.current = null;
    }, 320);
    return () => {
      if (autoClipDebounceTimerRef.current !== null) {
        window.clearTimeout(autoClipDebounceTimerRef.current);
        autoClipDebounceTimerRef.current = null;
      }
    };
  }, [autoClipTarget, autoClipSource, histThreshold, rmsThreshold, minGapSec, analyzeAutoClip]);

  useEffect(() => {
    setExcludeRanges([]);
  }, [histThreshold, rmsThreshold, minGapSec, minCandidatePercent, autoClipSource]);

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
    return buildPreviewViewportFramingStyle(targetCut?.framing, EXPORT_FRAMING_DEFAULTS);
  }, [isSingleMode, focusCutData?.cut, currentItem?.cut]);
  const subtitleStyle = useMemo(() => getSubtitleStyleSettings(), []);
  const activeSubtitleTarget = useMemo(() => {
    if (isSingleMode) {
      if (!focusCutData?.cut) return null;
      return {
        sceneId: focusCutData.scene.id,
        cut: focusCutData.cut,
      };
    }
    if (!currentItem?.cut) return null;
    return {
      sceneId: currentItem.sceneId,
      cut: currentItem.cut,
    };
  }, [isSingleMode, focusCutData, currentItem]);
  const activeCutDisplayTime = activeSubtitleTarget?.cut.displayTime ?? 0;
  const currentLocalTimeSec = useMemo(() => {
    if (!activeSubtitleTarget || activeCutDisplayTime <= 0) return 0;

    if (isSingleModeVideo) {
      const base = singleModeCurrentTime;
      const clipOffset = activeSubtitleTarget.cut.isClip && activeSubtitleTarget.cut.inPoint !== undefined
        ? activeSubtitleTarget.cut.inPoint
        : 0;
      const local = base - clipOffset;
      return Math.min(Math.max(local, 0), activeCutDisplayTime);
    }

    const localFromController = (activeCutDisplayTime * (sequenceState.localProgress ?? 0)) / 100;
    return Math.min(Math.max(localFromController, 0), activeCutDisplayTime);
  }, [
    activeSubtitleTarget,
    activeCutDisplayTime,
    isSingleModeVideo,
    singleModeCurrentTime,
    sequenceState.localProgress,
  ]);
  const subtitleText = activeSubtitleTarget?.cut.subtitle?.text ?? '';
  const subtitleVisible = useMemo(
    () => resolveSubtitleVisibility(activeSubtitleTarget?.cut.subtitle, currentLocalTimeSec, activeCutDisplayTime),
    [activeSubtitleTarget, currentLocalTimeSec, activeCutDisplayTime]
  );
  const hasSubtitle = !!subtitleText.trim();

  const handleSaveSubtitle = useCallback(
    (subtitle?: Cut['subtitle']) => {
      if (!activeSubtitleTarget) return;
      const normalizedRange = subtitle?.range
        ? normalizeSubtitleRange(subtitle.range, activeCutDisplayTime)
        : undefined;
      const normalizedSubtitle = subtitle
        ? {
            text: subtitle.text,
            range: normalizedRange,
          }
        : undefined;
      executeCommand(
        new UpdateCutSubtitleCommand(activeSubtitleTarget.sceneId, activeSubtitleTarget.cut.id, normalizedSubtitle)
      ).catch((error) => {
        console.error('Failed to update subtitle:', error);
      });
    },
    [activeSubtitleTarget, activeCutDisplayTime, executeCommand]
  );

  useEffect(() => {
    if (!openSubtitleModalOnMount || !activeSubtitleTarget) return;
    setShowSubtitleModal(true);
    onSubtitleModalOpenHandled?.();
  }, [openSubtitleModalOnMount, onSubtitleModalOpenHandled, activeSubtitleTarget]);

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

            {subtitleVisible && (
              <div
                className={`preview-subtitle-overlay preview-subtitle-overlay--${subtitleStyle.position}`}
                style={
                  {
                    fontSize: `${subtitleStyle.fontSizePx}px`,
                    color: subtitleStyle.fontColor,
                    '--subtitle-bg-opacity': `${subtitleStyle.backgroundOpacity}`,
                  } as CSSProperties
                }
              >
                <div
                  className={`preview-subtitle-text ${subtitleStyle.backgroundEnabled ? 'with-bg' : ''} ${subtitleStyle.outlineEnabled ? 'with-outline' : ''} ${subtitleStyle.shadowEnabled ? 'with-shadow' : ''}`}
                >
                  {subtitleText.split('\n').map((line, index) => (
                    <span key={`${index}-${line}`} className="preview-subtitle-line">
                      {line}
                    </span>
                  ))}
                </div>
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

                {isSingleModeVideo && autoClipTarget && (
                  <div className="auto-clip-row">
                    <div
                      className="auto-clip-bar"
                      ref={autoClipBarRef}
                      onMouseDown={handleAutoClipBarMouseDown}
                      title="Drag to add exclude. Alt+drag to erase."
                    >
                      {(histScores.length > 1 || rmsScores.length > 1) && (
                        <div className="auto-clip-scores">
                          {histScores.map((score, index) => {
                            const left = (index / Math.max(1, histScores.length - 1)) * 100;
                            const normalized = Math.max(0, Math.min(1, score / Math.max(histThreshold, 0.001)));
                            return (
                              <span
                                key={`${index}-${score}`}
                                className="auto-clip-score-bar"
                                style={{
                                  left: `${left}%`,
                                  height: `${Math.max(4, normalized * 100)}%`,
                                }}
                              />
                            );
                          })}
                          {rmsScores.map((score, index) => {
                            const left = (index / Math.max(1, rmsScores.length - 1)) * 100;
                            const normalized = Math.max(0, Math.min(1, score / Math.max(rmsThreshold, 0.001)));
                            return (
                              <span
                                key={`rms-score-${index}-${score}`}
                                className="auto-clip-score-bar auto-clip-score-bar--rms"
                                style={{
                                  left: `${left}%`,
                                  height: `${Math.max(2, normalized * 90)}%`,
                                }}
                              />
                            );
                          })}
                        </div>
                      )}
                      {autoClipSource !== 'rms' && candidatesHist.map((time) => (
                        <span
                          key={`hist-${time}`}
                          className="auto-clip-candidate auto-clip-candidate--hist"
                          style={{ left: `${(time / autoClipTarget.duration) * 100}%` }}
                        />
                      ))}
                      {autoClipSource !== 'hist' && candidatesRms.map((time) => (
                        <span
                          key={`rms-${time}`}
                          className="auto-clip-candidate auto-clip-candidate--rms"
                          style={{ left: `${(time / autoClipTarget.duration) * 100}%` }}
                        />
                      ))}
                      {normalizeExcludeRanges(excludeRanges, autoClipTarget.duration, AUTO_CLIP_BRUSH_MIN_SEC).map((range, index) => (
                        <span
                          key={`exclude-${index}-${range.start}`}
                          className="auto-clip-exclude"
                          style={{
                            left: `${(range.start / autoClipTarget.duration) * 100}%`,
                            width: `${Math.max(0.4, ((range.end - range.start) / autoClipTarget.duration) * 100)}%`,
                          }}
                        />
                      ))}
                      <span
                        className="auto-clip-head"
                        style={{ left: `${(currentLocalTimeSec / Math.max(0.001, autoClipTarget.duration)) * 100}%` }}
                      />
                    </div>
                    <button
                      className={`auto-clip-settings-toggle ${autoClipOpen ? 'is-open' : ''}`}
                      onClick={() => setAutoClipOpen((prev) => !prev)}
                      title="AutoClip settings"
                    >
                      <SlidersHorizontal size={14} />
                    </button>
                    {autoClipOpen && (
                      <div className="auto-clip-settings">
                        <label>
                          Source
                          <select value={autoClipSource} onChange={(e) => setAutoClipSource(e.target.value as 'hist' | 'rms' | 'both')}>
                            <option value="hist">Histogram</option>
                            <option value="rms">RMS</option>
                            <option value="both">Both</option>
                          </select>
                        </label>
                        <label>
                          Hist
                          <input
                            type="number"
                            min={0}
                            max={2}
                            step={0.01}
                            value={histThreshold}
                            onChange={(e) => setHistThreshold(Math.max(0, Number(e.target.value) || 0))}
                          />
                        </label>
                        <label>
                          RMS
                          <input
                            type="number"
                            min={0}
                            max={1}
                            step={0.01}
                            value={rmsThreshold}
                            onChange={(e) => setRmsThreshold(Math.max(0, Number(e.target.value) || 0))}
                          />
                        </label>
                        <label>
                          MinGap
                          <input
                            type="number"
                            min={0.1}
                            max={5}
                            step={0.1}
                            value={minGapSec}
                            onChange={(e) => setMinGapSec(Math.max(0.1, Number(e.target.value) || 0.1))}
                          />
                        </label>
                        <label>
                          MinPeak%
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={minCandidatePercent}
                            onChange={(e) => setMinCandidatePercent(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                          />
                        </label>
                        <label className="auto-clip-checkbox">
                          <input
                            type="checkbox"
                            checked={groupResults}
                            onChange={(e) => setGroupResults(e.target.checked)}
                          />
                          Group results
                        </label>
                        <button
                          className="auto-clip-btn"
                          onClick={() => {
                            if (autoClipDebounceTimerRef.current !== null) {
                              window.clearTimeout(autoClipDebounceTimerRef.current);
                              autoClipDebounceTimerRef.current = null;
                            }
                            void analyzeAutoClip();
                          }}
                          disabled={autoClipBusy}
                        >
                          Analyze
                        </button>
                        <button className="auto-clip-btn auto-clip-btn--primary" onClick={applyAutoClip} disabled={autoClipCandidates.length === 0}>
                          Apply Cuts
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Controls */}
                <div className="preview-controls-row">
                  <button
                    className="preview-ctrl-btn"
                    onClick={() => skip(-5)}
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
                    onClick={() => skip(5)}
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
                  <button
                    className={`preview-ctrl-btn ${hasSubtitle ? 'is-active' : ''}`}
                    onClick={() => setShowSubtitleModal(true)}
                    disabled={!activeSubtitleTarget}
                    title="Edit subtitle"
                  >
                    <MessageSquare size={16} />
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
        <SubtitleModal
          open={showSubtitleModal}
          subtitle={activeSubtitleTarget?.cut.subtitle}
          cutDurationSec={activeCutDisplayTime}
          currentLocalTimeSec={currentLocalTimeSec}
          onClose={() => setShowSubtitleModal(false)}
          onSave={handleSaveSubtitle}
        />
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
              const currentAsset = currentItem ? resolveAssetForCut(currentItem.cut) : undefined;
              if (currentAsset?.type === 'video') {
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

          {subtitleVisible && (
            <div
              className={`preview-subtitle-overlay preview-subtitle-overlay--${subtitleStyle.position}`}
              style={
                {
                  fontSize: `${subtitleStyle.fontSizePx}px`,
                  color: subtitleStyle.fontColor,
                  '--subtitle-bg-opacity': `${subtitleStyle.backgroundOpacity}`,
                } as CSSProperties
              }
            >
              <div
                className={`preview-subtitle-text ${subtitleStyle.backgroundEnabled ? 'with-bg' : ''} ${subtitleStyle.outlineEnabled ? 'with-outline' : ''} ${subtitleStyle.shadowEnabled ? 'with-shadow' : ''}`}
              >
                {subtitleText.split('\n').map((line, index) => (
                  <span key={`${index}-${line}`} className="preview-subtitle-line">
                    {line}
                  </span>
                ))}
              </div>
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
                <button
                  className={`preview-ctrl-btn ${hasSubtitle ? 'is-active' : ''}`}
                  onClick={() => setShowSubtitleModal(true)}
                  disabled={!activeSubtitleTarget}
                  title="Edit subtitle"
                >
                  <MessageSquare size={16} />
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
        <SubtitleModal
          open={showSubtitleModal}
          subtitle={activeSubtitleTarget?.cut.subtitle}
          cutDurationSec={activeCutDisplayTime}
          currentLocalTimeSec={currentLocalTimeSec}
          onClose={() => setShowSubtitleModal(false)}
          onSave={handleSaveSubtitle}
        />
      </div>
    </div>
  );
}
