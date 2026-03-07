import type { Asset, Cut, CutRuntimeState, MetadataStore, Project, Scene } from '../types';
import { resolveCutAsset } from './assetResolve';
import { buildExportAudioPlan, canonicalizeCutsForExportAudioPlan, type ExportAudioPlan } from './exportAudioPlan';
import {
  buildSequenceItemsForCuts,
  type BuildExportSequenceOptions,
  type ExportSequenceItem,
} from './exportSequence';
import { getScenesAndCutsInTimelineOrder } from './timelineOrder';

export type SequencePlanWarningCode =
  | 'missing-asset'
  | 'audio-only-cut-skipped'
  | 'non-canonical-cut-adjusted'
  | 'lipsync-temporary-route';

export interface SequencePlanWarning {
  code: SequencePlanWarningCode;
  cutId?: string;
  assetId?: string;
  message: string;
}

export interface SequenceItemFlags {
  isClip?: boolean;
  isMuted?: boolean;
  isHold?: boolean;
}

export interface SequenceVideoItem {
  cutId: string;
  sceneId?: string;
  assetId: string;
  sourcePath: string;
  srcInSec: number;
  srcOutSec: number;
  dstInSec: number;
  dstOutSec: number;
  rate: number;
  flags: SequenceItemFlags;
  internalAssetKind?: string;
}

export interface SequenceAudioItem {
  assetId: string;
  sourcePath: string;
  srcInSec: number;
  srcOutSec: number;
  dstInSec: number;
  dstOutSec: number;
  rate: number;
  flags: SequenceItemFlags;
  sourceOffsetSec?: number;
  sourceType?: 'video' | 'cut-attach' | 'scene-attach' | 'group-attach';
  sceneId?: string;
  cutId?: string;
}

export interface SequencePlan {
  videoItems: SequenceVideoItem[];
  audioItems: SequenceAudioItem[];
  durationSec: number;
  warnings: SequencePlanWarning[];
  // Compatibility bridge for existing Preview/Export consumers.
  exportItems: ExportSequenceItem[];
  audioPlan: ExportAudioPlan;
  exportItemByCutId: Map<string, ExportSequenceItem>;
}

export type SequencePlanProject = Pick<Project, 'scenes' | 'sceneOrder'>;

export type SequencePlanTarget =
  | { kind: 'all' }
  | { kind: 'scene'; sceneId: string }
  | {
      kind: 'cuts';
      cuts: Cut[];
      resolveSceneIdByCutId?: (cutId: string) => string | undefined;
    };

export interface BuildSequencePlanOptions {
  target?: SequencePlanTarget;
  metadataStore: MetadataStore | null;
  getAssetById: (assetId: string) => Asset | undefined;
  framingDefaults?: BuildExportSequenceOptions['framingDefaults'];
  strictLipSync?: boolean;
  resolveInternalAssetKind?: (assetId: string, cut: Cut) => string | undefined;
  resolveCutRuntimeById?: (cutId: string) => CutRuntimeState | undefined;
}

interface BuildSequencePlanFromCutsInput {
  cuts: Cut[];
  metadataStore: MetadataStore | null;
  getAssetById: (assetId: string) => Asset | undefined;
  resolveSceneIdByCutId?: (cutId: string) => string | undefined;
  framingDefaults?: BuildExportSequenceOptions['framingDefaults'];
  strictLipSync?: boolean;
  resolveInternalAssetKind?: (assetId: string, cut: Cut) => string | undefined;
  resolveCutRuntimeById?: (cutId: string) => CutRuntimeState | undefined;
}

const DEFAULT_HOLD_FPS = 30;

function safeNumber(value: number | undefined, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return value as number;
}

function resolveCutsForPlan(
  project: SequencePlanProject,
  target: SequencePlanTarget | undefined
): {
  cuts: Cut[];
  resolveSceneIdByCutId?: (cutId: string) => string | undefined;
} {
  if (target?.kind === 'cuts') {
    return {
      cuts: target.cuts,
      resolveSceneIdByCutId: target.resolveSceneIdByCutId,
    };
  }

  const orderedScenes: Scene[] = getScenesAndCutsInTimelineOrder(project.scenes, project.sceneOrder);
  if (target?.kind === 'scene') {
    const targetScene = orderedScenes.find((scene) => scene.id === target.sceneId);
    if (!targetScene) {
      return { cuts: [] };
    }
    return {
      cuts: targetScene.cuts,
      resolveSceneIdByCutId: () => targetScene.id,
    };
  }

  const cutSceneMap = new Map<string, string>();
  const cuts: Cut[] = [];
  for (const scene of orderedScenes) {
    for (const cut of scene.cuts) {
      cuts.push(cut);
      cutSceneMap.set(cut.id, scene.id);
    }
  }
  return {
    cuts,
    resolveSceneIdByCutId: (cutId: string) => cutSceneMap.get(cutId),
  };
}

