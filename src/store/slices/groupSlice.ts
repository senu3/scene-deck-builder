import { v4 as uuidv4 } from 'uuid';
import type { AppState } from '../useStore';
import type { SliceGet, SliceSet } from './sliceTypes';

type GroupSlice = Pick<
  AppState,
  | 'createGroup'
  | 'deleteGroup'
  | 'toggleGroupCollapsed'
  | 'getCutGroup'
  | 'selectGroup'
  | 'renameGroup'
  | 'addCutsToGroup'
  | 'removeCutFromGroup'
  | 'updateGroupCutOrder'
  | 'getSelectedGroup'
>;

export function createGroupSlice(set: SliceSet, get: SliceGet): GroupSlice {
  return {
    createGroup: (sceneId, cutIds, name) => {
      const groupId = uuidv4();
      const groupName = name || `Group ${Date.now()}`;

      set((state) => ({
        scenes: state.scenes.map((s) =>
          s.id === sceneId
            ? {
                ...s,
                groups: [...(s.groups || []), { id: groupId, name: groupName, cutIds, isCollapsed: true }],
              }
            : s
        ),
      }));

      return groupId;
    },

    deleteGroup: (sceneId, groupId) => {
      const state = get();
      const scene = state.scenes.find((s) => s.id === sceneId);
      const groupToDelete = scene?.groups?.find((g) => g.id === groupId) || null;

      set((currentState) => ({
        scenes: currentState.scenes.map((s) =>
          s.id === sceneId
            ? {
                ...s,
                groups: (s.groups || []).filter((g) => g.id !== groupId),
              }
            : s
        ),
        selectedGroupId: currentState.selectedGroupId === groupId ? null : currentState.selectedGroupId,
      }));

      return groupToDelete;
    },

    toggleGroupCollapsed: (sceneId, groupId) => {
      set((state) => ({
        scenes: state.scenes.map((s) =>
          s.id === sceneId
            ? {
                ...s,
                groups: (s.groups || []).map((g) => (g.id === groupId ? { ...g, isCollapsed: !g.isCollapsed } : g)),
              }
            : s
        ),
      }));
    },

    getCutGroup: (sceneId, cutId) => {
      const state = get();
      const scene = state.scenes.find((s) => s.id === sceneId);
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
        scenes: state.scenes.map((s) =>
          s.id === sceneId
            ? {
                ...s,
                groups: (s.groups || []).map((g) => (g.id === groupId ? { ...g, name } : g)),
              }
            : s
        ),
      }));
    },

    addCutsToGroup: (sceneId, groupId, cutIds) => {
      set((state) => ({
        scenes: state.scenes.map((s) =>
          s.id === sceneId
            ? {
                ...s,
                groups: (s.groups || []).map((g) =>
                  g.id === groupId ? { ...g, cutIds: [...g.cutIds, ...cutIds.filter((id) => !g.cutIds.includes(id))] } : g
                ),
              }
            : s
        ),
      }));
    },

    removeCutFromGroup: (sceneId, groupId, cutId) => {
      set((state) => ({
        scenes: state.scenes.map((s) =>
          s.id === sceneId
            ? {
                ...s,
                groups: (s.groups || [])
                  .map((g) => (g.id === groupId ? { ...g, cutIds: g.cutIds.filter((id) => id !== cutId) } : g))
                  .filter((g) => g.cutIds.length > 0),
              }
            : s
        ),
      }));
    },

    updateGroupCutOrder: (sceneId, groupId, cutIds) => {
      set((state) => ({
        scenes: state.scenes.map((s) =>
          s.id === sceneId
            ? {
                ...s,
                groups: (s.groups || []).map((g) => (g.id === groupId ? { ...g, cutIds } : g)),
              }
            : s
        ),
      }));
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
