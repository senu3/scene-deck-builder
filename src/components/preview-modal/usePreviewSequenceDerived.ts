import { useMemo } from 'react';
import type { Asset, MetadataStore } from '../../types';
import { buildSequenceItemsForCuts } from '../../utils/exportSequence';
import { buildExportAudioPlan, canonicalizeCutsForExportAudioPlan } from '../../utils/exportAudioPlan';
import { EXPORT_FRAMING_DEFAULTS } from '../../constants/framing';
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
  const previewSequenceItems = useMemo(() => {
    const exportCuts = items.map((item) => ({
      ...item.cut,
      displayTime: item.normalizedDisplayTime,
    }));
    return buildSequenceItemsForCuts(exportCuts, {
      framingDefaults: EXPORT_FRAMING_DEFAULTS,
      metadataByAssetId: metadataStore?.metadata,
      resolveAssetById: getAsset,
      strictLipSync: false,
    });
  }, [items, metadataStore, getAsset]);

  const previewSequenceItemByCutId = useMemo(
    () => new Map(previewSequenceItems.map((item, index) => [items[index]?.cut.id, item] as const).filter((entry) => !!entry[0])),
    [previewSequenceItems, items]
  );

  const previewAudioPlan = useMemo(() => {
    const exportCuts = items.map((item) => ({
      ...item.cut,
      displayTime: item.normalizedDisplayTime,
    }));
    const cutSceneMap = new Map<string, string>();
    for (const item of items) {
      cutSceneMap.set(item.cut.id, item.sceneId);
    }
    return buildExportAudioPlan({
      cuts: canonicalizeCutsForExportAudioPlan(exportCuts, getAsset).cuts,
      metadataStore,
      getAssetById: getAsset,
      resolveSceneIdByCutId: (cutId) => cutSceneMap.get(cutId),
    });
  }, [items, metadataStore, getAsset]);

  return {
    previewSequenceItems,
    previewSequenceItemByCutId,
    previewAudioPlan,
  };
}
