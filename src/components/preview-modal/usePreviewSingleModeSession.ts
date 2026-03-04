import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Cut } from '../../types';
import { clampToDuration } from './helpers';
import { computeNextRangeForSetIn, computeNextRangeForSetOut } from './clipRangeOps';
import type { FocusedMarker } from './parts/PlaybackRangeMarkers';

const CLIP_POINT_EPSILON = 0.0001;

interface UsePreviewSingleModeSessionInput {
  isSingleMode: boolean;
  isSingleModeVideo: boolean;
  usesSequenceController: boolean;
  focusCut: Cut | null;
  focusCutId?: string;
  focusCutIsClip?: boolean;
  focusCutInPoint?: number;
  focusCutOutPoint?: number;
  inPoint: number | null;
  outPoint: number | null;
  initialInPoint?: number;
  singleModeInPoint: number | null;
  singleModeOutPoint: number | null;
  singleModeIsLooping: boolean;
  focusedMarker: FocusedMarker;
  setFocusedMarker: (marker: FocusedMarker) => void;
  setSingleModeInPoint: (value: number | null) => void;
  setSingleModeOutPoint: (value: number | null) => void;
  notifyRangeChange: (inPoint: number | null, outPoint: number | null) => void;
  setMarkerTime: (marker: 'in' | 'out', newTime: number) => number;
  seekSequenceAbsolute: (time: number) => void;
  sequenceTotalDuration: number;
  progressBarRef: React.RefObject<HTMLDivElement>;
  videoRef: React.RefObject<HTMLVideoElement>;
  onClipSave?: (
    inPoint: number,
    outPoint: number,
    options?: { expectedClipRevision?: number }
  ) => Promise<void> | void;
  onClipClear?: () => Promise<void> | void;
  onFrameCapture?: (timestamp: number) => Promise<string | void> | void;
  showMiniToast: (message: string, variant?: 'success' | 'info' | 'warning' | 'error') => void;
  playbackSpeed: number;
  singleModeDuration: number;
  setSingleModeDuration: (value: number) => void;
  singleModeCurrentTime: number;
  setSingleModeCurrentTime: (value: number) => void;
  getCurrentClipRevision?: () => number;
}

