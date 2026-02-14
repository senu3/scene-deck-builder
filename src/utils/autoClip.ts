export interface TimeRange {
  start: number;
  end: number;
}

export interface RmsPeakParams {
  fps: number;
  threshold: number;
  minGapSec: number;
  smoothingMs?: number;
  minPeakRatio?: number;
}

const EPSILON = 1e-6;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeRange(range: TimeRange): TimeRange | null {
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end)) return null;
  const start = Math.min(range.start, range.end);
  const end = Math.max(range.start, range.end);
  if (end - start <= EPSILON) return null;
  return { start, end };
}

export function normalizeExcludeRanges(
  ranges: TimeRange[],
  durationSec: number,
  minWidthSec: number
): TimeRange[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [];
  const clampedMinWidth = Math.max(0, minWidthSec);
  const normalized = ranges
    .map(normalizeRange)
    .filter((range): range is TimeRange => range !== null)
    .map((range) => ({
      start: clamp(range.start, 0, durationSec),
      end: clamp(range.end, 0, durationSec),
    }))
    .filter((range) => range.end - range.start >= clampedMinWidth - EPSILON)
    .sort((a, b) => a.start - b.start);

  const merged: TimeRange[] = [];
  for (const range of normalized) {
    const last = merged[merged.length - 1];
    if (!last || range.start > last.end + EPSILON) {
      merged.push({ ...range });
      continue;
    }
    last.end = Math.max(last.end, range.end);
  }
  return merged;
}

export function addExcludeRange(
  ranges: TimeRange[],
  next: TimeRange,
  durationSec: number,
  minWidthSec: number
): TimeRange[] {
  return normalizeExcludeRanges([...ranges, next], durationSec, minWidthSec);
}

export function removeExcludeRange(
  ranges: TimeRange[],
  erase: TimeRange,
  durationSec: number,
  minWidthSec: number
): TimeRange[] {
  const normalizedErase = normalizeExcludeRanges([erase], durationSec, 0)[0];
  if (!normalizedErase) return normalizeExcludeRanges(ranges, durationSec, minWidthSec);

  const next: TimeRange[] = [];
  for (const range of normalizeExcludeRanges(ranges, durationSec, minWidthSec)) {
    if (normalizedErase.end <= range.start + EPSILON || normalizedErase.start >= range.end - EPSILON) {
      next.push(range);
      continue;
    }
    if (normalizedErase.start > range.start + EPSILON) {
      next.push({ start: range.start, end: normalizedErase.start });
    }
    if (normalizedErase.end < range.end - EPSILON) {
      next.push({ start: normalizedErase.end, end: range.end });
    }
  }
  return normalizeExcludeRanges(next, durationSec, minWidthSec);
}

export function toggleNearestExcludeRange(
  ranges: TimeRange[],
  timeSec: number,
  durationSec: number,
  minWidthSec: number,
  proximitySec = 0.4
): TimeRange[] {
  const normalized = normalizeExcludeRanges(ranges, durationSec, minWidthSec);
  let target: TimeRange | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const range of normalized) {
    const distance =
      timeSec >= range.start && timeSec <= range.end
        ? 0
        : Math.min(Math.abs(timeSec - range.start), Math.abs(timeSec - range.end));
    if (distance < bestDistance) {
      bestDistance = distance;
      target = range;
    }
  }

  if (target && bestDistance <= proximitySec) {
    return normalized.filter((range) => range !== target);
  }

  const half = Math.max(minWidthSec / 2, 0.15);
  return addExcludeRange(
    normalized,
    { start: timeSec - half, end: timeSec + half },
    durationSec,
    minWidthSec
  );
}

