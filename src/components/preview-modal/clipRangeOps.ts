import { clampToDuration } from './helpers';

interface ComputeRangeInput {
  playheadTime: number;
  duration: number;
  inPoint: number | null;
  outPoint: number | null;
  keepOppositeWhenCrossed?: boolean;
}

export function computeNextRangeForSetIn({
  playheadTime,
  duration,
  inPoint: _inPoint,
  outPoint,
  keepOppositeWhenCrossed = false,
}: ComputeRangeInput): { inPoint: number | null; outPoint: number | null } {
  void _inPoint;
  const nextInPoint = clampToDuration(playheadTime, duration);
  if (outPoint === null) {
    return { inPoint: nextInPoint, outPoint };
  }
  const nextOutPoint = keepOppositeWhenCrossed
    ? outPoint
    : (nextInPoint >= outPoint ? null : outPoint);
  const constrainedInPoint = keepOppositeWhenCrossed ? Math.min(nextInPoint, outPoint) : nextInPoint;
  return { inPoint: constrainedInPoint, outPoint: nextOutPoint };
}

export function computeNextRangeForSetOut({
  playheadTime,
  duration,
  inPoint,
  outPoint: _outPoint,
  keepOppositeWhenCrossed = false,
}: ComputeRangeInput): { inPoint: number | null; outPoint: number | null } {
  void _outPoint;
  const nextOutPoint = clampToDuration(playheadTime, duration);
  if (inPoint === null) {
    return { inPoint, outPoint: nextOutPoint };
  }
  const nextInPoint = keepOppositeWhenCrossed
    ? inPoint
    : (nextOutPoint <= inPoint ? null : inPoint);
  const constrainedOutPoint = keepOppositeWhenCrossed ? Math.max(nextOutPoint, inPoint) : nextOutPoint;
  return { inPoint: nextInPoint, outPoint: constrainedOutPoint };
}

interface ResolveUiPlayheadTimeInput {
  isSingleModeVideo: boolean;
  singleModeCurrentTime: number;
  getSequenceAbsoluteTime: () => number;
}

export function resolveUiPlayheadTime({
  isSingleModeVideo,
  singleModeCurrentTime,
  getSequenceAbsoluteTime,
}: ResolveUiPlayheadTimeInput): number {
  if (isSingleModeVideo) {
    return singleModeCurrentTime;
  }
  return getSequenceAbsoluteTime();
}
