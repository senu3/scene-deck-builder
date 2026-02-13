import type { AppState } from './stateTypes';

export const selectScenes = (s: AppState) => s.scenes;
export const selectVaultPath = (s: AppState) => s.vaultPath;
export const selectMetadataStore = (s: AppState) => s.metadataStore;
export const selectSelectedSceneId = (s: AppState) => s.selectedSceneId;
export const selectSelectedCutId = (s: AppState) => s.selectedCutId;
export const selectSelectedCutIds = (s: AppState) => s.selectedCutIds;
export const selectSelectedGroupId = (s: AppState) => s.selectedGroupId;
export const selectSelectionType = (s: AppState) => s.selectionType;
export const selectDetailsPanelOpen = (s: AppState) => s.detailsPanelOpen;
export const selectPreviewMode = (s: AppState) => s.previewMode;
export const selectGlobalVolume = (s: AppState) => s.globalVolume;
export const selectGlobalMuted = (s: AppState) => s.globalMuted;

export const selectProjectLoaded = (s: AppState) => s.projectLoaded;
export const selectProjectName = (s: AppState) => s.projectName;
export const selectSidebarOpen = (s: AppState) => s.sidebarOpen;

export const selectVideoPreviewCutId = (s: AppState) => s.videoPreviewCutId;
export const selectSequencePreviewCutId = (s: AppState) => s.sequencePreviewCutId;

export const selectSelectScene = (s: AppState) => s.selectScene;
export const selectSelectCut = (s: AppState) => s.selectCut;
export const selectToggleCutSelection = (s: AppState) => s.toggleCutSelection;
export const selectSelectCutRange = (s: AppState) => s.selectCutRange;
export const selectGetAsset = (s: AppState) => s.getAsset;
export const selectGetCutGroup = (s: AppState) => s.getCutGroup;
export const selectGetSelectedCutIds = (s: AppState) => s.getSelectedCutIds;
export const selectGetSelectedCuts = (s: AppState) => s.getSelectedCuts;
export const selectCopySelectedCuts = (s: AppState) => s.copySelectedCuts;
export const selectCanPaste = (s: AppState) => s.canPaste;
export const selectPasteCuts = (s: AppState) => s.pasteCuts;
export const selectGetCutRuntime = (s: AppState) => s.getCutRuntime;
export const selectOpenVideoPreview = (s: AppState) => s.openVideoPreview;
export const selectOpenSequencePreview = (s: AppState) => s.openSequencePreview;
export const selectCreateGroup = (s: AppState) => s.createGroup;
export const selectCreateCutFromImport = (s: AppState) => s.createCutFromImport;
export const selectUpdateGroupCutOrder = (s: AppState) => s.updateGroupCutOrder;
export const selectToggleGroupCollapsed = (s: AppState) => s.toggleGroupCollapsed;
export const selectSelectGroup = (s: AppState) => s.selectGroup;
export const selectCloseDetailsPanel = (s: AppState) => s.closeDetailsPanel;
export const selectAssetCache = (s: AppState) => s.assetCache;
export const selectDeleteAssetWithPolicy = (s: AppState) => s.deleteAssetWithPolicy;

export const selectAddSceneNote = (s: AppState) => s.addSceneNote;
export const selectRemoveSceneNote = (s: AppState) => s.removeSceneNote;
export const selectGetSelectedGroup = (s: AppState) => s.getSelectedGroup;
export const selectCacheAsset = (s: AppState) => s.cacheAsset;
export const selectUpdateCutAsset = (s: AppState) => s.updateCutAsset;
export const selectAttachAudioToCut = (s: AppState) => s.attachAudioToCut;
export const selectDetachAudioFromCut = (s: AppState) => s.detachAudioFromCut;
export const selectGetAttachedAudioForCut = (s: AppState) => s.getAttachedAudioForCut;
export const selectUpdateCutAudioOffset = (s: AppState) => s.updateCutAudioOffset;
export const selectAttachAudioToScene = (s: AppState) => s.attachAudioToScene;
export const selectDetachAudioFromScene = (s: AppState) => s.detachAudioFromScene;
export const selectGetSceneAudioBinding = (s: AppState) => s.getSceneAudioBinding;
export const selectGetAttachedAudioForScene = (s: AppState) => s.getAttachedAudioForScene;
export const selectSetCutUseEmbeddedAudio = (s: AppState) => s.setCutUseEmbeddedAudio;
export const selectRelinkCutAsset = (s: AppState) => s.relinkCutAsset;

export const selectSetGlobalVolume = (s: AppState) => s.setGlobalVolume;
export const selectToggleGlobalMute = (s: AppState) => s.toggleGlobalMute;

export const selectCloseVideoPreview = (s: AppState) => s.closeVideoPreview;
export const selectCloseSequencePreview = (s: AppState) => s.closeSequencePreview;
export const selectCacheAssetAction = selectCacheAsset;
export const selectUpdateCutAssetAction = selectUpdateCutAsset;
export const selectToggleAssetDrawer = (s: AppState) => s.toggleAssetDrawer;
export const selectToggleSidebar = (s: AppState) => s.toggleSidebar;
export const selectClearCutSelection = (s: AppState) => s.clearCutSelection;