export function extractHistogramCandidates(
  scores: number[],
  threshold: number,
  minGapSec: number,
  fps: number,
  edgePaddingSec = 0.5,
  minPeakRatio = 0
): number[] {
  if (!Number.isFinite(fps) || fps <= 0 || scores.length === 0) return [];
  const minGapFrames = Math.max(1, Math.round(minGapSec * fps));
  const thresholdSafe = Number.isFinite(threshold) ? threshold : 0;
  const peaks: Array<{ frame: number; score: number }> = [];
  const edgeFrames = Math.max(0, Math.floor(edgePaddingSec * fps));
  const endFrame = Math.max(0, scores.length - 1 - edgeFrames);

  for (let i = edgeFrames; i <= endFrame; i++) {
    const score = scores[i] ?? 0;
    if (score <= thresholdSafe) continue;
    const prev = i > 0 ? (scores[i - 1] ?? 0) : score;
    const next = i < scores.length - 1 ? (scores[i + 1] ?? 0) : score;
    if (score >= prev && score >= next) {
      peaks.push({ frame: i, score });
    }
  }

  peaks.sort((a, b) => b.score - a.score);
  const strongest = peaks.length > 0 ? peaks[0].score : 0;
  const ratio = Math.max(0, Math.min(1, minPeakRatio));
  const accepted: number[] = [];
  for (const peak of peaks) {
    if (strongest > 0 && peak.score < strongest * ratio) continue;
    const isTooClose = accepted.some((frame) => Math.abs(frame - peak.frame) < minGapFrames);
    if (!isTooClose) accepted.push(peak.frame);
  }

  return accepted.sort((a, b) => a - b).map((frame) => frame / fps);
}

function movingAverage(values: number[], windowSize: number): number[] {
  if (values.length === 0) return [];
  const size = Math.max(1, windowSize);
  if (size === 1) return [...values];

  const out = new Array<number>(values.length);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= size) {
      sum -= values[i - size];
    }
    const count = Math.min(i + 1, size);
    out[i] = sum / count;
  }
  return out;
}

export function extractRmsCandidates(
  rms: number[],
  params: RmsPeakParams
): { smoothed: number[]; peaks: number[]; candidates: number[] } {
  const fps = Number.isFinite(params.fps) && params.fps > 0 ? params.fps : 60;
  const smoothingMs = Number.isFinite(params.smoothingMs) ? Math.max(0, params.smoothingMs as number) : 240;
  const smoothingFrames = Math.max(1, Math.round((smoothingMs / 1000) * fps));
  const threshold = Number.isFinite(params.threshold) ? Math.max(0, params.threshold) : 0.08;
  const minGapFrames = Math.max(1, Math.round(Math.max(0, params.minGapSec) * fps));
  const smoothed = movingAverage(rms, smoothingFrames);

  const peaks: number[] = [];
  for (let i = 1; i < smoothed.length - 1; i++) {
    const value = smoothed[i];
    if (value < threshold) continue;
    if (value >= smoothed[i - 1] && value >= smoothed[i + 1]) {
      peaks.push(i);
    }
  }

  const ratio = Math.max(0, Math.min(1, params.minPeakRatio ?? 0));
  const sortedPeaks = peaks.sort((a, b) => smoothed[b] - smoothed[a]);
  const strongest = sortedPeaks.length > 0 ? smoothed[sortedPeaks[0]] : 0;
  const selectedFrames: number[] = [];
  for (const frame of sortedPeaks) {
    if (strongest > 0 && smoothed[frame] < strongest * ratio) continue;
    const tooClose = selectedFrames.some((existing) => Math.abs(existing - frame) < minGapFrames);
    if (!tooClose) selectedFrames.push(frame);
  }

  const candidates = selectedFrames.sort((a, b) => a - b).map((frame) => frame / fps);
  return { smoothed, peaks: peaks.map((frame) => frame / fps), candidates };
}

export function filterCandidatesByExcludeRanges(
  candidates: number[],
  excludeRanges: TimeRange[]
): number[] {
  if (excludeRanges.length === 0) return [...candidates];
  return candidates.filter((time) =>
    !excludeRanges.some((range) => time >= range.start - EPSILON && time <= range.end + EPSILON)
  );
}

export function buildClipSegments(
  cutDurationSec: number,
  candidates: number[],
  minSegmentSec = 0.12
): TimeRange[] {
  if (!Number.isFinite(cutDurationSec) || cutDurationSec <= 0) return [];
  const points = Array.from(
    new Set(
      candidates
        .filter((value) => Number.isFinite(value) && value > 0 && value < cutDurationSec)
        .map((value) => clamp(value, 0, cutDurationSec))
    )
  ).sort((a, b) => a - b);

  const boundaries = [0, ...points, cutDurationSec];
  const segments: TimeRange[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    if (end - start >= minSegmentSec - EPSILON) {
      segments.push({ start, end });
    }
  }
  return segments;
}

export function makeAutoClipParamsHash(params: Record<string, unknown>): string {
  return JSON.stringify(params, Object.keys(params).sort());
}