function buildSequencePlanFromCuts(input: BuildSequencePlanFromCutsInput): SequencePlan {
  const {
    cuts,
    metadataStore,
    getAssetById,
    resolveSceneIdByCutId,
    framingDefaults,
    strictLipSync = false,
    resolveInternalAssetKind,
    resolveCutRuntimeById,
  } = input;

  const canonicalized = canonicalizeCutsForExportAudioPlan(cuts, getAssetById);
  const warnings: SequencePlanWarning[] = [];

  for (const cutId of canonicalized.adjustedCutIds) {
    warnings.push({
      code: 'non-canonical-cut-adjusted',
      cutId,
      message: `Cut ${cutId} displayTime was canonicalized.`,
    });
  }

  for (const cut of canonicalized.cuts) {
    if (!cut.isLipSync) continue;
    warnings.push({
      code: 'lipsync-temporary-route',
      cutId: cut.id,
      assetId: cut.assetId,
      message: `Cut ${cut.id} is LipSync; handled through temporary route in Phase 1.`,
    });
  }

  const exportItems = buildSequenceItemsForCuts(canonicalized.cuts, {
    framingDefaults,
    metadataByAssetId: metadataStore?.metadata,
    resolveAssetById: getAssetById,
    strictLipSync,
  });

  const audioPlan = buildExportAudioPlan({
    cuts: canonicalized.cuts,
    metadataStore,
    getAssetById,
    resolveSceneIdByCutId: resolveSceneIdByCutId ?? (() => undefined),
  });

  const videoItems: SequenceVideoItem[] = [];
  const exportItemsWithHold: ExportSequenceItem[] = [];
  const exportItemByCutId = new Map<string, ExportSequenceItem>();
  let timelineCursorSec = 0;
  let exportItemCursor = 0;
  for (const cut of canonicalized.cuts) {
    const durationSec = safeNumber(cut.displayTime, 0);
    const dstInSec = timelineCursorSec;
    const dstOutSec = timelineCursorSec + durationSec;
    timelineCursorSec = dstOutSec;

    const asset = resolveCutAsset(cut, getAssetById);
    if (!asset || !asset.path) {
      warnings.push({
        code: 'missing-asset',
        cutId: cut.id,
        assetId: cut.assetId,
        message: `Cut ${cut.id} has unresolved asset path.`,
      });
      continue;
    }
    if (asset.type === 'audio') {
      warnings.push({
        code: 'audio-only-cut-skipped',
        cutId: cut.id,
        assetId: asset.id,
        message: `Cut ${cut.id} is audio-only and does not produce a video item.`,
      });
      continue;
    }

    const srcInSec = cut.isClip ? safeNumber(cut.inPoint, 0) : 0;
    const srcOutSec = cut.isClip
      ? safeNumber(cut.outPoint, srcInSec + durationSec)
      : srcInSec + durationSec;

    const videoItem: SequenceVideoItem = {
      cutId: cut.id,
      sceneId: resolveSceneIdByCutId?.(cut.id),
      assetId: asset.id || cut.assetId,
      sourcePath: asset.path,
      srcInSec,
      srcOutSec,
      dstInSec,
      dstOutSec,
      rate: 1,
      flags: {
        isClip: !!cut.isClip,
        isMuted: asset.type === 'video' ? cut.useEmbeddedAudio === false : false,
        isHold: false,
      },
      internalAssetKind: resolveInternalAssetKind?.(asset.id || cut.assetId, cut),
    };
    videoItems.push(videoItem);

    const exportItem = exportItems[exportItemCursor];
    if (exportItem) {
      const exportItemWithFlags: ExportSequenceItem = {
        ...exportItem,
        flags: {
          ...exportItem.flags,
          isClip: videoItem.flags.isClip,
          isMuted: videoItem.flags.isMuted,
          isHold: false,
        },
      };
      exportItemsWithHold.push(exportItemWithFlags);
      exportItemByCutId.set(cut.id, exportItem);
      exportItemCursor += 1;
    }

    const hold = resolveCutRuntimeById?.(cut.id)?.hold;
    const holdDurationSec = hold?.enabled && hold.mode === 'tail'
      ? safeNumber(hold.durationMs, 0) / 1000
      : 0;
    const shouldCreateHold = holdDurationSec > 0 && asset.type === 'video';
    if (!shouldCreateHold) {
      continue;
    }

    const frameDurationSec = 1 / DEFAULT_HOLD_FPS;
    const holdSrcOutSec = srcOutSec;
    const holdSrcInSec = Math.max(srcInSec, holdSrcOutSec - frameDurationSec);
    const holdDstInSec = timelineCursorSec;
    const holdDstOutSec = holdDstInSec + holdDurationSec;
    timelineCursorSec = holdDstOutSec;

    videoItems.push({
      cutId: cut.id,
      sceneId: resolveSceneIdByCutId?.(cut.id),
      assetId: asset.id || cut.assetId,
      sourcePath: asset.path,
      srcInSec: holdSrcInSec,
      srcOutSec: holdSrcOutSec,
      dstInSec: holdDstInSec,
      dstOutSec: holdDstOutSec,
      rate: 1,
      flags: {
        isClip: !!cut.isClip,
        isMuted: !!hold?.muteAudio,
        isHold: true,
      },
      internalAssetKind: resolveInternalAssetKind?.(asset.id || cut.assetId, cut),
    });

    if (exportItem) {
      exportItemsWithHold.push({
        ...exportItem,
        duration: holdDurationSec,
        inPoint: holdSrcInSec,
        outPoint: holdSrcOutSec,
        holdDurationSec,
        lipSync: undefined,
        flags: {
          ...exportItem.flags,
          isClip: !!cut.isClip,
          isMuted: !!hold?.muteAudio,
          isHold: true,
        },
      });
    }
  }

  const audioItems: SequenceAudioItem[] = audioPlan.events.map((event, index) => ({
    assetId: event.assetId || `audio-event-${index}`,
    sourcePath: event.sourcePath,
    srcInSec: safeNumber(event.sourceStartSec, 0),
    srcOutSec: safeNumber(event.sourceStartSec, 0) + safeNumber(event.durationSec, 0),
    dstInSec: safeNumber(event.timelineStartSec, 0),
    dstOutSec: safeNumber(event.timelineStartSec, 0) + safeNumber(event.durationSec, 0),
    rate: 1,
    flags: {
      isMuted: false,
    },
    sourceOffsetSec: safeNumber(event.sourceOffsetSec, 0),
    sourceType: event.sourceType,
    sceneId: event.sceneId,
    cutId: event.cutId,
  }));

  const maxVideoEnd = videoItems.reduce((max, item) => Math.max(max, item.dstOutSec), 0);
  const maxAudioEnd = audioItems.reduce((max, item) => Math.max(max, item.dstOutSec), 0);
  const durationSec = Math.max(maxVideoEnd, maxAudioEnd, safeNumber(audioPlan.totalDurationSec, 0));
  const normalizedAudioPlan: ExportAudioPlan = durationSec > safeNumber(audioPlan.totalDurationSec, 0)
    ? {
        ...audioPlan,
        totalDurationSec: durationSec,
      }
    : audioPlan;

  return {
    videoItems,
    audioItems,
    durationSec,
    warnings,
    exportItems: exportItemsWithHold,
    audioPlan: normalizedAudioPlan,
    exportItemByCutId,
  };
}

export function buildSequencePlan(
  project: SequencePlanProject,
  options: BuildSequencePlanOptions
): SequencePlan {
  const { cuts, resolveSceneIdByCutId } = resolveCutsForPlan(project, options.target);
  return buildSequencePlanFromCuts({
    cuts,
    metadataStore: options.metadataStore,
    getAssetById: options.getAssetById,
    resolveSceneIdByCutId,
    framingDefaults: options.framingDefaults,
    strictLipSync: options.strictLipSync,
    resolveInternalAssetKind: options.resolveInternalAssetKind,
    resolveCutRuntimeById: options.resolveCutRuntimeById,
  });
}
