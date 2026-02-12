import type { Asset, Cut, CutRuntimeState, MetadataStore, PreviewMode, SelectionType, Scene } from '../types';
import type {
  CutTimelineSliceContract,
  GroupSliceContract,
  MetadataSliceContract,
  SelectionUiSliceContract,
} from './contracts';

interface SelectorState {
  scenes: Scene[];
  vaultPath: string | null;
  metadataStore: MetadataStore | null;
  selectedSceneId: string | null;
  selectedCutId: string | null;
  selectedCutIds: Set<string>;
  selectedGroupId: string | null;
  selectionType: SelectionType;
  detailsPanelOpen: boolean;
  previewMode: PreviewMode;
  globalVolume: number;
  globalMuted: boolean;
  projectLoaded: boolean;
  projectName: string;
  sidebarOpen: boolean;
  videoPreviewCutId: string | null;
  sequencePreviewCutId: string | null;
  assetCache: Map<string, Asset>;
  selectScene: SelectionUiSliceContract['selectScene'];
  selectCut: SelectionUiSliceContract['selectCut'];
  toggleCutSelection: SelectionUiSliceContract['toggleCutSelection'];
  selectCutRange: SelectionUiSliceContract['selectCutRange'];
  getAsset: MetadataSliceContract['getAsset'];
  getCutGroup: GroupSliceContract['getCutGroup'];
  getSelectedCutIds: () => string[];
  getSelectedCuts: () => Array<{ scene: Scene; cut: Cut }>;
  copySelectedCuts: CutTimelineSliceContract['copySelectedCuts'];
  canPaste: CutTimelineSliceContract['canPaste'];
  pasteCuts: CutTimelineSliceContract['pasteCuts'];
  getCutRuntime: (cutId: string) => CutRuntimeState | undefined;
  openVideoPreview: SelectionUiSliceContract['openVideoPreview'];
  openSequencePreview: SelectionUiSliceContract['openSequencePreview'];
  createGroup: GroupSliceContract['createGroup'];
  createCutFromImport: CutTimelineSliceContract['createCutFromImport'];
  updateGroupCutOrder: GroupSliceContract['updateGroupCutOrder'];
  toggleGroupCollapsed: GroupSliceContract['toggleGroupCollapsed'];
  selectGroup: GroupSliceContract['selectGroup'];
  closeDetailsPanel: SelectionUiSliceContract['closeDetailsPanel'];
  deleteAssetWithPolicy: MetadataSliceContract['deleteAssetWithPolicy'];
  addSceneNote: CutTimelineSliceContract['addSceneNote'];
  removeSceneNote: CutTimelineSliceContract['removeSceneNote'];
  getSelectedGroup: GroupSliceContract['getSelectedGroup'];
  cacheAsset: MetadataSliceContract['cacheAsset'];
  updateCutAsset: CutTimelineSliceContract['updateCutAsset'];
  attachAudioToCut: MetadataSliceContract['attachAudioToCut'];
  detachAudioFromCut: MetadataSliceContract['detachAudioFromCut'];
  getAttachedAudioForCut: MetadataSliceContract['getAttachedAudioForCut'];
  updateCutAudioOffset: MetadataSliceContract['updateCutAudioOffset'];
  setCutUseEmbeddedAudio: CutTimelineSliceContract['setCutUseEmbeddedAudio'];
  relinkCutAsset: MetadataSliceContract['relinkCutAsset'];
  setGlobalVolume: SelectionUiSliceContract['setGlobalVolume'];
  toggleGlobalMute: SelectionUiSliceContract['toggleGlobalMute'];
  closeVideoPreview: SelectionUiSliceContract['closeVideoPreview'];
  closeSequencePreview: SelectionUiSliceContract['closeSequencePreview'];
  toggleAssetDrawer: SelectionUiSliceContract['toggleAssetDrawer'];
  toggleSidebar: SelectionUiSliceContract['toggleSidebar'];
  clearCutSelection: SelectionUiSliceContract['clearCutSelection'];
}

export const selectScenes = (s: SelectorState) => s.scenes;
export const selectVaultPath = (s: SelectorState) => s.vaultPath;
export const selectMetadataStore = (s: SelectorState) => s.metadataStore;
export const selectSelectedSceneId = (s: SelectorState) => s.selectedSceneId;
export const selectSelectedCutId = (s: SelectorState) => s.selectedCutId;
export const selectSelectedCutIds = (s: SelectorState) => s.selectedCutIds;
export const selectSelectedGroupId = (s: SelectorState) => s.selectedGroupId;
export const selectSelectionType = (s: SelectorState) => s.selectionType;
export const selectDetailsPanelOpen = (s: SelectorState) => s.detailsPanelOpen;
export const selectPreviewMode = (s: SelectorState) => s.previewMode;
export const selectGlobalVolume = (s: SelectorState) => s.globalVolume;
export const selectGlobalMuted = (s: SelectorState) => s.globalMuted;

