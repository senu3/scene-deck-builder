import { useCallback } from 'react';
import type React from 'react';
import type { Asset } from '../../types';
import type { PreviewItem } from './types';
import type { FocusedMarker } from './parts/PlaybackRangeMarkers';
import { FRAME_DURATION } from './constants';
import { clampToDuration } from './helpers';
import {
  computeNextRangeForSetIn,
  computeNextRangeForSetOut,
  resolveUiPlayheadTime,
} from './clipRangeOps';

interface UsePreviewInteractionCommandsInput {
  isSingleModeVideo: boolean;
  isPlaying: boolean;
  focusedMarker: FocusedMarker;
  items: PreviewItem[];
  currentIndex: number;
  inPoint: number | null;
  outPoint: number | null;
  singleModeDuration: number;
  singleModeCurrentTime: number;
  sequenceTotalDuration: number;
  videoRef: React.RefObject<HTMLVideoElement>;
  resolveAssetForCut: (cut: PreviewItem['cut']) => Asset | null;
  setSingleModeCurrentTime: (time: number) => void;
  setSingleModeIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  getSequenceAbsoluteTime: () => number;
  seekSequenceAbsolute: (time: number) => void;
  seekSequencePercent: (percent: number) => void;
  sequencePause: () => void;
  skipSequence: (seconds: number) => void;
  setSequenceRange: (inPoint: number | null, outPoint: number | null) => void;
  notifyRangeChange: (inPoint: number | null, outPoint: number | null) => void;
  toggleSingleModePlay: () => void;
  handlePlayPause: () => void;
  stepFocusedMarker: (direction: number) => number | null;
  handleSingleModeSetInPoint: () => void;
  handleSingleModeSetOutPoint: () => void;
  toggleLooping: () => void;
  toggleGlobalMute: () => void;
  handleMarkerFocus: (marker: FocusedMarker) => void;
  handleMarkerDrag: (marker: 'in' | 'out', newTime: number) => number;
  handleMarkerDragEnd: () => Promise<void>;
}

