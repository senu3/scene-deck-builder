import { useMemo } from 'react';
import type { Asset, CutRuntimeState, MetadataStore } from '../../types';
import { EXPORT_FRAMING_DEFAULTS } from '../../constants/framing';
import { buildSequencePlan } from '../../utils/sequencePlan';
import { asCanonicalDurationSec } from '../../utils/storyTiming';
import { buildSequencePlanTargetFromPreviewItems } from './sequencePlanInput';
import type { PreviewItem } from './types';

interface UsePreviewSequenceDerivedInput {
  items: PreviewItem[];
  metadataStore: MetadataStore | null;
  getAsset: (assetId: string) => Asset | undefined;
  getCutRuntime: (cutId: string) => CutRuntimeState | undefined;
}

export function usePreviewSequenceDerived({
  items,
  metadataStore,
  getAsset,
  getCutRuntime,
}: UsePreviewSequenceDerivedInput) {
  const previewSequencePlan = useMemo(() => {
    return buildSequencePlan({
      scenes: [],
      sceneOrder: [],
    }, {
      target: buildSequencePlanTargetFromPreviewItems(items),
      metadataStore,
      getAssetById: getAsset,
      resolveCutRuntimeById: getCutRuntime,
      framingDefaults: EXPORT_FRAMING_DEFAULTS,
      strictLipSync: false,
    });
  }, [items, metadataStore, getAsset, getCutRuntime]);

  const sourceItemByCutId = useMemo(() => {
    const map = new Map<string, PreviewItem>();
    for (const item of items) {
      if (!map.has(item.cut.id)) {
        map.set(item.cut.id, item);
      }
    }
    return map;
  }, [items]);

  const previewSequenceItems = useMemo(() => {
    return previewSequencePlan.videoItems.map((videoItem) => {
      const sourceItem = sourceItemByCutId.get(videoItem.cutId);
      const fallback = items[0];
      const base = sourceItem ?? fallback;
      if (!base) {
        const durationSec = Math.max(0, videoItem.dstOutSec - videoItem.dstInSec);
        return {
          cut: {
            id: videoItem.cutId,
            assetId: videoItem.assetId,
            displayTime: durationSec,
            order: 0,
          },
          sceneId: videoItem.sceneId ?? 'sequence',
          sceneName: videoItem.sceneId ?? 'Sequence',
          sceneIndex: 0,
          cutIndex: 0,
          sceneStartAbs: 0,
          previewOffsetSec: 0,
          normalizedDisplayTime: asCanonicalDurationSec(durationSec),
          thumbnail: null,
        };
      }
      return {
        ...base,
        sceneId: videoItem.sceneId ?? base.sceneId,
        normalizedDisplayTime: asCanonicalDurationSec(Math.max(0, videoItem.dstOutSec - videoItem.dstInSec)),
      };
    });
  }, [previewSequencePlan.videoItems, sourceItemByCutId, items]);

  const previewSequenceItemByCutId = useMemo(
    () => previewSequencePlan.exportItemByCutId,
    [previewSequencePlan]
  );
  const previewSequenceItemByIndex = useMemo(
    () => new Map(previewSequencePlan.exportItems.map((item, index) => [index, item] as const)),
    [previewSequencePlan]
  );

  const previewAudioPlan = previewSequencePlan.audioPlan;

  return {
    previewSequencePlan,
    previewSequenceItems,
    previewSequenceItemByCutId,
    previewSequenceItemByIndex,
    previewAudioPlan,
  };
}
