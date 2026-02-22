import type React from 'react';
import { usePreviewKeyboardShortcuts } from './usePreviewKeyboardShortcuts';
import { useSequenceProgressInteractions } from './useSequenceProgressInteractions';

interface UsePreviewInputsInput {
  progressBarRef: React.RefObject<HTMLDivElement>;
  itemsLength: number;
  totalDuration: number;
  sequencePause: () => void;
  seekSequenceAbsolute: (time: number) => void;
  seekSequencePercent: (percent: number) => void;
  onClose: () => void;
  onPlayPause: () => void;
  onSkipBack: () => void;
  onSkipForward: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onSpeedDown: () => void;
  onSpeedUp: () => void;
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
  sequencePause,
  seekSequenceAbsolute,
  seekSequencePercent,
  onClose,
  onPlayPause,
  onSkipBack,
  onSkipForward,
  onStepBack,
  onStepForward,
  onSpeedDown,
  onSpeedUp,
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
    sequencePause,
    seekSequenceAbsolute,
    seekSequencePercent,
  });

  usePreviewKeyboardShortcuts({
    onClose,
    onPlayPause,
    onSkipBack,
    onSkipForward,
    onStepBack,
    onStepForward,
    onSpeedDown,
    onSpeedUp,
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
