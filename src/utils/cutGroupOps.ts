import type { CutGroup } from '../types';

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
