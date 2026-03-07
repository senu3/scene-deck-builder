import { useMemo } from 'react';
import type { Asset, MetadataStore } from '../../types';
import { EXPORT_FRAMING_DEFAULTS } from '../../constants/framing';
import { buildSequencePlan } from '../../utils/sequencePlan';
import type { PreviewItem } from './types';

interface UsePreviewSequenceDerivedInput {
  items: PreviewItem[];
  metadataStore: MetadataStore | null;
  getAsset: (assetId: string) => Asset | undefined;
}

export function usePreviewSequenceDerived({
  items,
  metadataStore,
  getAsset,
}: UsePreviewSequenceDerivedInput) {
  const previewSequencePlan = useMemo(() => {
    const planCuts = items.map((item) => ({
      ...item.cut,
      displayTime: item.normalizedDisplayTime,
    }));
    const cutSceneMap = new Map<string, string>();
    for (const item of items) {
      cutSceneMap.set(item.cut.id, item.sceneId);
    }
    return buildSequencePlan({
      scenes: [],
      sceneOrder: [],
    }, {
      target: {
        kind: 'cuts',
        cuts: planCuts,
        resolveSceneIdByCutId: (cutId) => cutSceneMap.get(cutId),
      },
      metadataStore,
      getAssetById: getAsset,
      framingDefaults: EXPORT_FRAMING_DEFAULTS,
      strictLipSync: false,
    });
  }, [items, metadataStore, getAsset]);

  const previewSequenceItems = previewSequencePlan.exportItems;

  const previewSequenceItemByCutId = useMemo(
    () => previewSequencePlan.exportItemByCutId,
    [previewSequencePlan]
  );

  const previewAudioPlan = previewSequencePlan.audioPlan;

  return {
    previewSequencePlan,
    previewSequenceItems,
    previewSequenceItemByCutId,
    previewAudioPlan,
  };
}
