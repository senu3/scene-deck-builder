export interface LipSyncExportPayload {
  framePaths: string[];
  rms: number[];
  rmsFps: number;
  thresholds: { t1: number; t2: number; t3: number };
  audioOffsetSec: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeThresholds(thresholds: { t1: number; t2: number; t3: number }) {
  const t1 = clamp01(thresholds.t1);
  const t2 = clamp01(Math.max(t1, thresholds.t2));
  const t3 = clamp01(Math.max(t2, thresholds.t3));
  return { t1, t2, t3 };
}

function rmsValueToVariantIndex(value: number, thresholds: { t1: number; t2: number; t3: number }): number {
  const normalized = normalizeThresholds(thresholds);
  const v = clamp01(value);
  if (v >= normalized.t3) return 3;
  if (v >= normalized.t2) return 2;
  if (v >= normalized.t1) return 1;
  return 0;
}

function absoluteTimeToRmsIndex(
  absoluteTimeSec: number,
  fps: number,
  length: number,
  offsetSec: number = 0
): number {
  if (length <= 0 || fps <= 0) return 0;
  const effectiveTime = Math.max(0, absoluteTimeSec + offsetSec);
  const index = Math.floor(effectiveTime * fps);
  if (index < 0) return 0;
  if (index >= length) return length - 1;
  return index;
}

function quoteConcatPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/'/g, "'\\''");
}

export function validateLipSyncExportPayload(payload: LipSyncExportPayload): string | null {
  if (!Array.isArray(payload.framePaths) || payload.framePaths.length === 0) {
    return 'framePaths is empty';
  }
  if (payload.framePaths.some((path) => typeof path !== 'string' || path.length === 0)) {
    return 'framePaths contains invalid path';
  }
  if (!Array.isArray(payload.rms) || payload.rms.length === 0) {
    return 'rms is empty';
  }
  if (!Number.isFinite(payload.rmsFps) || payload.rmsFps <= 0) {
    return 'rmsFps must be > 0';
  }
  if (!payload.thresholds || !Number.isFinite(payload.thresholds.t1) || !Number.isFinite(payload.thresholds.t2) || !Number.isFinite(payload.thresholds.t3)) {
    return 'thresholds are invalid';
  }
  if (!Number.isFinite(payload.audioOffsetSec)) {
    return 'audioOffsetSec is invalid';
  }
  return null;
}

export function createLipSyncConcatList(
  payload: LipSyncExportPayload,
  durationSec: number,
  outputFps: number
): string {
  const duration = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 1;
  const fps = Number.isFinite(outputFps) && outputFps > 0 ? outputFps : 30;
  const frameStep = 1 / fps;
  const frameCount = Math.max(1, Math.round(duration * fps));

  const fallbackPath = payload.framePaths[0];
  const lines: string[] = [];
  let lastFramePath = fallbackPath;

  for (let frame = 0; frame < frameCount; frame++) {
    const time = frame / fps;
    const rmsIndex = absoluteTimeToRmsIndex(time, payload.rmsFps, payload.rms.length, payload.audioOffsetSec);
    const rmsValue = payload.rms[rmsIndex] ?? 0;
    const variant = rmsValueToVariantIndex(rmsValue, payload.thresholds);
    const framePath = payload.framePaths[Math.min(variant, payload.framePaths.length - 1)] || fallbackPath;
    lastFramePath = framePath;
    lines.push(`file '${quoteConcatPath(framePath)}'`);
    lines.push(`duration ${frameStep.toFixed(6)}`);
  }

  lines.push(`file '${quoteConcatPath(lastFramePath)}'`);
  return lines.join('\n');
}
