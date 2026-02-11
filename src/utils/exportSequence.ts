import type { Cut, FramingAnchor, FramingMode, Scene } from '../types';
import { getScenesAndCutsInTimelineOrder } from './timelineOrder';

export interface ExportSequenceItem {
  type: 'image' | 'video';
  path: string;
  duration: number;
  inPoint?: number;
  outPoint?: number;
  framingMode: FramingMode;
  framingAnchor: FramingAnchor;
}

export interface ExportFramingDefaults {
  mode?: FramingMode;
  anchor?: FramingAnchor;
}

export interface BuildExportSequenceOptions {
  framingDefaults?: ExportFramingDefaults;
  debugFraming?: boolean;
}

interface ResolvedFramingParams {
  mode: FramingMode;
  anchor: FramingAnchor;
  source: 'cut' | 'global' | 'fixed';
}

const DEFAULT_FRAMING_MODE: FramingMode = 'cover';
const DEFAULT_FRAMING_ANCHOR: FramingAnchor = 'center';

function resolveExportDuration(cut: Cut): { duration: number; adjusted: boolean } {
  if (Number.isFinite(cut.displayTime) && cut.displayTime > 0) {
    return { duration: cut.displayTime, adjusted: false };
  }

  if (cut.asset?.type === 'video' && Number.isFinite(cut.asset.duration) && (cut.asset.duration as number) > 0) {
    return { duration: cut.asset.duration as number, adjusted: true };
  }

  return { duration: 1.0, adjusted: true };
}

export function resolveFramingParams(
  cut: Cut,
  framingDefaults: ExportFramingDefaults = {}
): ResolvedFramingParams {
  const cutMode = cut.framing?.mode;
  const cutAnchor = cut.framing?.anchor;
  if (cutMode || cutAnchor) {
    return {
      mode: cutMode ?? framingDefaults.mode ?? DEFAULT_FRAMING_MODE,
      anchor: cutAnchor ?? framingDefaults.anchor ?? DEFAULT_FRAMING_ANCHOR,
      source: 'cut',
    };
  }

  if (framingDefaults.mode || framingDefaults.anchor) {
    return {
      mode: framingDefaults.mode ?? DEFAULT_FRAMING_MODE,
      anchor: framingDefaults.anchor ?? DEFAULT_FRAMING_ANCHOR,
      source: 'global',
    };
  }

  return {
    mode: DEFAULT_FRAMING_MODE,
    anchor: DEFAULT_FRAMING_ANCHOR,
    source: 'fixed',
  };
}

function buildExportSequenceItemFromCut(
  cut: Cut,
  options: BuildExportSequenceOptions,
  context: { sceneId?: string; cutId: string }
): ExportSequenceItem | null {
  const path = cut.asset?.path || '';
  if (!path) return null;

  if (cut.asset?.type === 'audio') {
    console.warn(`[export] Skipping audio-only cut ${context.cutId}${context.sceneId ? ` in scene ${context.sceneId}` : ''}.`);
    return null;
  }

  const { duration, adjusted } = resolveExportDuration(cut);
  if (adjusted) {
    console.warn(
      `[export] Invalid displayTime detected for cut ${context.cutId}${context.sceneId ? ` in scene ${context.sceneId}` : ''}. ` +
      `Using fallback duration ${duration.toFixed(3)}s.`
    );
  }

  const framing = resolveFramingParams(cut, options.framingDefaults);
  if (options.debugFraming) {
    console.info(
      `[export][framing] cut=${context.cutId} mode=${framing.mode} anchor=${framing.anchor} source=${framing.source}`
    );
  }

  return {
    type: cut.asset?.type || 'image',
    path,
    duration,
    inPoint: cut.isClip ? cut.inPoint : undefined,
    outPoint: cut.isClip ? cut.outPoint : undefined,
    framingMode: framing.mode,
    framingAnchor: framing.anchor,
  };
}

export function buildSequenceItemsForCuts(
  cuts: Cut[],
  options: BuildExportSequenceOptions = {}
): ExportSequenceItem[] {
  const sequenceItems: ExportSequenceItem[] = [];

  for (const cut of cuts) {
    const item = buildExportSequenceItemFromCut(cut, options, { cutId: cut.id });
    if (item) {
      sequenceItems.push(item);
    }
  }

  return sequenceItems;
}

export function buildSequenceItemsForExport(
  scenes: Scene[],
  options: BuildExportSequenceOptions = {}
): ExportSequenceItem[] {
  const orderedScenes = getScenesAndCutsInTimelineOrder(scenes);
  const sequenceItems: ExportSequenceItem[] = [];

  for (const scene of orderedScenes) {
    for (const cut of scene.cuts) {
      const item = buildExportSequenceItemFromCut(cut, options, { sceneId: scene.id, cutId: cut.id });
      if (item) {
        sequenceItems.push(item);
      }
    }
  }

  return sequenceItems;
}
