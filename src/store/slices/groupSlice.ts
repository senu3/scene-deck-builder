import { v4 as uuidv4 } from 'uuid';
import type { GroupSliceContract } from '../contracts';
import type { SliceGet, SliceSet } from './sliceTypes';
import type { Cut, CutGroup, Scene } from '../../types';
import { normalizeSceneGroups } from '../../utils/cutGroupOps';

function dedupeCutIds(cutIds: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const id of cutIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    next.push(id);
  }
  return next;
}

function sortCutIdsByTimeline(cuts: Cut[], cutIds: string[]): string[] {
  const cutOrder = new Map(cuts.map((cut, idx) => [cut.id, typeof cut.order === 'number' ? cut.order : idx]));
  return [...cutIds].sort((a, b) => {
    const orderA = cutOrder.get(a) ?? Number.MAX_SAFE_INTEGER;
    const orderB = cutOrder.get(b) ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return a.localeCompare(b);
  });
}

function findSceneById(scenes: Scene[], sceneId: string): Scene | undefined {
  return scenes.find((scene) => scene.id === sceneId);
}

function normalizeSceneById(scenes: Scene[], sceneId: string): Scene[] {
  return scenes.map((scene) => (scene.id === sceneId ? normalizeSceneGroups(scene) : scene));
}

function canAssignCutsToGroup(scene: Scene, groupId: string, cutIds: string[]): boolean {
  const cutIdSet = new Set(scene.cuts.map((cut) => cut.id));
  const requested = dedupeCutIds(cutIds).filter((cutId) => cutIdSet.has(cutId));
  if (requested.length === 0) return false;

  const occupied = new Map<string, string>();
  for (const group of scene.groups || []) {
    for (const cutId of group.cutIds) {
      occupied.set(cutId, group.id);
    }
  }

  return requested.every((cutId) => {
    const owner = occupied.get(cutId);
    return !owner || owner === groupId;
  });
}

