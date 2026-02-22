import { useCallback } from 'react';
import type { Asset } from '../../types';
import type { PreviewItem } from './types';
import type { FocusedMarker } from '../shared';

interface UsePreviewInteractionCommandsInput {
  isSingleModeVideo: boolean;
  focusedMarker: FocusedMarker;
  items: PreviewItem[];
  currentIndex: number;
  resolveAssetForCut: (cut: PreviewItem['cut']) => Asset | null;
  toggleSingleModePlay: () => void;
  handlePlayPause: () => void;
  skip: (seconds: number) => void;
  stepFocusedMarker: (direction: number) => void;
  stepFrame: (direction: number) => void;
  handleSingleModeSetInPoint: () => void;
  handleSingleModeSetOutPoint: () => void;
  handleSetInPoint: () => void;
  handleSetOutPoint: () => void;
  toggleLooping: () => void;
  toggleGlobalMute: () => void;
  handleMarkerFocus: (marker: FocusedMarker) => void;
  handleMarkerDrag: (marker: 'in' | 'out', newTime: number) => void;
  handleMarkerDragEnd: () => Promise<void>;
}

export function usePreviewInteractionCommands({
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
}: UsePreviewInteractionCommandsInput) {
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
    handleSetInPoint();
  }, [isSingleModeVideo, handleSingleModeSetInPoint, handleSetInPoint]);

  const setOutPoint = useCallback(() => {
    if (isSingleModeVideo) {
      handleSingleModeSetOutPoint();
      return;
    }
    handleSetOutPoint();
  }, [isSingleModeVideo, handleSingleModeSetOutPoint, handleSetOutPoint]);

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
