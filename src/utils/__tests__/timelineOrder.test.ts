import { describe, expect, it } from 'vitest';
import type { Scene } from '../../types';
import { getCutIdsInTimelineOrder, getScenesAndCutsInTimelineOrder } from '../timelineOrder';

const buildScene = (id: string, order: number, cutDefs: Array<{ id: string; order: number }>): Scene => ({
  id,
  name: id,
  order,
  notes: [],
  cuts: cutDefs.map((cut) => ({
    id: cut.id,
    assetId: `${cut.id}-asset`,
    order: cut.order,
    displayTime: 1,
  })),
});

describe('timeline order helpers', () => {
  it('sorts scenes and cuts by timeline order', () => {
    const scenes: Scene[] = [
      buildScene('scene-b', 1, [{ id: 'cut-b2', order: 1 }, { id: 'cut-b1', order: 0 }]),
      buildScene('scene-a', 0, [{ id: 'cut-a2', order: 1 }, { id: 'cut-a1', order: 0 }]),
    ];

    const ordered = getScenesAndCutsInTimelineOrder(scenes);

    expect(ordered.map((scene) => scene.id)).toEqual(['scene-a', 'scene-b']);
    expect(ordered[0].cuts.map((cut) => cut.id)).toEqual(['cut-a1', 'cut-a2']);
    expect(ordered[1].cuts.map((cut) => cut.id)).toEqual(['cut-b1', 'cut-b2']);
  });

  it('normalizes selected cut ids to timeline order regardless of selection order', () => {
    const scenes: Scene[] = [
      buildScene('scene-b', 1, [{ id: 'cut-b1', order: 0 }]),
      buildScene('scene-a', 0, [{ id: 'cut-a2', order: 1 }, { id: 'cut-a1', order: 0 }]),
    ];

    const orderedIds = getCutIdsInTimelineOrder(scenes, ['cut-b1', 'cut-a2', 'cut-a1']);
    expect(orderedIds).toEqual(['cut-a1', 'cut-a2', 'cut-b1']);
  });
});