export const selectProjectLoaded = (s: SelectorState) => s.projectLoaded;
export const selectProjectName = (s: SelectorState) => s.projectName;
export const selectSidebarOpen = (s: SelectorState) => s.sidebarOpen;

export const selectVideoPreviewCutId = (s: SelectorState) => s.videoPreviewCutId;
export const selectSequencePreviewCutId = (s: SelectorState) => s.sequencePreviewCutId;

export const selectSelectScene = (s: SelectorState) => s.selectScene;
export const selectSelectCut = (s: SelectorState) => s.selectCut;
export const selectToggleCutSelection = (s: SelectorState) => s.toggleCutSelection;
export const selectSelectCutRange = (s: SelectorState) => s.selectCutRange;
export const selectGetAsset = (s: SelectorState) => s.getAsset;
export const selectGetCutGroup = (s: SelectorState) => s.getCutGroup;
export const selectGetSelectedCutIds = (s: SelectorState) => s.getSelectedCutIds;
export const selectGetSelectedCuts = (s: SelectorState) => s.getSelectedCuts;
export const selectCopySelectedCuts = (s: SelectorState) => s.copySelectedCuts;
export const selectCanPaste = (s: SelectorState) => s.canPaste;
export const selectPasteCuts = (s: SelectorState) => s.pasteCuts;
export const selectGetCutRuntime = (s: SelectorState) => s.getCutRuntime;
export const selectOpenVideoPreview = (s: SelectorState) => s.openVideoPreview;
export const selectOpenSequencePreview = (s: SelectorState) => s.openSequencePreview;
export const selectCreateGroup = (s: SelectorState) => s.createGroup;
export const selectCreateCutFromImport = (s: SelectorState) => s.createCutFromImport;
export const selectUpdateGroupCutOrder = (s: SelectorState) => s.updateGroupCutOrder;
export const selectToggleGroupCollapsed = (s: SelectorState) => s.toggleGroupCollapsed;
export const selectSelectGroup = (s: SelectorState) => s.selectGroup;
export const selectCloseDetailsPanel = (s: SelectorState) => s.closeDetailsPanel;
export const selectAssetCache = (s: SelectorState) => s.assetCache;
export const selectDeleteAssetWithPolicy = (s: SelectorState) => s.deleteAssetWithPolicy;

export const selectAddSceneNote = (s: SelectorState) => s.addSceneNote;
export const selectRemoveSceneNote = (s: SelectorState) => s.removeSceneNote;
export const selectGetSelectedGroup = (s: SelectorState) => s.getSelectedGroup;
export const selectCacheAsset = (s: SelectorState) => s.cacheAsset;
export const selectUpdateCutAsset = (s: SelectorState) => s.updateCutAsset;
export const selectAttachAudioToCut = (s: SelectorState) => s.attachAudioToCut;
export const selectDetachAudioFromCut = (s: SelectorState) => s.detachAudioFromCut;
export const selectGetAttachedAudioForCut = (s: SelectorState) => s.getAttachedAudioForCut;
export const selectUpdateCutAudioOffset = (s: SelectorState) => s.updateCutAudioOffset;
export const selectSetCutUseEmbeddedAudio = (s: SelectorState) => s.setCutUseEmbeddedAudio;
export const selectRelinkCutAsset = (s: SelectorState) => s.relinkCutAsset;

export const selectSetGlobalVolume = (s: SelectorState) => s.setGlobalVolume;
export const selectToggleGlobalMute = (s: SelectorState) => s.toggleGlobalMute;

export const selectCloseVideoPreview = (s: SelectorState) => s.closeVideoPreview;
export const selectCloseSequencePreview = (s: SelectorState) => s.closeSequencePreview;
export const selectCacheAssetAction = (s: SelectorState) => s.cacheAsset;
export const selectUpdateCutAssetAction = (s: SelectorState) => s.updateCutAsset;
export const selectToggleAssetDrawer = (s: SelectorState) => s.toggleAssetDrawer;
export const selectToggleSidebar = (s: SelectorState) => s.toggleSidebar;
export const selectClearCutSelection = (s: SelectorState) => s.clearCutSelection;
