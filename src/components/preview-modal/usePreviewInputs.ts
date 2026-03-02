import type React from 'react';
import { usePreviewKeyboardShortcuts } from './usePreviewKeyboardShortcuts';
import { useSequenceProgressInteractions } from './useSequenceProgressInteractions';

interface UsePreviewInputsInput {
  progressBarRef: React.RefObject<HTMLDivElement>;
  itemsLength: number;
  totalDuration: number;
  onPauseBeforeSeek: () => void;
  onSeekAbsolute: (time: number) => void;
  onSeekPercent: (percent: number) => void;
  onClose: () => void;
  onPlayPause: () => void;
  onSkipBack: () => void;
  onSkipForward: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onToggleFullscreen: () => void;
  onToggleLooping: () => void;
  onSetInPoint: () => void;
  onSetOutPoint: () => void;
  onToggleMute: () => void;
}

export function usePreviewInputs({
  progressBarRef,
  itemsLength,
  totalDuration,
  onPauseBeforeSeek,
  onSeekAbsolute,
  onSeekPercent,
  onClose,
  onPlayPause,
  onSkipBack,
  onSkipForward,
  onStepBack,
  onStepForward,
  onToggleFullscreen,
  onToggleLooping,
  onSetInPoint,
  onSetOutPoint,
  onToggleMute,
}: UsePreviewInputsInput) {
  const {
    isDragging,
    hoverTime,
    handleProgressBarMouseDown,
    handleProgressBarHover,
    handleProgressBarLeave,
  } = useSequenceProgressInteractions({
    progressBarRef,
    itemsLength,
    totalDuration,
    onPauseBeforeSeek,
    onSeekAbsolute,
    onSeekPercent,
  });

  usePreviewKeyboardShortcuts({
    onClose,
    onPlayPause,
    onSkipBack,
    onSkipForward,
    onStepBack,
    onStepForward,
    onToggleFullscreen,
    onToggleLooping,
    onSetInPoint,
    onSetOutPoint,
    onToggleMute,
  });

  return {
    isDragging,
    hoverTime,
    handleProgressBarMouseDown,
    handleProgressBarHover,
    handleProgressBarLeave,
  };
}
