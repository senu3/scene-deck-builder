import type { Asset, AssetMetadata, Cut, FramingAnchor, FramingMode, Scene } from '../types';
import { getScenesAndCutsInTimelineOrder } from './timelineOrder';
import { resolveCutAsset } from './assetResolve';
import { computeCanonicalStoryTimingsForCuts } from './storyTiming';

export interface ExportSequenceItem {
  type: 'image' | 'video';
  path: string;
  duration: number;
  inPoint?: number;
  outPoint?: number;
  holdDurationSec?: number;
  framingMode: FramingMode;
  framingAnchor: FramingAnchor;
  flags?: {
    isClip?: boolean;
    isMuted?: boolean;
    isHold?: boolean;
  };
}

export type ExportSequenceBuildWarningCode =
  | 'missing-asset'
  | 'audio-only-cut-skipped'
  | 'non-canonical-cut-adjusted';

export interface ExportSequenceBuildWarning {
  code: ExportSequenceBuildWarningCode;
  cutId: string;
  sceneId?: string;
  assetId?: string;
  message: string;
}

export interface ExportFramingDefaults {
  mode?: FramingMode;
  anchor?: FramingAnchor;
}

export interface BuildExportSequenceOptions {
  framingDefaults?: ExportFramingDefaults;
  metadataByAssetId?: Record<string, AssetMetadata>;
  resolveAssetById?: (assetId: string) => Asset | undefined;
  onWarning?: (warning: ExportSequenceBuildWarning) => void;
}

interface ResolvedFramingParams {
  mode: FramingMode;
  anchor: FramingAnchor;
  source: 'cut' | 'global' | 'fixed';
}

const DEFAULT_FRAMING_MODE: FramingMode = 'cover';
const DEFAULT_FRAMING_ANCHOR: FramingAnchor = 'center';

function emitWarning(options: BuildExportSequenceOptions, warning: ExportSequenceBuildWarning) {
  options.onWarning?.(warning);
}

function resolveAssetForExport(cut: Cut, options: BuildExportSequenceOptions): Asset | null {
  return resolveCutAsset(cut, (assetId) => options.resolveAssetById?.(assetId));
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
  context: { sceneId?: string; cutId: string },
  durationInfo: { duration: number; adjusted: boolean }
): ExportSequenceItem | null {
  const cutAsset = resolveAssetForExport(cut, options);
  const path = cutAsset?.path || '';
  if (!path) {
    emitWarning(options, {
      code: 'missing-asset',
      cutId: context.cutId,
      sceneId: context.sceneId,
      assetId: cut.assetId,
      message: `Cut ${context.cutId}${context.sceneId ? ` in scene ${context.sceneId}` : ''} has unresolved asset path.`,
    });
    return null;
  }

  if (cutAsset?.type === 'audio') {
    emitWarning(options, {
      code: 'audio-only-cut-skipped',
      cutId: context.cutId,
      sceneId: context.sceneId,
      assetId: cutAsset.id,
      message: `Cut ${context.cutId}${context.sceneId ? ` in scene ${context.sceneId}` : ''} is audio-only and does not produce a visual item.`,
    });
    return null;
  }

  const { duration, adjusted } = durationInfo;
  if (adjusted) {
    emitWarning(options, {
      code: 'non-canonical-cut-adjusted',
      cutId: context.cutId,
      sceneId: context.sceneId,
      assetId: cut.assetId,
      message:
        `Cut ${context.cutId}${context.sceneId ? ` in scene ${context.sceneId}` : ''} had invalid displayTime. ` +
        `Using canonical duration ${duration.toFixed(3)}s.`,
    });
  }

  const framing = resolveFramingParams(cut, options.framingDefaults);
  return {
    type: cutAsset?.type || 'image',
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
  const timings = computeCanonicalStoryTimingsForCuts(
    cuts.map((cut) => ({ cut, sceneId: '__sequence__' })),
    (assetId) => options.resolveAssetById?.(assetId),
    { fallbackDurationSec: 1.0, preferAssetDuration: true }
  );

  for (const cut of cuts) {
    const normalizedCut = timings.normalizedCutByCutId.get(cut.id);
    const durationInfo = normalizedCut ?? { durationSec: 1.0, adjusted: true };
    const item = buildExportSequenceItemFromCut(
      cut,
      options,
      { cutId: cut.id },
      { duration: durationInfo.durationSec, adjusted: durationInfo.adjusted }
    );
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
  const timings = computeCanonicalStoryTimingsForCuts(
    orderedScenes.flatMap((scene) => scene.cuts.map((cut) => ({ cut, sceneId: scene.id }))),
    (assetId) => options.resolveAssetById?.(assetId),
    { fallbackDurationSec: 1.0, preferAssetDuration: true }
  );

  for (const scene of orderedScenes) {
    for (const cut of scene.cuts) {
      const normalizedCut = timings.normalizedCutByCutId.get(cut.id);
      const durationInfo = normalizedCut ?? { durationSec: 1.0, adjusted: true };
      const item = buildExportSequenceItemFromCut(
        cut,
        options,
        { sceneId: scene.id, cutId: cut.id },
        { duration: durationInfo.durationSec, adjusted: durationInfo.adjusted }
      );
      if (item) {
        sequenceItems.push(item);
      }
    }
  }

  return sequenceItems;
}
