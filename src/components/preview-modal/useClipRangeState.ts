import { useCallback, useState } from 'react';
import type { FocusedMarker } from '../shared';

interface UseClipRangeStateInput {
  usesSequenceController: boolean;
  sequenceInPoint: number | null;
  sequenceOutPoint: number | null;
  initialInPoint?: number;
  initialOutPoint?: number;
  onRangeChange?: (range: { inPoint: number | null; outPoint: number | null }) => void;
}

export function useClipRangeState({
  usesSequenceController,
  sequenceInPoint,
  sequenceOutPoint,
  initialInPoint,
  initialOutPoint,
  onRangeChange,
}: UseClipRangeStateInput) {
  const [singleModeInPoint, setSingleModeInPoint] = useState<number | null>(initialInPoint ?? null);
  const [singleModeOutPoint, setSingleModeOutPoint] = useState<number | null>(initialOutPoint ?? null);
  const [focusedMarker, setFocusedMarker] = useState<FocusedMarker>(null);

  const inPoint = usesSequenceController ? sequenceInPoint : singleModeInPoint;
  const outPoint = usesSequenceController ? sequenceOutPoint : singleModeOutPoint;

  const notifyRangeChange = useCallback((nextInPoint: number | null, nextOutPoint: number | null) => {
    onRangeChange?.({ inPoint: nextInPoint, outPoint: nextOutPoint });
  }, [onRangeChange]);

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
  };
}
