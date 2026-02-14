import type { Asset, AssetMetadata, Cut, CutSubtitle, FramingAnchor, FramingMode, Scene } from '../types';
import { getScenesAndCutsInTimelineOrder } from './timelineOrder';
import { getLipSyncFrameAssetIds, normalizeThresholds } from './lipSyncUtils';
import { normalizeSubtitleRange } from './subtitleUtils';

export interface ExportSequenceItem {
  type: 'image' | 'video';
  path: string;
  duration: number;
  inPoint?: number;
  outPoint?: number;
  framingMode: FramingMode;
  framingAnchor: FramingAnchor;
  lipSync?: {
    framePaths: string[];
    rms: number[];
    rmsFps: number;
    thresholds: { t1: number; t2: number; t3: number };
    audioOffsetSec: number;
  };
  subtitle?: {
    text: string;
    range?: { start: number; end: number };
  };
}

export interface ExportFramingDefaults {
  mode?: FramingMode;
  anchor?: FramingAnchor;
}

export interface BuildExportSequenceOptions {
  framingDefaults?: ExportFramingDefaults;
  debugFraming?: boolean;
  metadataByAssetId?: Record<string, AssetMetadata>;
  resolveAssetById?: (assetId: string) => Asset | undefined;
  strictLipSync?: boolean;
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

  const lipSync = resolveLipSyncExport(cut, options, context);
  const subtitle = resolveExportSubtitle(cut.subtitle, duration);

  return {
    type: cut.asset?.type || 'image',
    path,
    duration,
    inPoint: cut.isClip ? cut.inPoint : undefined,
    outPoint: cut.isClip ? cut.outPoint : undefined,
    framingMode: framing.mode,
    framingAnchor: framing.anchor,
    lipSync: lipSync ?? undefined,
    subtitle: subtitle ?? undefined,
  };
}

function resolveExportSubtitle(
  subtitle: CutSubtitle | undefined,
  itemDurationSec: number
): ExportSequenceItem['subtitle'] | null {
  if (!subtitle) return null;
  if (!subtitle.text.trim()) return null;
  const normalizedRange = normalizeSubtitleRange(subtitle.range, itemDurationSec);
  return {
    text: subtitle.text,
    range: normalizedRange ? { start: normalizedRange.start, end: normalizedRange.end } : undefined,
  };
}

function getPrimaryAudioOffset(cut: Cut): number {
  if (!cut.audioBindings?.length) return 0;
  const enabledBindings = cut.audioBindings.filter((binding) => binding.enabled !== false);
  if (enabledBindings.length === 0) {
    return cut.audioBindings[0]?.offsetSec ?? 0;
  }

  const kindPriority: Record<'voice.lipsync' | 'voice.other' | 'se', number> = {
    'voice.lipsync': 0,
    'voice.other': 1,
    'se': 2,
  };
  const binding = enabledBindings
    .slice()
    .sort((a, b) => kindPriority[a.kind] - kindPriority[b.kind])[0];
  return binding?.offsetSec ?? 0;
}

function resolveLipSyncExport(
  cut: Cut,
  options: BuildExportSequenceOptions,
  context: { sceneId?: string; cutId: string }
): ExportSequenceItem['lipSync'] | null {
  const strictLipSync = options.strictLipSync !== false;
  const failLipSync = (message: string): null => {
    if (strictLipSync) {
      throw new Error(`[export] ${message}`);
    }
    console.warn(`[export] ${message}`);
    return null;
  };

  if (!cut.isLipSync) return null;

  const cutAssetId = cut.asset?.id ?? cut.assetId;
  const metadata = cutAssetId ? options.metadataByAssetId?.[cutAssetId] : undefined;
  const lipSyncSettings = metadata?.lipSync;
  if (!lipSyncSettings) {
    return failLipSync(`LipSync cut ${context.cutId} is missing lipSync settings.`);
  }

  const analysis = options.metadataByAssetId?.[lipSyncSettings.rmsSourceAudioAssetId]?.audioAnalysis;
  if (!analysis?.rms?.length || !Number.isFinite(analysis.fps) || analysis.fps <= 0) {
    return failLipSync(`LipSync cut ${context.cutId} is missing RMS analysis.`);
  }

  if (!options.resolveAssetById) {
    return failLipSync(`LipSync cut ${context.cutId} cannot resolve frame assets (resolver missing).`);
  }

  const frameIds = getLipSyncFrameAssetIds(lipSyncSettings);
  const framePathsRaw = frameIds
    .map((id) => options.resolveAssetById?.(id)?.path)
    .filter((path): path is string => typeof path === 'string' && path.length > 0);
  if (framePathsRaw.length === 0) {
    return failLipSync(`LipSync cut ${context.cutId} has no resolvable frame paths.`);
  }

  const fallbackPath = framePathsRaw[0];
  const framePaths = frameIds.map((id) => options.resolveAssetById?.(id)?.path || fallbackPath);

  return {
    framePaths,
    rms: analysis.rms,
    rmsFps: analysis.fps,
    thresholds: normalizeThresholds(lipSyncSettings.thresholds),
    audioOffsetSec: getPrimaryAudioOffset(cut),
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
  sceneOrderOrOptions?: string[] | BuildExportSequenceOptions,
  optionsArg?: BuildExportSequenceOptions
): ExportSequenceItem[] {
  const sceneOrder = Array.isArray(sceneOrderOrOptions) ? sceneOrderOrOptions : undefined;
  const options = (Array.isArray(sceneOrderOrOptions) ? optionsArg : sceneOrderOrOptions) || {};
  const orderedScenes = getScenesAndCutsInTimelineOrder(scenes, sceneOrder);
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
