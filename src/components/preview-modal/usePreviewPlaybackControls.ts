import { useCallback, useEffect } from 'react';
import { cyclePlaybackSpeed } from '../../utils/timeUtils';

interface SequenceStateSnapshot {
  currentIndex: number;
  localProgress: number;
  isPlaying: boolean;
  isBuffering: boolean;
  isLooping: boolean;
  inPoint: number | null;
  outPoint: number | null;
  totalDuration: number;
}

interface UsePreviewPlaybackControlsInput {
  isSingleMode: boolean;
  usesSequenceController: boolean;
  itemsLength: number;
  sequenceState: SequenceStateSnapshot;
  getSequenceAbsoluteTime: () => number;
  sequenceGoToNext: () => void;
  sequenceGoToPrev: () => void;
  sequenceToggle: () => void;
  sequencePause: () => void;
  setSequenceLooping: (isLooping: boolean) => void;
  seekSequenceAbsolute: (time: number) => void;
  setSequenceRate: (rate: number) => void;
  setSequenceBuffering: (isBuffering: boolean) => void;
  checkBufferStatus: () => { ready: boolean; neededItems: number[] };
  playbackSpeed: number;
  setPlaybackSpeed: React.Dispatch<React.SetStateAction<number>>;
  setSingleModeIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  setSingleModeIsLooping: React.Dispatch<React.SetStateAction<boolean>>;
}

export function usePreviewPlaybackControls({
  isSingleMode,
  usesSequenceController,
  itemsLength,
  sequenceState,
  getSequenceAbsoluteTime,
  sequenceGoToNext,
  sequenceGoToPrev,
  sequenceToggle,
  sequencePause,
  setSequenceLooping,
  seekSequenceAbsolute,
  setSequenceRate,
  setSequenceBuffering,
  checkBufferStatus,
  playbackSpeed,
  setPlaybackSpeed,
  setSingleModeIsPlaying,
  setSingleModeIsLooping,
}: UsePreviewPlaybackControlsInput) {
  const goToNext = useCallback(() => {
    if (isSingleMode) return;
    sequenceGoToNext();
  }, [isSingleMode, sequenceGoToNext]);

  const goToPrev = useCallback(() => {
    if (isSingleMode) return;
    sequenceGoToPrev();
  }, [isSingleMode, sequenceGoToPrev]);

  const handlePlayPause = useCallback(() => {
    if (!usesSequenceController || itemsLength === 0) return;

    if (!sequenceState.isPlaying) {
      const currentAbsTime = getSequenceAbsoluteTime();
      if (sequenceState.inPoint !== null && sequenceState.outPoint !== null) {
        const effectiveOutPoint = Math.max(sequenceState.inPoint, sequenceState.outPoint);
        const effectiveInPoint = Math.min(sequenceState.inPoint, sequenceState.outPoint);
        if (currentAbsTime < effectiveInPoint - 0.001 || currentAbsTime >= effectiveOutPoint - 0.001) {
          seekSequenceAbsolute(effectiveInPoint);
        }
      } else if (sequenceState.currentIndex >= itemsLength - 1 && sequenceState.localProgress >= 99) {
        seekSequenceAbsolute(0);
      }
    }

    sequenceToggle();
  }, [usesSequenceController, itemsLength, sequenceState, getSequenceAbsoluteTime, seekSequenceAbsolute, sequenceToggle]);

  useEffect(() => {
    if (!usesSequenceController) return;
    setSequenceRate(playbackSpeed);
  }, [usesSequenceController, playbackSpeed, setSequenceRate]);

  useEffect(() => {
    if (isSingleMode || itemsLength === 0) return;

    const { ready } = checkBufferStatus();
    if (sequenceState.isPlaying && !ready && !sequenceState.isBuffering) {
      setSequenceBuffering(true);
    } else if (sequenceState.isPlaying && ready && sequenceState.isBuffering) {
      setSequenceBuffering(false);
    }
  }, [isSingleMode, itemsLength, sequenceState.isPlaying, sequenceState.isBuffering, checkBufferStatus, setSequenceBuffering]);

  const cycleSpeed = useCallback((direction: 'up' | 'down') => {
    setPlaybackSpeed(current => cyclePlaybackSpeed(current, direction));
  }, []);

  const toggleLooping = useCallback(() => {
    if (!usesSequenceController) {
      setSingleModeIsLooping(prev => !prev);
    } else {
      setSequenceLooping(!sequenceState.isLooping);
    }
  }, [usesSequenceController, sequenceState.isLooping, setSequenceLooping, setSingleModeIsLooping]);

  const pauseBeforeExport = useCallback(() => {
    if (!usesSequenceController) {
      setSingleModeIsPlaying(false);
      return;
    }
    sequencePause();
  }, [usesSequenceController, sequencePause, setSingleModeIsPlaying]);

  return {
    goToNext,
    goToPrev,
    handlePlayPause,
    cycleSpeed,
    toggleLooping,
    pauseBeforeExport,
  };
}