export function usePreviewInteractionCommands({
  isSingleModeVideo,
  isPlaying,
  focusedMarker,
  items,
  currentIndex,
  inPoint,
  outPoint,
  singleModeDuration,
  singleModeCurrentTime,
  sequenceTotalDuration,
  videoRef,
  resolveAssetForCut,
  setSingleModeCurrentTime,
  setSingleModeIsPlaying,
  getSequenceAbsoluteTime,
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
}: UsePreviewInteractionCommandsInput) {
  const seekToAbsolute = useCallback((time: number) => {
    if (isSingleModeVideo) {
      if (!videoRef.current) return;
      const nextTime = clampToDuration(time, singleModeDuration);
      videoRef.current.currentTime = nextTime;
      setSingleModeCurrentTime(nextTime);
      return;
    }
    if (items.length === 0) return;
    seekSequenceAbsolute(clampToDuration(time, sequenceTotalDuration));
  }, [
    isSingleModeVideo,
    videoRef,
    singleModeDuration,
    setSingleModeCurrentTime,
    items.length,
    seekSequenceAbsolute,
    sequenceTotalDuration,
  ]);

  const seekToPercent = useCallback((percent: number) => {
    if (isSingleModeVideo) {
      seekToAbsolute((clampToDuration(percent, 100) / 100) * singleModeDuration);
      return;
    }
    if (items.length === 0) return;
    seekSequencePercent(percent);
  }, [isSingleModeVideo, seekToAbsolute, singleModeDuration, items.length, seekSequencePercent]);

  const stepFrame = useCallback((direction: number) => {
    if (!videoRef.current) return;

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
    const clampedTime = clampToDuration(newTime, duration);
    videoRef.current.currentTime = clampedTime;

    if (isSingleModeVideo) {
      setSingleModeCurrentTime(clampedTime);
    }
  }, [
    videoRef,
    isPlaying,
    isSingleModeVideo,
    setSingleModeIsPlaying,
    sequencePause,
    singleModeDuration,
    setSingleModeCurrentTime,
  ]);

  const skip = useCallback((seconds: number) => {
    if (isSingleModeVideo) {
      if (!videoRef.current) return;
      const nextTime = clampToDuration(videoRef.current.currentTime + seconds, singleModeDuration);
      videoRef.current.currentTime = nextTime;
      setSingleModeCurrentTime(nextTime);
      return;
    }
    skipSequence(seconds);
  }, [isSingleModeVideo, videoRef, singleModeDuration, setSingleModeCurrentTime, skipSequence]);

  const playPause = useCallback(() => {
    if (isSingleModeVideo) {
      toggleSingleModePlay();
      return;
    }
    handlePlayPause();
  }, [isSingleModeVideo, toggleSingleModePlay, handlePlayPause]);

  const skipBack = useCallback(() => {
    skip(-5);
  }, [skip]);

  const skipForward = useCallback(() => {
    skip(5);
  }, [skip]);

  const stepBack = useCallback(() => {
    if (focusedMarker) {
      const markerTime = stepFocusedMarker(-1);
      if (markerTime !== null) {
        seekToAbsolute(markerTime);
      }
      return;
    }
    if (isSingleModeVideo) {
      stepFrame(-1);
      return;
    }
    const currentItem = items[currentIndex];
    const currentAsset = currentItem ? resolveAssetForCut(currentItem.cut) : undefined;
    if (currentAsset?.type === 'video') {
      stepFrame(-1);
    }
  }, [focusedMarker, stepFocusedMarker, seekToAbsolute, isSingleModeVideo, stepFrame, items, currentIndex, resolveAssetForCut]);

  const stepForward = useCallback(() => {
    if (focusedMarker) {
      const markerTime = stepFocusedMarker(1);
      if (markerTime !== null) {
        seekToAbsolute(markerTime);
      }
      return;
    }
    if (isSingleModeVideo) {
      stepFrame(1);
      return;
    }
    const currentItem = items[currentIndex];
    const currentAsset = currentItem ? resolveAssetForCut(currentItem.cut) : undefined;
    if (currentAsset?.type === 'video') {
      stepFrame(1);
    }
  }, [focusedMarker, stepFocusedMarker, seekToAbsolute, isSingleModeVideo, stepFrame, items, currentIndex, resolveAssetForCut]);

  const setInPoint = useCallback(() => {
    if (isSingleModeVideo) {
      handleSingleModeSetInPoint();
      return;
    }
    if (items.length === 0) return;
    const playheadTime = resolveUiPlayheadTime({
      isSingleModeVideo,
      singleModeCurrentTime,
      getSequenceAbsoluteTime,
    });
    const nextRange = computeNextRangeForSetIn({
      playheadTime,
      duration: sequenceTotalDuration,
      inPoint,
      outPoint,
    });
    setSequenceRange(nextRange.inPoint, nextRange.outPoint);
    notifyRangeChange(nextRange.inPoint, nextRange.outPoint);
  }, [
    isSingleModeVideo,
    handleSingleModeSetInPoint,
    items.length,
    singleModeCurrentTime,
    getSequenceAbsoluteTime,
    sequenceTotalDuration,
    inPoint,
    outPoint,
    setSequenceRange,
    notifyRangeChange,
  ]);

  const setOutPoint = useCallback(() => {
    if (isSingleModeVideo) {
      handleSingleModeSetOutPoint();
      return;
    }
    if (items.length === 0) return;
    const playheadTime = resolveUiPlayheadTime({
      isSingleModeVideo,
      singleModeCurrentTime,
      getSequenceAbsoluteTime,
    });
    const nextRange = computeNextRangeForSetOut({
      playheadTime,
      duration: sequenceTotalDuration,
      inPoint,
      outPoint,
    });
    setSequenceRange(nextRange.inPoint, nextRange.outPoint);
    notifyRangeChange(nextRange.inPoint, nextRange.outPoint);
  }, [
    isSingleModeVideo,
    handleSingleModeSetOutPoint,
    items.length,
    singleModeCurrentTime,
    getSequenceAbsoluteTime,
    sequenceTotalDuration,
    inPoint,
    outPoint,
    setSequenceRange,
    notifyRangeChange,
  ]);

  const markerDrag = useCallback((marker: 'in' | 'out', newTime: number) => {
    const markerTime = handleMarkerDrag(marker, newTime);
    seekToAbsolute(markerTime);
  }, [handleMarkerDrag, seekToAbsolute]);

  const markerDragEnd = useCallback(() => {
    void handleMarkerDragEnd();
  }, [handleMarkerDragEnd]);

  return {
    playPause,
    skipBack,
    skipForward,
    stepBack,
    stepForward,
    setInPoint,
    setOutPoint,
    toggleLooping,
    toggleMute: toggleGlobalMute,
    markerFocus: handleMarkerFocus,
    markerDrag,
    markerDragEnd,
    seekToAbsolute,
    seekToPercent,
  };
}
