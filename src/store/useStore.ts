import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Scene, Cut } from '../types';
import type { AppState } from './stateTypes';
import { getScenesInOrder } from '../utils/sceneOrder';
import { createProjectSlice } from './slices/projectSlice';
import { createCutTimelineSlice } from './slices/cutTimelineSlice';
import { createSelectionUiSlice } from './slices/selectionUiSlice';
import { createMetadataSlice } from './slices/metadataSlice';
import { createGroupSlice } from './slices/groupSlice';

export const useStore = create<AppState>((set, get) => ({
  projectLoaded: false,
  projectPath: null,
  vaultPath: null,
  trashPath: null,
  projectName: 'Untitled Project',
  targetTotalDurationSec: undefined,
  metadataStore: null,

  clipboard: [],

  sourceFolders: [],
  rootFolder: null,
  expandedFolders: new Set(),
  favorites: [],
  sourceViewMode: 'list',

  scenes: [],
  sceneOrder: [],
  cutRuntimeById: {},
  selectedSceneId: null,
  selectedCutId: null,
  selectedCutIds: new Set(),
  lastSelectedCutId: null,
  selectionType: null,
  selectedGroupId: null,

  assetCache: new Map(),

  playbackMode: 'stopped',
  previewMode: 'all',
  currentPreviewIndex: 0,

  globalVolume: 1,
  globalMuted: false,

  videoPreviewCutId: null,
  sequencePreviewCutId: null,
  pendingSubtitleModalCutId: null,

  isImportingAsset: null,

  assetDrawerOpen: false,
  sidebarOpen: false,
  detailsPanelOpen: false,
  storeEvents: [],

  ...createProjectSlice(set, get),
  ...createCutTimelineSlice(set, get),
  ...createSelectionUiSlice(set, get),
  ...createMetadataSlice(set, get),
  ...createGroupSlice(set, get),

  emitStoreEvent: (event) =>
    set((state) => ({
      storeEvents: [...state.storeEvents, { ...event, occurredAt: new Date().toISOString() }],
    })),

  drainStoreEvents: () => {
    const events = get().storeEvents;
    if (events.length > 0) {
      set({ storeEvents: [] });
    }
    return events;
  },

  applyStoreEvents: () => {
    const events = get().drainStoreEvents();
    if (events.length === 0) return;

    set((state) => {
      let scenes = state.scenes;
      let selectedCutId = state.selectedCutId;
      let selectedCutIds = new Set(state.selectedCutIds);
      let lastSelectedCutId = state.lastSelectedCutId;
      let selectedGroupId = state.selectedGroupId;
      let selectionType = state.selectionType;
      let detailsPanelOpen = state.detailsPanelOpen;

      for (const event of events) {
        if (event.type === 'CUT_DELETED') {
          scenes = scenes.map((scene) => {
            if (scene.id !== event.sceneId) return scene;
            return {
              ...scene,
              groups: (scene.groups || [])
                .map((group) => ({
                  ...group,
                  cutIds: group.cutIds.filter((id) => id !== event.cutId),
                }))
                .filter((group) => group.cutIds.length > 0),
            };
          });

          selectedCutIds.delete(event.cutId);
          if (selectedCutId === event.cutId) {
            selectedCutId = null;
          }
          if (lastSelectedCutId === event.cutId) {
            lastSelectedCutId = selectedCutIds.size > 0 ? Array.from(selectedCutIds)[selectedCutIds.size - 1] : null;
          }
          continue;
        }

        if (event.type === 'CUT_MOVED') {
          scenes = scenes.map((scene) => {
            if (scene.id !== event.fromSceneId) return scene;
            return {
              ...scene,
              groups: (scene.groups || [])
                .map((group) => ({
                  ...group,
                  cutIds: group.cutIds.filter((id) => !event.cutIds.includes(id)),
                }))
                .filter((group) => group.cutIds.length > 0),
            };
          });
        }
      }

      if (selectedGroupId) {
        const exists = scenes.some((scene) => scene.groups?.some((group) => group.id === selectedGroupId));
        if (!exists) {
          selectedGroupId = null;
        }
      }

      if (selectedCutIds.size === 0 && !selectedCutId && selectionType === 'cut') {
        selectionType = null;
        detailsPanelOpen = false;
      }

      return {
        scenes,
        selectedCutId,
        selectedCutIds,
        lastSelectedCutId,
        selectedGroupId,
        selectionType,
        detailsPanelOpen,
      };
    });
  },

  getSelectedCut: () => {
    const state = get();
    if (!state.selectedCutId) return null;

    for (const scene of state.scenes) {
      const cut = scene.cuts.find((c) => c.id === state.selectedCutId);
      if (cut) {
        return { scene, cut };
      }
    }
    return null;
  },

  getSelectedScene: () => {
    const state = get();
    if (!state.selectedSceneId) return null;
    return state.scenes.find((s) => s.id === state.selectedSceneId) || null;
  },

  getProjectData: () => {
    const state = get();
    return {
      id: uuidv4(),
      name: state.projectName,
      vaultPath: state.vaultPath || '',
      scenes: state.scenes,
      sceneOrder: state.sceneOrder,
      targetTotalDurationSec: state.targetTotalDurationSec,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 3,
      sourcePanel: state.getSourcePanelState(),
    };
  },

  getSelectedCuts: () => {
    const state = get();
    const result: Array<{ scene: Scene; cut: Cut }> = [];

    for (const scene of getScenesInOrder(state.scenes, state.sceneOrder)) {
      for (const cut of scene.cuts) {
        if (state.selectedCutIds.has(cut.id)) {
          result.push({ scene, cut });
        }
      }
    }
    return result;
  },

  getSelectedCutIds: () => Array.from(get().selectedCutIds),
}));
