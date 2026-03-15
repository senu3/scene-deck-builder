import type { CutRuntimeState, Scene, SourcePanelState } from '../../types';
import type { PersistedCutRuntimeById } from '../../utils/projectSave';
import { collectPersistedCutRuntimeById } from '../../utils/projectSave';

export interface PersistedProjectSnapshot {
  name: string;
  vaultPath: string | null;
  scenes: Scene[];
  sceneOrder: string[];
  cutRuntimeById?: PersistedCutRuntimeById;
  targetTotalDurationSec?: number;
  sourcePanel: SourcePanelState | undefined;
}

export interface PersistedProjectStateLike {
  projectName: string;
  vaultPath: string | null;
  scenes: Scene[];
  sceneOrder: string[];
  cutRuntimeById?: Record<string, CutRuntimeState>;
  targetTotalDurationSec?: number;
  getSourcePanelState?: () => SourcePanelState;
  sourcePanelState?: SourcePanelState;
}

export function buildPersistedSnapshot(state: PersistedProjectStateLike): PersistedProjectSnapshot {
  const sourcePanel = state.getSourcePanelState ? state.getSourcePanelState() : state.sourcePanelState;
  const persistedCutRuntimeById = collectPersistedCutRuntimeById(state.cutRuntimeById, state.scenes);
  return {
    name: state.projectName,
    vaultPath: state.vaultPath,
    scenes: state.scenes,
    sceneOrder: state.sceneOrder,
    cutRuntimeById: Object.keys(persistedCutRuntimeById).length > 0 ? persistedCutRuntimeById : undefined,
    targetTotalDurationSec: state.targetTotalDurationSec,
    sourcePanel,
  };
}

export function serializePersistedSnapshot(snapshot: PersistedProjectSnapshot): string {
  return JSON.stringify(snapshot);
}

export function hasPersistedSnapshotChanged(
  prev: PersistedProjectSnapshot,
  next: PersistedProjectSnapshot
): boolean {
  return serializePersistedSnapshot(prev) !== serializePersistedSnapshot(next);
}

export function hasUnsavedChanges(
  currentProject: PersistedProjectStateLike,
  lastPersistedSnapshot: PersistedProjectSnapshot | null
): boolean {
  if (!lastPersistedSnapshot) return true;
  return hasPersistedSnapshotChanged(lastPersistedSnapshot, buildPersistedSnapshot(currentProject));
}
