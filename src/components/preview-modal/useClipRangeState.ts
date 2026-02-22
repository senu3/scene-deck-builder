import type React from 'react';
import { useCallback, useState } from 'react';
import { constrainMarkerTime } from './helpers';
import type { FocusedMarker } from '../shared';

interface UseClipRangeStateInput {
  usesSequenceController: boolean;
  sequenceInPoint: number | null;
  sequenceOutPoint: number | null;
  sequenceTotalDuration: number;
  singleModeDuration: number;
  itemsLength: number;
  initialInPoint?: number;
  initialOutPoint?: number;
  onRangeChange?: (range: { inPoint: number | null; outPoint: number | null }) => void;
  setSequenceRange: (inPoint: number | null, outPoint: number | null) => void;
  seekSequenceAbsolute: (time: number) => void;
  setSingleModeCurrentTime: (time: number) => void;
  videoRef: React.RefObject<HTMLVideoElement>;
  frameDuration: number;
}

export function useClipRangeState({
  usesSequenceController,
  sequenceInPoint,
  sequenceOutPoint,
  sequenceTotalDuration,
  singleModeDuration,
  itemsLength,
  initialInPoint,
  initialOutPoint,
  onRangeChange,
  setSequenceRange,
  seekSequenceAbsolute,
  setSingleModeCurrentTime,
  videoRef,
  frameDuration,
}: UseClipRangeStateInput) {
  const [singleModeInPoint, setSingleModeInPoint] = useState<number | null>(initialInPoint ?? null);
  const [singleModeOutPoint, setSingleModeOutPoint] = useState<number | null>(initialOutPoint ?? null);
  const [focusedMarker, setFocusedMarker] = useState<FocusedMarker>(null);

  const inPoint = usesSequenceController ? sequenceInPoint : singleModeInPoint;
  const outPoint = usesSequenceController ? sequenceOutPoint : singleModeOutPoint;

  const notifyRangeChange = useCallback((nextInPoint: number | null, nextOutPoint: number | null) => {
    onRangeChange?.({ inPoint: nextInPoint, outPoint: nextOutPoint });
  }, [onRangeChange]);

  const setMarkerTimeAndSeek = useCallback((marker: 'in' | 'out', newTime: number) => {
    const duration = usesSequenceController
      ? sequenceTotalDuration
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
    } else if (usesSequenceController && itemsLength > 0) {
      seekSequenceAbsolute(constrainedTime);
    }
  }, [
    usesSequenceController,
    sequenceTotalDuration,
    singleModeDuration,
    inPoint,
    outPoint,
    notifyRangeChange,
    setSequenceRange,
    videoRef,
    setSingleModeCurrentTime,
    itemsLength,
    seekSequenceAbsolute,
  ]);

  const stepFocusedMarker = useCallback((direction: number) => {
    if (!focusedMarker) return;
    const currentMarkerTime = focusedMarker === 'in' ? inPoint : outPoint;
    if (currentMarkerTime === null) return;
    setMarkerTimeAndSeek(focusedMarker, currentMarkerTime + (direction * frameDuration));
  }, [focusedMarker, inPoint, outPoint, setMarkerTimeAndSeek, frameDuration]);

  const handleMarkerFocus = useCallback((marker: FocusedMarker) => {
    setFocusedMarker(marker);
  }, []);

  const handleMarkerDrag = useCallback((marker: 'in' | 'out', newTime: number) => {
    setMarkerTimeAndSeek(marker, newTime);
  }, [setMarkerTimeAndSeek]);

  const handleMarkerDragEnd = useCallback(() => {
    setFocusedMarker(null);
  }, []);

  const handleContainerMouseDown = useCallback((e: React.MouseEvent) => {
    if (!focusedMarker) return;
    const target = e.target as HTMLElement;
    const progressBar = target.closest('.preview-progress-bar');
    if (!progressBar) {
      setFocusedMarker(null);
    }
  }, [focusedMarker]);

  return {
    singleModeInPoint,
    setSingleModeInPoint,
    singleModeOutPoint,
    setSingleModeOutPoint,
    focusedMarker,
    setFocusedMarker,
    inPoint,
    outPoint,
    notifyRangeChange,
    setMarkerTimeAndSeek,
    stepFocusedMarker,
    handleMarkerFocus,
    handleMarkerDrag,
    handleMarkerDragEnd,
    handleContainerMouseDown,
  };
}
