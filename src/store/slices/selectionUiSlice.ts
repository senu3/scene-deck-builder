import type { SelectionUiSliceContract } from '../contracts';
import type { SliceGet, SliceSet } from './sliceTypes';
import { getScenesInOrder } from '../../utils/sceneOrder';

export function createSelectionUiSlice(set: SliceSet, get: SliceGet): SelectionUiSliceContract {
  return {
    selectScene: (sceneId) =>
      set({
        selectedSceneId: sceneId,
        selectedCutId: null,
        selectedCutIds: new Set(),
        lastSelectedCutId: null,
        selectedGroupId: null,
        selectionType: sceneId ? 'scene' : null,
        detailsPanelOpen: !!sceneId,
      }),

    selectCut: (cutId) =>
      set((state) => {
        let sceneId: string | null = null;
        for (const scene of state.scenes) {
          if (scene.cuts.some((c) => c.id === cutId)) {
            sceneId = scene.id;
            break;
          }
        }

        return {
          selectedCutId: cutId,
          selectedSceneId: sceneId,
          selectedCutIds: cutId ? new Set([cutId]) : new Set(),
          lastSelectedCutId: cutId,
          selectedGroupId: null,
          selectionType: cutId ? 'cut' : null,
          detailsPanelOpen: !!cutId,
        };
      }),

    toggleCutSelection: (cutId) =>
      set((state) => {
        const newSelectedIds = new Set(state.selectedCutIds);
        if (newSelectedIds.has(cutId)) {
          newSelectedIds.delete(cutId);
        } else {
          newSelectedIds.add(cutId);
        }

        let sceneId: string | null = state.selectedSceneId;
        for (const scene of state.scenes) {
          if (scene.cuts.some((c) => c.id === cutId)) {
            sceneId = scene.id;
            break;
          }
        }

        const selectedCutId =
          newSelectedIds.size === 1
            ? Array.from(newSelectedIds)[0]
            : newSelectedIds.size > 0
              ? cutId
              : null;

        return {
          selectedCutIds: newSelectedIds,
          selectedCutId,
          lastSelectedCutId: cutId,
          selectedSceneId: sceneId,
          selectedGroupId: null,
          selectionType: newSelectedIds.size > 0 ? 'cut' : null,
          detailsPanelOpen: newSelectedIds.size > 0,
        };
      }),

    selectCutRange: (cutId) =>
      set((state) => {
        if (!state.lastSelectedCutId) {
          let sceneId: string | null = null;
          for (const scene of state.scenes) {
            if (scene.cuts.some((c) => c.id === cutId)) {
              sceneId = scene.id;
              break;
            }
          }
          return {
            selectedCutIds: new Set([cutId]),
            selectedCutId: cutId,
            lastSelectedCutId: cutId,
            selectedSceneId: sceneId,
            selectedGroupId: null,
            selectionType: 'cut',
            detailsPanelOpen: true,
          };
        }

        const allCuts: Array<{ cutId: string; sceneId: string }> = [];
        const orderedScenes = getScenesInOrder(state.scenes, state.sceneOrder);
        for (const scene of orderedScenes) {
          for (const cut of scene.cuts) {
            allCuts.push({ cutId: cut.id, sceneId: scene.id });
          }
        }

        const startIndex = allCuts.findIndex((c) => c.cutId === state.lastSelectedCutId);
        const endIndex = allCuts.findIndex((c) => c.cutId === cutId);

        if (startIndex === -1 || endIndex === -1) {
          return state;
        }

        const minIndex = Math.min(startIndex, endIndex);
        const maxIndex = Math.max(startIndex, endIndex);
        const rangeIds = allCuts.slice(minIndex, maxIndex + 1).map((c) => c.cutId);

        const newSelectedIds = new Set(rangeIds);

        return {
          selectedCutIds: newSelectedIds,
          selectedCutId: cutId,
          selectedSceneId: allCuts[endIndex]?.sceneId || state.selectedSceneId,
          selectedGroupId: null,
          selectionType: 'cut',
          detailsPanelOpen: newSelectedIds.size > 0,
        };
      }),

    selectMultipleCuts: (cutIds) =>
      set((state) => {
        const newSelectedIds = new Set(cutIds);
        const firstCutId = cutIds[0] || null;

        let sceneId: string | null = null;
        if (firstCutId) {
          for (const scene of state.scenes) {
            if (scene.cuts.some((c) => c.id === firstCutId)) {
              sceneId = scene.id;
              break;
            }
          }
        }

        return {
          selectedCutIds: newSelectedIds,
          selectedCutId: firstCutId,
          lastSelectedCutId: firstCutId,
          selectedSceneId: sceneId,
          selectionType: cutIds.length > 0 ? 'cut' : null,
          detailsPanelOpen: cutIds.length > 0,
        };
      }),

    clearCutSelection: () =>
      set({
        selectedCutIds: new Set(),
        selectedCutId: null,
        lastSelectedCutId: null,
        selectionType: null,
        detailsPanelOpen: false,
      }),

    isMultiSelected: (cutId) => get().selectedCutIds.has(cutId),

    setPlaybackMode: (mode) => set({ playbackMode: mode }),
    setPreviewMode: (mode) => set({ previewMode: mode }),
    setCurrentPreviewIndex: (index) => set({ currentPreviewIndex: index }),

    setGlobalVolume: (volume) => set({ globalVolume: volume, globalMuted: volume === 0 }),
    setGlobalMuted: (muted) => set({ globalMuted: muted }),
    toggleGlobalMute: () => set((state) => ({ globalMuted: !state.globalMuted })),

    openVideoPreview: (cutId, options) =>
      set({
        videoPreviewCutId: cutId,
        pendingSubtitleModalCutId: options?.openSubtitleModal ? cutId : null,
      }),
    closeVideoPreview: () => set({ videoPreviewCutId: null, pendingSubtitleModalCutId: null }),
    openSequencePreview: (cutId, options) =>
      set({
        sequencePreviewCutId: cutId,
        pendingSubtitleModalCutId: options?.openSubtitleModal ? cutId : null,
      }),
    closeSequencePreview: () => set({ sequencePreviewCutId: null, pendingSubtitleModalCutId: null }),
    clearPendingSubtitleModalCutId: () => set({ pendingSubtitleModalCutId: null }),

    setImportingAsset: (name) => set({ isImportingAsset: name }),

    openAssetDrawer: () => set({ assetDrawerOpen: true }),
    closeAssetDrawer: () => set({ assetDrawerOpen: false }),
    toggleAssetDrawer: () => set((state) => ({ assetDrawerOpen: !state.assetDrawerOpen })),

    openSidebar: () => set({ sidebarOpen: true }),
    closeSidebar: () => set({ sidebarOpen: false }),
    toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

    openDetailsPanel: () => set({ detailsPanelOpen: true }),
    closeDetailsPanel: () => set({ detailsPanelOpen: false }),
  };
}
