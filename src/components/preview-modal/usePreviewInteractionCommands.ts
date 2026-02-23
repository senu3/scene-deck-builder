import { useCallback } from 'react';
import type React from 'react';
import type { Asset } from '../../types';
import type { PreviewItem } from './types';
import type { FocusedMarker } from '../shared';
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
  sequencePause: () => void;
  skipSequence: (seconds: number) => void;
  setSequenceRange: (inPoint: number | null, outPoint: number | null) => void;
  notifyRangeChange: (inPoint: number | null, outPoint: number | null) => void;
  toggleSingleModePlay: () => void;
  handlePlayPause: () => void;
  stepFocusedMarker: (direction: number) => void;
  handleSingleModeSetInPoint: () => void;
  handleSingleModeSetOutPoint: () => void;
  toggleLooping: () => void;
  toggleGlobalMute: () => void;
  handleMarkerFocus: (marker: FocusedMarker) => void;
  handleMarkerDrag: (marker: 'in' | 'out', newTime: number) => void;
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
      stepFocusedMarker(-1);
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
  }, [focusedMarker, isSingleModeVideo, stepFocusedMarker, stepFrame, items, currentIndex, resolveAssetForCut]);

  const stepForward = useCallback(() => {
    if (focusedMarker) {
      stepFocusedMarker(1);
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
  }, [focusedMarker, isSingleModeVideo, stepFocusedMarker, stepFrame, items, currentIndex, resolveAssetForCut]);

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
    markerDrag: handleMarkerDrag,
    markerDragEnd,
  };
}
