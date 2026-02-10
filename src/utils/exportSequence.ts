import type { Cut, Scene } from '../types';
import { getScenesAndCutsInTimelineOrder } from './timelineOrder';

export interface ExportSequenceItem {
  type: 'image' | 'video' | 'audio';
  path: string;
  duration: number;
  inPoint?: number;
  outPoint?: number;
}

function resolveExportDuration(cut: Cut): { duration: number; adjusted: boolean } {
  if (Number.isFinite(cut.displayTime) && cut.displayTime > 0) {
    return { duration: cut.displayTime, adjusted: false };
  }

  if (cut.asset?.type === 'video' && Number.isFinite(cut.asset.duration) && (cut.asset.duration as number) > 0) {
    return { duration: cut.asset.duration as number, adjusted: true };
  }

  return { duration: 1.0, adjusted: true };
}

export function buildSequenceItemsForExport(scenes: Scene[]): ExportSequenceItem[] {
  const orderedScenes = getScenesAndCutsInTimelineOrder(scenes);
  const sequenceItems: ExportSequenceItem[] = [];

  for (const scene of orderedScenes) {
    for (const cut of scene.cuts) {
      const path = cut.asset?.path || '';
      if (!path) continue;

      const { duration, adjusted } = resolveExportDuration(cut);
      if (adjusted) {
        console.warn(
          `[export] Invalid displayTime detected for cut ${cut.id} in scene ${scene.id}. ` +
          `Using fallback duration ${duration.toFixed(3)}s.`
        );
      }

      sequenceItems.push({
        type: cut.asset?.type || 'image',
        path,
        duration,
        inPoint: cut.isClip ? cut.inPoint : undefined,
        outPoint: cut.isClip ? cut.outPoint : undefined,
      });
    }
  }

  return sequenceItems;
}
