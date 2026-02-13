import type { CutSubtitle, CutSubtitleRange } from '../types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function normalizeSubtitleRange(
  range: CutSubtitleRange | undefined,
  cutDuration: number
): CutSubtitleRange | undefined {
  if (!range) return undefined;
  if (!Number.isFinite(cutDuration) || cutDuration <= 0) return undefined;
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end)) return undefined;

  const max = Math.max(0, cutDuration);
  const clampedStart = clamp(range.start, 0, max);
  const clampedEnd = clamp(range.end, 0, max);
  const start = Math.min(clampedStart, clampedEnd);
  const end = Math.max(clampedStart, clampedEnd);
  return { start, end };
}

export function resolveSubtitleVisibility(
  subtitle: CutSubtitle | undefined,
  localTimeSec: number,
  cutDuration: number
): boolean {
  if (!subtitle) return false;
  if (!subtitle.text.trim()) return false;
  if (!Number.isFinite(localTimeSec)) return false;
  if (!Number.isFinite(cutDuration) || cutDuration <= 0) return false;

  const local = clamp(localTimeSec, 0, cutDuration);
  const range = normalizeSubtitleRange(subtitle.range, cutDuration);
  if (!range) {
    return true;
  }

  return local >= range.start && local <= range.end;
}
