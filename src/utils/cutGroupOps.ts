import type { Asset, Cut, CutGroup, Scene } from '../types';
import { getScenesAndCutsInTimelineOrder } from './timelineOrder';
import { computeCanonicalStoryTimingsForCuts } from './storyTiming';

export function removeCutIdsFromGroups(
  groups: CutGroup[] | undefined,
  cutIds: string[]
): CutGroup[] | undefined {
  if (!groups) return undefined;
  if (groups.length === 0 || cutIds.length === 0) {
    return groups;
  }

  const cutIdSet = new Set(cutIds);
  return groups
    .map((group) => ({
      ...group,
      cutIds: group.cutIds.filter((id) => !cutIdSet.has(id)),
    }))
    .filter((group) => group.cutIds.length > 0);
}

export function insertCutIdsIntoGroupOrder(
  existingCutIds: string[],
  incomingCutIds: string[],
  insertIndex?: number
): string[] {
  const incoming = incomingCutIds.filter((id) => !existingCutIds.includes(id));
  if (incoming.length === 0) return existingCutIds;

  const next = [...existingCutIds];
  const safeIndex = insertIndex !== undefined
    ? Math.min(Math.max(insertIndex, 0), next.length)
    : next.length;
  next.splice(safeIndex, 0, ...incoming);
  return next;
}

export interface GroupDerivedRange {
  groupStartAbs: number;
  groupEndAbs: number;
  groupDurationAbs: number;
}

export interface GroupGateIssue {
  code:
    | 'group-overlap'
    | 'group-nested-ref'
    | 'group-missing-cut-ref'
    | 'group-missing-group-ref'
    | 'group-cut-order-mismatch'
    | 'group-range-invalid';
  sceneId: string;
  groupId?: string;
  cutId?: string;
  message: string;
}

function dedupe(ids: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    next.push(id);
  }
  return next;
}

function getTimelineOrderMap(cuts: Cut[]): Map<string, number> {
  const sorted = [...cuts].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.id.localeCompare(b.id);
  });
  return new Map(sorted.map((cut, idx) => [cut.id, idx] as const));
}

function sortCutIdsByTimeline(cutIds: string[], orderMap: Map<string, number>): string[] {
  return [...cutIds].sort((a, b) => {
    const orderA = orderMap.get(a) ?? Number.MAX_SAFE_INTEGER;
    const orderB = orderMap.get(b) ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return a.localeCompare(b);
  });
}

export function normalizeSceneGroups(scene: Scene): Scene {
  const groups = scene.groups || [];
  const cutIdSet = new Set(scene.cuts.map((cut) => cut.id));
  const cutOrderMap = getTimelineOrderMap(scene.cuts);
  const seenGroupIds = new Set<string>();
  const assignedCutIds = new Set<string>();

  const normalizedGroups: CutGroup[] = [];
  for (const group of groups) {
    if (!group.id || seenGroupIds.has(group.id)) continue;
    seenGroupIds.add(group.id);

    const nextCutIds: string[] = [];
    for (const cutId of dedupe(group.cutIds)) {
      if (!cutIdSet.has(cutId)) continue;
      if (assignedCutIds.has(cutId)) continue;
      assignedCutIds.add(cutId);
      nextCutIds.push(cutId);
    }

    const sortedCutIds = sortCutIdsByTimeline(nextCutIds, cutOrderMap);
    if (sortedCutIds.length === 0) continue;

    normalizedGroups.push({
      ...group,
      name: group.name || `Group ${group.id.slice(0, 6)}`,
      isCollapsed: group.isCollapsed ?? true,
      cutIds: sortedCutIds,
    });
  }

  const groupIdByCutId = new Map<string, string>();
  for (const group of normalizedGroups) {
    for (const cutId of group.cutIds) {
      groupIdByCutId.set(cutId, group.id);
    }
  }

  const normalizedCuts = scene.cuts.map((cut) => {
    const groupId = groupIdByCutId.get(cut.id);
    if (cut.groupId === groupId) return cut;
    return { ...cut, groupId };
  });

  return {
    ...scene,
    cuts: normalizedCuts,
    groups: normalizedGroups,
  };
}

export function normalizeGroupsInScenes(scenes: Scene[]): Scene[] {
  return scenes.map((scene) => normalizeSceneGroups(scene));
}