export function usePreviewSingleModeSession({
  isSingleMode,
  isSingleModeVideo,
  usesSequenceController,
  focusCut: _focusCut,
  focusCutId,
  focusCutIsClip,
  focusCutInPoint,
  focusCutOutPoint,
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
  sequenceTotalDuration,
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
  getCurrentClipRevision,
}: UsePreviewSingleModeSessionInput) {
  const [singleModeIsPlaying, setSingleModeIsPlaying] = useState(false);
  const [isSingleModeClipEnabled, setIsSingleModeClipEnabled] = useState(false);
  const [isSingleModeClipPending, setIsSingleModeClipPending] = useState(false);
  const singleModeRafRef = useRef<number | null>(null);

  const lastCommittedClipPointsRef = useRef<{ start: number; end: number } | null>(null);
  const singleModeClipDragDirtyRef = useRef(false);
  const queuedClipCommitRef = useRef<{ inPoint: number | null; outPoint: number | null } | null>(null);
  const singleModeRangeRef = useRef<{ inPoint: number | null; outPoint: number | null }>({
    inPoint: null,
    outPoint: null,
  });
  const isDraggingRef = useRef(false);
  const pendingSyncRef = useRef(false);
  const latestExternalRef = useRef<{
    cutId: string | null;
    isClip: boolean;
    inPoint: number | null;
    outPoint: number | null;
  }>({
    cutId: null,
    isClip: false,
    inPoint: null,
    outPoint: null,
  });
  const lastSyncedExternalRef = useRef<{
    cutId: string | null;
    isClip: boolean;
    inPoint: number | null;
    outPoint: number | null;
  }>({
    cutId: null,
    isClip: false,
    inPoint: null,
    outPoint: null,
  });

  const setSingleModeRange = useCallback((nextInPoint: number | null, nextOutPoint: number | null) => {
    singleModeRangeRef.current = { inPoint: nextInPoint, outPoint: nextOutPoint };
    setSingleModeInPoint(nextInPoint);
    setSingleModeOutPoint(nextOutPoint);
  }, [setSingleModeInPoint, setSingleModeOutPoint]);

  const syncLocalRangeFromExternal = useCallback((external: {
    cutId: string | null;
    isClip: boolean;
    inPoint: number | null;
    outPoint: number | null;
  }) => {
    const nextInPoint = external.isClip ? external.inPoint : null;
    const nextOutPoint = external.isClip ? external.outPoint : null;

    setSingleModeRange(nextInPoint, nextOutPoint);
    setIsSingleModeClipEnabled(external.isClip);
    setFocusedMarker(null);
    if (external.isClip && nextInPoint !== null && nextOutPoint !== null) {
      lastCommittedClipPointsRef.current = {
        start: Math.min(nextInPoint, nextOutPoint),
        end: Math.max(nextInPoint, nextOutPoint),
      };
      return;
    }
    lastCommittedClipPointsRef.current = null;
  }, [setSingleModeRange, setFocusedMarker]);

  const commitSingleModeClipPoints = useCallback(async (nextInPoint: number | null, nextOutPoint: number | null) => {
    if (!isSingleModeVideo || !onClipSave) return;
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
      await onClipSave(start, end, { expectedClipRevision: getCurrentClipRevision?.() });
      setIsSingleModeClipEnabled(true);
      lastCommittedClipPointsRef.current = { start, end };
    } catch (error) {
      console.error('Failed to update clip points:', error);
      showMiniToast(error instanceof Error ? error.message : 'Failed to update clip points', 'error');
    } finally {
      setIsSingleModeClipPending(false);
    }
  }, [isSingleModeVideo, onClipSave, isSingleModeClipPending, showMiniToast, getCurrentClipRevision]);

  useEffect(() => {
    singleModeRangeRef.current = { inPoint: singleModeInPoint, outPoint: singleModeOutPoint };
  }, [singleModeInPoint, singleModeOutPoint]);

  useEffect(() => {
    if (!isSingleModeVideo) return;
    if (isSingleModeClipPending) return;
    const queued = queuedClipCommitRef.current;
    if (!queued) return;
    queuedClipCommitRef.current = null;
    void commitSingleModeClipPoints(queued.inPoint, queued.outPoint);
  }, [isSingleModeVideo, isSingleModeClipPending, commitSingleModeClipPoints]);

  useEffect(() => {
    if (!isSingleModeVideo) return;
    const external = {
      cutId: focusCutId ?? null,
      isClip: !!focusCutIsClip,
      inPoint: typeof focusCutInPoint === 'number' ? focusCutInPoint : null,
      outPoint: typeof focusCutOutPoint === 'number' ? focusCutOutPoint : null,
    };
    latestExternalRef.current = external;

    const lastSynced = lastSyncedExternalRef.current;
    const changed = (
      external.cutId !== lastSynced.cutId
      || external.isClip !== lastSynced.isClip
      || external.inPoint !== lastSynced.inPoint
      || external.outPoint !== lastSynced.outPoint
    );
    if (!changed) return;

    if (isDraggingRef.current) {
      pendingSyncRef.current = true;
      return;
    }

    syncLocalRangeFromExternal(external);
    lastSyncedExternalRef.current = external;
  }, [
    focusCutId,
    focusCutInPoint,
    focusCutIsClip,
    focusCutOutPoint,
    isSingleModeVideo,
    syncLocalRangeFromExternal,
  ]);

  const handleSingleModeSetInPoint = useCallback(() => {
    if (!isSingleModeVideo) return;
    const nextRange = computeNextRangeForSetIn({
      playheadTime: singleModeCurrentTime,
      duration: singleModeDuration,
      inPoint,
      outPoint,
      keepOppositeWhenCrossed: isSingleModeClipEnabled,
    });
    const { inPoint: nextInPoint, outPoint: nextOutPoint } = nextRange;
    setSingleModeRange(nextInPoint, nextOutPoint);
    if (focusedMarker === 'out' && nextOutPoint === null) {
      setFocusedMarker(null);
    }
    notifyRangeChange(nextInPoint, nextOutPoint);
    void commitSingleModeClipPoints(nextInPoint, nextOutPoint);
  }, [
    isSingleModeVideo,
    singleModeCurrentTime,
    singleModeDuration,
    outPoint,
    focusedMarker,
    setFocusedMarker,
    notifyRangeChange,
    commitSingleModeClipPoints,
    setSingleModeRange,
  ]);

  const handleSingleModeSetOutPoint = useCallback(() => {
    if (!isSingleModeVideo) return;
    const nextRange = computeNextRangeForSetOut({
      playheadTime: singleModeCurrentTime,
      duration: singleModeDuration,
      inPoint,
      outPoint,
      keepOppositeWhenCrossed: isSingleModeClipEnabled,
    });
    const { inPoint: nextInPoint, outPoint: nextOutPoint } = nextRange;
    setSingleModeRange(nextInPoint, nextOutPoint);
    if (focusedMarker === 'in' && nextInPoint === null) {
      setFocusedMarker(null);
    }
    notifyRangeChange(nextInPoint, nextOutPoint);
    void commitSingleModeClipPoints(nextInPoint, nextOutPoint);
  }, [
    isSingleModeVideo,
    singleModeCurrentTime,
    singleModeDuration,
    inPoint,
    focusedMarker,
    setFocusedMarker,
    notifyRangeChange,
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
  }, [isSingleModeVideo, notifyRangeChange, onClipClear, setSingleModeRange, setFocusedMarker, showMiniToast]);

  const handleSingleModeSave = useCallback(async () => {
    if (!isSingleModeVideo) return;
    if (inPoint === null || outPoint === null) return;

    const start = Math.min(inPoint, outPoint);
    const end = Math.max(inPoint, outPoint);
    setIsSingleModeClipPending(true);
    try {
      await onClipSave?.(start, end, { expectedClipRevision: getCurrentClipRevision?.() });
      setIsSingleModeClipEnabled(true);
      lastCommittedClipPointsRef.current = { start, end };
      showMiniToast('VIDEOCLIP set', 'success');
    } catch (error) {
      console.error('Failed to save clip:', error);
      showMiniToast(error instanceof Error ? error.message : 'Failed to save clip', 'error');
    } finally {
      setIsSingleModeClipPending(false);
    }
  }, [isSingleModeVideo, inPoint, outPoint, onClipSave, showMiniToast, getCurrentClipRevision]);

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
  }, [isSingleModeVideo, onFrameCapture, singleModeCurrentTime, videoRef, showMiniToast]);

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
  }, [isSingleModeVideo, singleModeIsPlaying, inPoint, outPoint, videoRef]);

  const handleSingleModeTimeUpdate = useCallback(() => {
    if (!videoRef.current || !isSingleModeVideo) return;

    setSingleModeCurrentTime(videoRef.current.currentTime);

    if (singleModeIsPlaying && inPoint !== null && outPoint !== null) {
      const clipStart = Math.min(inPoint, outPoint);
      const clipEnd = Math.max(inPoint, outPoint);
      if (videoRef.current.currentTime >= clipEnd) {
        if (singleModeIsLooping) {
          videoRef.current.currentTime = clipStart;
        } else {
          videoRef.current.pause();
          setSingleModeIsPlaying(false);
          videoRef.current.currentTime = clipEnd;
          setSingleModeCurrentTime(clipEnd);
        }
      }
    }
  }, [isSingleModeVideo, inPoint, outPoint, singleModeIsLooping, singleModeIsPlaying, videoRef]);

  const handleSingleModeLoadedMetadata = useCallback(() => {
    if (!videoRef.current || !isSingleModeVideo) return;

    setSingleModeDuration(videoRef.current.duration);

    if (initialInPoint !== undefined) {
      videoRef.current.currentTime = initialInPoint;
      setSingleModeCurrentTime(initialInPoint);
    }
  }, [isSingleModeVideo, initialInPoint, videoRef]);

  const handleSingleModeVideoEnded = useCallback(() => {
    if (!isSingleModeVideo) return;

    if (singleModeIsLooping && videoRef.current) {
      const loopStart = inPoint !== null ? Math.min(inPoint, outPoint ?? inPoint) : 0;
      videoRef.current.currentTime = loopStart;
      void videoRef.current.play();
    } else {
      setSingleModeIsPlaying(false);
    }
  }, [isSingleModeVideo, singleModeIsLooping, inPoint, outPoint, videoRef]);

  const handleSingleModeProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || !isSingleMode) return;

    const rect = progressBarRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;

    if (!usesSequenceController) {
      if (!videoRef.current) return;
      const newTime = clampToDuration(percent * singleModeDuration, singleModeDuration);
      videoRef.current.currentTime = newTime;
      setSingleModeCurrentTime(newTime);
      return;
    }

    const duration = sequenceTotalDuration;
    if (duration <= 0) return;
    seekSequenceAbsolute(clampToDuration(percent * duration, duration));
  }, [
    progressBarRef,
    isSingleMode,
    usesSequenceController,
    videoRef,
    singleModeDuration,
    sequenceTotalDuration,
    seekSequenceAbsolute,
  ]);

  const handleMarkerDrag = useCallback((marker: 'in' | 'out', newTime: number): number => {
    if (isSingleModeVideo) {
      isDraggingRef.current = true;
      singleModeClipDragDirtyRef.current = true;
    }
    return setMarkerTime(marker, newTime);
  }, [setMarkerTime, isSingleModeVideo]);

  const handleMarkerDragEnd = useCallback(async () => {
    if (isSingleModeVideo && singleModeClipDragDirtyRef.current) {
      singleModeClipDragDirtyRef.current = false;
      const { inPoint: latestInPoint, outPoint: latestOutPoint } = singleModeRangeRef.current;
      await commitSingleModeClipPoints(latestInPoint, latestOutPoint);
    }
    isDraggingRef.current = false;
    if (pendingSyncRef.current) {
      pendingSyncRef.current = false;
      const latestExternal = latestExternalRef.current;
      syncLocalRangeFromExternal(latestExternal);
      lastSyncedExternalRef.current = latestExternal;
    }
    setFocusedMarker(null);
  }, [isSingleModeVideo, commitSingleModeClipPoints, setFocusedMarker, syncLocalRangeFromExternal]);

  useEffect(() => {
    if (isSingleModeVideo && videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [isSingleModeVideo, videoRef, playbackSpeed]);

  useEffect(() => {
    if (!isSingleModeVideo || !singleModeIsPlaying || !videoRef.current) {
      if (singleModeRafRef.current !== null) {
        window.cancelAnimationFrame(singleModeRafRef.current);
        singleModeRafRef.current = null;
      }
      return;
    }

    const updateCurrentTime = () => {
      const video = videoRef.current;
      if (!video) return;
      setSingleModeCurrentTime(video.currentTime);
      singleModeRafRef.current = window.requestAnimationFrame(updateCurrentTime);
    };

    singleModeRafRef.current = window.requestAnimationFrame(updateCurrentTime);
    return () => {
      if (singleModeRafRef.current !== null) {
        window.cancelAnimationFrame(singleModeRafRef.current);
        singleModeRafRef.current = null;
      }
    };
  }, [isSingleModeVideo, singleModeIsPlaying, videoRef, setSingleModeCurrentTime]);

  return {
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
  };
}
