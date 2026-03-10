import type { ExportAudioEvent, ExportAudioPlan } from './exportAudioPlan';

export interface PreviewAudioPlanWindow {
  startSec: number;
  endSec: number;
}

export interface SlicePreviewAudioPlanOptions {
  excludeSourceTypes?: ExportAudioEvent['sourceType'][];
}

function normalizeSeconds(value: number | undefined, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return value as number;
}

export function slicePreviewAudioPlan(
  baseAudioPlan: ExportAudioPlan,
  window: PreviewAudioPlanWindow,
  options: SlicePreviewAudioPlanOptions = {}
): ExportAudioPlan {
  const windowStartSec = Math.max(0, normalizeSeconds(window.startSec, 0));
  const windowEndSec = Math.max(windowStartSec, normalizeSeconds(window.endSec, windowStartSec));
  const excludedTypes = new Set(options.excludeSourceTypes ?? []);

  const events: ExportAudioEvent[] = [];
  for (const event of baseAudioPlan.events) {
    if (excludedTypes.has(event.sourceType)) continue;

    const eventStartSec = normalizeSeconds(event.timelineStartSec, 0);
    const eventEndSec = eventStartSec + Math.max(0, normalizeSeconds(event.durationSec, 0));
    const trimStartSec = Math.max(eventStartSec, windowStartSec);
    const trimEndSec = Math.min(eventEndSec, windowEndSec);
    if (trimEndSec <= trimStartSec) continue;

    const trimDeltaSec = trimStartSec - eventStartSec;
    events.push({
      ...event,
      timelineStartSec: trimStartSec - windowStartSec,
      durationSec: trimEndSec - trimStartSec,
      sourceOffsetSec: normalizeSeconds(event.sourceOffsetSec, 0) + trimDeltaSec,
    });
  }

  return {
    totalDurationSec: windowEndSec - windowStartSec,
    events,
  };
}