export function computeGroupDerivedRange(
  scenes: Scene[],
  sceneOrder: string[] | undefined,
  sceneId: string,
  groupId: string,
  getAsset: (assetId: string) => Asset | undefined = () => undefined
): GroupDerivedRange | null {
  const orderedScenes = getScenesAndCutsInTimelineOrder(scenes, sceneOrder);
  const targetScene = orderedScenes.find((scene) => scene.id === sceneId);
  const group = targetScene?.groups?.find((item) => item.id === groupId);
  if (!targetScene || !group || group.cutIds.length === 0) return null;

  const cuts = orderedScenes.flatMap((scene) => scene.cuts.map((cut) => ({ sceneId: scene.id, cut })));
  const timings = computeCanonicalStoryTimingsForCuts(cuts, getAsset);

  const cutStarts: number[] = [];
  const cutEnds: number[] = [];
  for (const cutId of group.cutIds) {
    const timing = timings.cutTimings.get(cutId);
    if (!timing) continue;
    cutStarts.push(timing.startSec);
    cutEnds.push(timing.startSec + timing.durationSec);
  }
  if (cutStarts.length === 0 || cutEnds.length === 0) return null;

  const groupStartAbs = Math.min(...cutStarts);
  const groupEndAbs = Math.max(...cutEnds);
  return {
    groupStartAbs,
    groupEndAbs,
    groupDurationAbs: Math.max(0, groupEndAbs - groupStartAbs),
  };
}

export function validateGroupCutGate(
  scenes: Scene[],
  sceneOrder: string[] | undefined,
  getAsset: (assetId: string) => Asset | undefined = () => undefined
): GroupGateIssue[] {
  const issues: GroupGateIssue[] = [];
  const orderedScenes = getScenesAndCutsInTimelineOrder(scenes, sceneOrder);
  const groupMembership = new Map<string, string>();

  for (const scene of orderedScenes) {
    const groupIds = new Set((scene.groups || []).map((group) => group.id));
    const cutOrderMap = getTimelineOrderMap(scene.cuts);
    const cutIdSet = new Set(scene.cuts.map((cut) => cut.id));

    for (const group of scene.groups || []) {
      for (const cutId of group.cutIds) {
        if (!cutIdSet.has(cutId)) {
          if (groupIds.has(cutId)) {
            issues.push({
              code: 'group-nested-ref',
              sceneId: scene.id,
              groupId: group.id,
              cutId,
              message: `group ${group.id} references group-like id ${cutId}`,
            });
            continue;
          }
          issues.push({
            code: 'group-missing-cut-ref',
            sceneId: scene.id,
            groupId: group.id,
            cutId,
            message: `group ${group.id} includes missing cut ${cutId}`,
          });
          continue;
        }

        const prevGroupId = groupMembership.get(cutId);
        if (prevGroupId && prevGroupId !== group.id) {
          issues.push({
            code: 'group-overlap',
            sceneId: scene.id,
            groupId: group.id,
            cutId,
            message: `cut ${cutId} belongs to multiple groups (${prevGroupId}, ${group.id})`,
          });
        } else {
          groupMembership.set(cutId, group.id);
        }
      }

      const sorted = sortCutIdsByTimeline(group.cutIds.filter((id) => cutIdSet.has(id)), cutOrderMap);
      const isTimelineSorted = sorted.length === group.cutIds.length && sorted.every((id, idx) => id === group.cutIds[idx]);
      if (!isTimelineSorted) {
        issues.push({
          code: 'group-cut-order-mismatch',
          sceneId: scene.id,
          groupId: group.id,
          message: `group ${group.id} cutIds order diverges from cut timeline order`,
        });
      }

      const range = computeGroupDerivedRange(orderedScenes, sceneOrder, scene.id, group.id, getAsset);
      if (range && range.groupDurationAbs < 0) {
        issues.push({
          code: 'group-range-invalid',
          sceneId: scene.id,
          groupId: group.id,
          message: `group ${group.id} has negative duration`,
        });
      }
    }

    const groupIdSet = new Set((scene.groups || []).map((group) => group.id));
    for (const cut of scene.cuts) {
      if (!cut.groupId) continue;
      if (!groupIdSet.has(cut.groupId)) {
        issues.push({
          code: 'group-missing-group-ref',
          sceneId: scene.id,
          cutId: cut.id,
          message: `cut ${cut.id} references missing group ${cut.groupId}`,
        });
        continue;
      }
      const group = scene.groups?.find((item) => item.id === cut.groupId);
      if (!group?.cutIds.includes(cut.id)) {
        issues.push({
          code: 'group-missing-group-ref',
          sceneId: scene.id,
          groupId: cut.groupId,
          cutId: cut.id,
          message: `cut ${cut.id} groupId ${cut.groupId} is not reflected in group.cutIds`,
        });
      }
    }
  }

  return issues;
}
