import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { formatTime } from '../../utils/timeUtils';

interface UseSequenceProgressInteractionsInput {
  progressBarRef: React.RefObject<HTMLDivElement>;
  itemsLength: number;
  totalDuration: number;
  sequencePause: () => void;
  seekSequenceAbsolute: (time: number) => void;
  seekSequencePercent: (percent: number) => void;
}

export function useSequenceProgressInteractions({
  progressBarRef,
  itemsLength,
  totalDuration,
  sequencePause,
  seekSequenceAbsolute,
  seekSequencePercent,
}: UseSequenceProgressInteractionsInput) {
  const [isDragging, setIsDragging] = useState(false);
  const [hoverTime, setHoverTime] = useState<string | null>(null);

  const handleProgressBarClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || itemsLength === 0) return;

    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const progressPercent = Math.max(0, Math.min(100, (clickX / rect.width) * 100));

    if (totalDuration <= 0) return;
    const newTime = (progressPercent / 100) * totalDuration;
    seekSequenceAbsolute(newTime);
  }, [progressBarRef, itemsLength, totalDuration, seekSequenceAbsolute]);

  const handleProgressBarMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    sequencePause();
    handleProgressBarClick(e);
  }, [handleProgressBarClick, sequencePause]);

  const handleProgressBarMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !progressBarRef.current || itemsLength === 0) return;

    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const progressPercent = (clickX / rect.width) * 100;
    seekSequencePercent(progressPercent);
  }, [isDragging, progressBarRef, itemsLength, seekSequencePercent]);

  const handleProgressBarMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleProgressBarHover = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || itemsLength === 0) return;

    const rect = progressBarRef.current.getBoundingClientRect();
    const hoverX = e.clientX - rect.left;
    const progressPercent = (hoverX / rect.width) * 100;
    const hoverTimeSeconds = (progressPercent / 100) * totalDuration;
    setHoverTime(formatTime(hoverTimeSeconds));
  }, [progressBarRef, itemsLength, totalDuration]);

  const handleProgressBarLeave = useCallback(() => {
    setHoverTime(null);
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    window.addEventListener('mousemove', handleProgressBarMouseMove);
    window.addEventListener('mouseup', handleProgressBarMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleProgressBarMouseMove);
      window.removeEventListener('mouseup', handleProgressBarMouseUp);
    };
  }, [isDragging, handleProgressBarMouseMove, handleProgressBarMouseUp]);

  return {
    isDragging,
    hoverTime,
    handleProgressBarMouseDown,
    handleProgressBarHover,
    handleProgressBarLeave,
  };
}
