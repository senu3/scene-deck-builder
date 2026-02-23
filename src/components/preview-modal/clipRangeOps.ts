import { clampToDuration } from './helpers';

interface ComputeRangeInput {
  playheadTime: number;
  duration: number;
  inPoint: number | null;
  outPoint: number | null;
}

export function computeNextRangeForSetIn({
  playheadTime,
  duration,
  inPoint: _inPoint,
  outPoint,
}: ComputeRangeInput): { inPoint: number | null; outPoint: number | null } {
  void _inPoint;
  const nextInPoint = clampToDuration(playheadTime, duration);
  const nextOutPoint = outPoint !== null && nextInPoint >= outPoint ? null : outPoint;
  return { inPoint: nextInPoint, outPoint: nextOutPoint };
}

export function computeNextRangeForSetOut({
  playheadTime,
  duration,
  inPoint,
  outPoint: _outPoint,
}: ComputeRangeInput): { inPoint: number | null; outPoint: number | null } {
  void _outPoint;
  const nextOutPoint = clampToDuration(playheadTime, duration);
  const nextInPoint = inPoint !== null && nextOutPoint <= inPoint ? null : inPoint;
  return { inPoint: nextInPoint, outPoint: nextOutPoint };
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
