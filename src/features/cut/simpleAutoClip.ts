import type { AudioAnalysis } from '../../types';
import { analyzeAudioRms } from '../../utils/audioUtils';

export type SimpleAutoClipMode = 'default' | 'conservative' | 'aggressive';

export interface SimpleAutoClipProfile {
  targetLenSec: number;
  minLenSec: number;
  maxCuts: number;
  rmsFps: number;
  smoothingSec: number;
  strongPercentile: number;
  snapWindowSec: number;
}

const PROFILE_BY_MODE: Record<SimpleAutoClipMode, SimpleAutoClipProfile> = {
  default: {
    targetLenSec: 2.0,
    minLenSec: 1.0,
    maxCuts: 12,
    rmsFps: 30,
    smoothingSec: 0.4,
    strongPercentile: 0.88,
    snapWindowSec: 0.7,
  },
  conservative: {
    targetLenSec: 4.0,
    minLenSec: 1.0,
    maxCuts: 10,
    rmsFps: 24,
    smoothingSec: 0.6,
    strongPercentile: 0.92,
    snapWindowSec: 1.0,
  },
  aggressive: {
    targetLenSec: 1.5,
    minLenSec: 1.0,
    maxCuts: 16,
    rmsFps: 30,
    smoothingSec: 0.35,
    strongPercentile: 0.86,
    snapWindowSec: 0.65,
  },
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function quantizeMs(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * clamp01(p))));
  return sorted[index] ?? 0;
}

function smoothSeries(values: number[], windowFrames: number): number[] {
  if (values.length <= 1 || windowFrames <= 1) return [...values];
  const half = Math.max(1, Math.floor(windowFrames / 2));
  const smoothed: number[] = new Array(values.length).fill(0);

  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(values.length - 1, i + half);
    let sum = 0;
    let count = 0;
    for (let j = start; j <= end; j++) {
      sum += values[j] ?? 0;
      count += 1;
    }
    smoothed[i] = count > 0 ? sum / count : values[i] ?? 0;
  }

  return smoothed;
}

function buildBaseBoundaries(durationSec: number, targetLenSec: number): number[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0 || targetLenSec <= 0) return [];
  const boundaries: number[] = [];
  for (let t = targetLenSec; t < durationSec; t += targetLenSec) {
    boundaries.push(quantizeMs(t));
  }
  return boundaries;
}

function detectStrongChangeTimes(rms: number[], fps: number, smoothingSec: number, strongPercentile: number): number[] {
  if (rms.length < 3 || fps <= 0) return [];
  const windowFrames = Math.max(1, Math.round(smoothingSec * fps));
  const smoothed = smoothSeries(rms, windowFrames);
  const diffs: number[] = [];
  for (let i = 1; i < smoothed.length; i++) {
    diffs.push(Math.abs((smoothed[i] ?? 0) - (smoothed[i - 1] ?? 0)));
  }
  const threshold = percentile(diffs, strongPercentile);
  if (!(threshold > 0)) return [];

  const strongTimes: number[] = [];
  for (let i = 1; i < smoothed.length; i++) {
    const diff = Math.abs((smoothed[i] ?? 0) - (smoothed[i - 1] ?? 0));
    if (diff >= threshold) {
      strongTimes.push(quantizeMs(i / fps));
    }
  }
  return strongTimes;
}

function snapToStrongChanges(baseBoundaries: number[], strongTimes: number[], snapWindowSec: number): number[] {
  if (baseBoundaries.length === 0 || strongTimes.length === 0 || snapWindowSec <= 0) {
    return [...baseBoundaries];
  }

  return baseBoundaries.map((boundary) => {
    let nearest = boundary;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const strong of strongTimes) {
      const distance = Math.abs(strong - boundary);
      if (distance < nearestDistance && distance <= snapWindowSec) {
        nearestDistance = distance;
        nearest = strong;
      }
    }
    return quantizeMs(nearest);
  });
}

function normalizeBoundaries(
  boundaries: number[],
  durationSec: number,
  minLenSec: number,
  maxCuts: number
): number[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [];
  const maxBoundaries = Math.max(0, maxCuts - 1);
  if (maxBoundaries === 0) return [];

  const uniqueSorted = Array.from(
    new Set(
      boundaries
        .filter((value) => Number.isFinite(value))
        .map((value) => quantizeMs(value))
    )
  )
    .filter((value) => value > 0 && value < durationSec)
    .sort((a, b) => a - b);

  const merged: number[] = [];
  let previous = 0;
  for (const boundary of uniqueSorted) {
    if (boundary - previous < minLenSec) continue;
    if (durationSec - boundary < minLenSec) continue;
    merged.push(boundary);
    previous = boundary;
    if (merged.length >= maxBoundaries) break;
  }

  return merged;
}

export function getSimpleAutoClipProfile(mode: SimpleAutoClipMode): SimpleAutoClipProfile {
  return PROFILE_BY_MODE[mode];
}

export function buildSimpleAutoClipRanges(durationSec: number, splitPoints: number[]): Array<{ start: number; end: number }> {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [];
  const ranges: Array<{ start: number; end: number }> = [];
  const sorted = [...splitPoints].sort((a, b) => a - b);
  let cursor = 0;
  for (const splitPoint of sorted) {
    if (splitPoint <= cursor || splitPoint >= durationSec) continue;
    ranges.push({ start: cursor, end: splitPoint });
    cursor = splitPoint;
  }
  if (cursor < durationSec) {
    ranges.push({ start: cursor, end: durationSec });
  }
  return ranges.filter((range) => range.end > range.start);
}

export interface GenerateSimpleAutoClipSplitPointsParams {
  mode: SimpleAutoClipMode;
  durationSec: number;
  sourcePath?: string;
  analyzeRms?: (path: string, fps: number) => Promise<AudioAnalysis | null>;
}

export async function generateSimpleAutoClipSplitPoints({
  mode,
  durationSec,
  sourcePath,
  analyzeRms = analyzeAudioRms,
}: GenerateSimpleAutoClipSplitPointsParams): Promise<number[]> {
  const profile = getSimpleAutoClipProfile(mode);
  if (!Number.isFinite(durationSec) || durationSec <= profile.minLenSec) {
    return [];
  }

  const base = buildBaseBoundaries(durationSec, profile.targetLenSec);
  if (base.length === 0) {
    return [];
  }

  let candidates = base;
  if (sourcePath) {
    try {
      const analysis = await analyzeRms(sourcePath, profile.rmsFps);
      if (analysis?.rms?.length && Number.isFinite(analysis.fps) && analysis.fps > 0) {
        const strongTimes = detectStrongChangeTimes(
          analysis.rms,
          analysis.fps,
          profile.smoothingSec,
          profile.strongPercentile
        );
        candidates = snapToStrongChanges(base, strongTimes, profile.snapWindowSec);
      }
    } catch {
      // Fallback to base segmentation when analysis fails.
      candidates = base;
    }
  }

  return normalizeBoundaries(candidates, durationSec, profile.minLenSec, profile.maxCuts);
}