export function createGroupSlice(set: SliceSet, get: SliceGet): GroupSliceContract {
  return {
    createGroup: (sceneId, cutIds, name, options) => {
      const groupId = options?.id || uuidv4();
      const groupName = name || options?.name || `Group ${Date.now()}`;
      let createdId = '';

      set((state) => {
        const normalizedScenes = normalizeSceneById(state.scenes, sceneId);
        const scene = findSceneById(normalizedScenes, sceneId);
        if (!scene) return state;
        if (scene.groups?.some((group) => group.id === groupId)) return state;
        if (!canAssignCutsToGroup(scene, groupId, cutIds)) return state;

        const cutIdSet = new Set(scene.cuts.map((cut) => cut.id));
        const nextCutIds = sortCutIdsByTimeline(
          scene.cuts,
          dedupeCutIds(cutIds).filter((id) => cutIdSet.has(id))
        );
        if (nextCutIds.length === 0) return state;

        const nextScenes = normalizedScenes.map((s) =>
          s.id === sceneId
            ? {
                ...s,
                groups: [
                  ...(s.groups || []),
                  {
                    id: groupId,
                    name: groupName,
                    color: options?.color,
                    locked: options?.locked,
                    attachments: options?.attachments || {},
                    cutIds: nextCutIds,
                    isCollapsed: options?.isCollapsed ?? true,
                  },
                ],
              }
            : s
        );
        createdId = groupId;
        return { scenes: normalizeSceneById(nextScenes, sceneId) };
      });

      return createdId;
    },

    deleteGroup: (sceneId, groupId) => {
      const state = { ...get(), scenes: normalizeSceneById(get().scenes, sceneId) };
      const scene = state.scenes.find((s) => s.id === sceneId);
      const groupToDelete = scene?.groups?.find((g) => g.id === groupId) || null;

      set((currentState) => ({
        scenes: normalizeSceneById(
          currentState.scenes.map((s) =>
            s.id === sceneId
              ? {
                  ...s,
                  groups: (s.groups || []).filter((g) => g.id !== groupId),
                }
              : s
          ),
          sceneId
        ),
        selectedGroupId: currentState.selectedGroupId === groupId ? null : currentState.selectedGroupId,
      }));

      return groupToDelete;
    },

    toggleGroupCollapsed: (sceneId, groupId) => {
      set((state) => ({
        scenes: normalizeSceneById(
          state.scenes.map((s) =>
            s.id === sceneId
              ? {
                  ...s,
                  groups: (s.groups || []).map((g) => (g.id === groupId ? { ...g, isCollapsed: !g.isCollapsed } : g)),
                }
              : s
          ),
          sceneId
        ),
      }));
    },

    getCutGroup: (sceneId, cutId) => {
      const state = get();
      const rawScene = state.scenes.find((s) => s.id === sceneId);
      if (!rawScene) return undefined;
      const scene = normalizeSceneGroups(rawScene);
      return scene?.groups?.find((g) => g.cutIds.includes(cutId));
    },

    selectGroup: (groupId) => {
      set({
        selectedGroupId: groupId,
        selectedCutId: null,
        selectedCutIds: new Set(),
        lastSelectedCutId: null,
        selectionType: groupId ? 'cut' : null,
        detailsPanelOpen: !!groupId,
      });
    },

    renameGroup: (sceneId, groupId, name) => {
      set((state) => ({
        scenes: normalizeSceneById(
          state.scenes.map((s) =>
            s.id === sceneId
              ? {
                  ...s,
                  groups: (s.groups || []).map((g) => (g.id === groupId ? { ...g, name } : g)),
                }
              : s
          ),
          sceneId
        ),
      }));
    },

    addCutsToGroup: (sceneId, groupId, cutIds) => {
      set((state) => {
        const normalizedScenes = normalizeSceneById(state.scenes, sceneId);
        const scene = findSceneById(normalizedScenes, sceneId);
        if (!scene) return state;
        if (!canAssignCutsToGroup(scene, groupId, cutIds)) return state;

        const cutIdSet = new Set(scene.cuts.map((cut) => cut.id));
        const incoming = dedupeCutIds(cutIds).filter((id) => cutIdSet.has(id));
        if (incoming.length === 0) return state;

        const nextScenes = normalizedScenes.map((s) =>
          s.id === sceneId
            ? {
                ...s,
                groups: (s.groups || []).map((g) =>
                  g.id === groupId ? { ...g, cutIds: sortCutIdsByTimeline(s.cuts, [...g.cutIds, ...incoming]) } : g
                ),
              }
            : s
        );
        return { scenes: normalizeSceneById(nextScenes, sceneId) };
      });
    },

    removeCutsFromGroup: (sceneId, groupId, cutIds) => {
      const removeSet = new Set(dedupeCutIds(cutIds));
      if (removeSet.size === 0) return;

      set((state) => ({
        scenes: normalizeSceneById(
          state.scenes.map((s) =>
            s.id === sceneId
              ? {
                  ...s,
                  groups: (s.groups || [])
                    .map((g) => (g.id === groupId ? { ...g, cutIds: g.cutIds.filter((id) => !removeSet.has(id)) } : g))
                    .filter((g) => g.cutIds.length > 0),
                }
              : s
          ),
          sceneId
        ),
      }));
    },

    removeCutFromGroup: (sceneId, groupId, cutId) => {
      get().removeCutsFromGroup(sceneId, groupId, [cutId]);
    },

    updateGroupCutOrder: (sceneId, groupId, cutIds) => {
      set((state) => {
        const normalizedScenes = normalizeSceneById(state.scenes, sceneId);
        const scene = findSceneById(normalizedScenes, sceneId);
        if (!scene) return state;
        if (!canAssignCutsToGroup(scene, groupId, cutIds)) return state;
        const targetGroup = scene.groups?.find((group) => group.id === groupId);
        if (!targetGroup) return state;

        const cutIdSet = new Set(scene.cuts.map((cut) => cut.id));
        const nextCutIds = sortCutIdsByTimeline(
          scene.cuts,
          dedupeCutIds(cutIds).filter((id) => cutIdSet.has(id))
        );
        if (nextCutIds.length === 0) {
          return {
            scenes: normalizeSceneById(
              normalizedScenes.map((s) =>
                s.id === sceneId
                  ? { ...s, groups: (s.groups || []).filter((group) => group.id !== groupId) }
                  : s
              ),
              sceneId
            ),
          };
        }

        const nextScenes = normalizedScenes.map((s) =>
          s.id === sceneId
            ? {
                ...s,
                groups: (s.groups || []).map((g) => (g.id === groupId ? { ...g, cutIds: nextCutIds } : g)),
              }
            : s
        );
        return { scenes: normalizeSceneById(nextScenes, sceneId) };
      });
    },

    splitGroup: (sceneId, groupId, pivotCutId) => {
      let newGroupId: string | null = null;

      set((state) => {
        const normalizedScenes = normalizeSceneById(state.scenes, sceneId);
        const scene = findSceneById(normalizedScenes, sceneId);
        const group = scene?.groups?.find((item) => item.id === groupId);
        if (!scene || !group) return state;

        const pivotIndex = group.cutIds.indexOf(pivotCutId);
        if (pivotIndex <= 0 || pivotIndex >= group.cutIds.length) return state;

        const left = group.cutIds.slice(0, pivotIndex);
        const right = group.cutIds.slice(pivotIndex);
        if (left.length === 0 || right.length === 0) return state;

        newGroupId = uuidv4();
        const nextGroup: CutGroup = {
          id: newGroupId,
          name: group.name ? `${group.name} (Split)` : `Group ${Date.now()}`,
          color: group.color,
          locked: group.locked,
          attachments: {},
          cutIds: sortCutIdsByTimeline(scene.cuts, right),
          isCollapsed: group.isCollapsed,
        };

        const nextScenes = normalizedScenes.map((s) =>
          s.id === sceneId
            ? {
                ...s,
                groups: (s.groups || []).flatMap((g) => {
                  if (g.id !== groupId) return [g];
                  return [{ ...g, cutIds: sortCutIdsByTimeline(scene.cuts, left) }, nextGroup];
                }),
              }
            : s
        );
        return { scenes: normalizeSceneById(nextScenes, sceneId) };
      });

      return newGroupId;
    },

    mergeGroups: (sceneId, survivorGroupId, mergedGroupId) => {
      let merged = false;
      set((state) => {
        const normalizedScenes = normalizeSceneById(state.scenes, sceneId);
        const scene = findSceneById(normalizedScenes, sceneId);
        if (!scene || survivorGroupId === mergedGroupId) return state;

        const survivor = scene.groups?.find((group) => group.id === survivorGroupId);
        const mergedGroup = scene.groups?.find((group) => group.id === mergedGroupId);
        if (!survivor || !mergedGroup) return state;

        const nextCutIds = sortCutIdsByTimeline(
          scene.cuts,
          dedupeCutIds([...survivor.cutIds, ...mergedGroup.cutIds])
        );
        if (nextCutIds.length === 0) return state;

        const nextScenes = normalizedScenes.map((s) =>
          s.id === sceneId
            ? {
                ...s,
                groups: (s.groups || [])
                  .filter((group) => group.id !== mergedGroupId)
                  .map((group) => (group.id === survivorGroupId ? { ...group, cutIds: nextCutIds } : group)),
              }
            : s
        );
        merged = true;
        return { scenes: normalizeSceneById(nextScenes, sceneId) };
      });
      return merged;
    },

    getSelectedGroup: () => {
      const state = get();
      if (!state.selectedGroupId) return null;

      for (const scene of state.scenes) {
        const group = scene.groups?.find((g) => g.id === state.selectedGroupId);
        if (group) {
          return { scene, group };
        }
      }
      return null;
    },
  };
}
