import type { SequencePlanTarget } from '../../utils/sequencePlan';
import type { PreviewItem } from './types';

export function buildSequencePlanTargetFromPreviewItems(items: PreviewItem[]): SequencePlanTarget {
  const cuts = items.map((item) => ({
    ...item.cut,
    displayTime: item.normalizedDisplayTime,
  }));
  const cutSceneMap = new Map<string, string>();
  for (const item of items) {
    cutSceneMap.set(item.cut.id, item.sceneId);
  }
  return {
    kind: 'cuts',
    cuts,
    resolveSceneIdByCutId: (cutId) => cutSceneMap.get(cutId),
  };
}
