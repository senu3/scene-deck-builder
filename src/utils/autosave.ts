import type { CutRuntimeState, Scene, SourcePanelState } from '../types';
import type { PersistedCutRuntimeById } from './projectSave';
import { collectPersistedCutRuntimeById } from './projectSave';

export interface ProjectSaveSnapshot {
  name: string;
  vaultPath: string | null;
  scenes: Scene[];
  sceneOrder: string[];
  cutRuntimeById?: PersistedCutRuntimeById;
  targetTotalDurationSec?: number;
  sourcePanel: SourcePanelState | undefined;
}

export interface ProjectStateLike {
  projectName: string;
  vaultPath: string | null;
  scenes: Scene[];
  sceneOrder: string[];
  cutRuntimeById?: Record<string, CutRuntimeState>;
  targetTotalDurationSec?: number;
  getSourcePanelState?: () => SourcePanelState;
  sourcePanelState?: SourcePanelState;
}

export function pickProjectStateForSave(state: ProjectStateLike): ProjectSaveSnapshot {
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

export function serializeProjectSnapshot(snapshot: ProjectSaveSnapshot): string {
  return JSON.stringify(snapshot);
}

export function isProjectDirty(prev: ProjectSaveSnapshot, next: ProjectSaveSnapshot): boolean {
  return serializeProjectSnapshot(prev) !== serializeProjectSnapshot(next);
}

export function subscribeProjectChanges(
  store: { subscribe: (listener: (state: ProjectStateLike, prevState: ProjectStateLike) => void) => () => void },
  onDirty: (next: ProjectSaveSnapshot, prev: ProjectSaveSnapshot) => void
) {
  return store.subscribe((state, prevState) => {
    const prevSnap = pickProjectStateForSave(prevState);
    const nextSnap = pickProjectStateForSave(state);
    if (isProjectDirty(prevSnap, nextSnap)) {
      onDirty(nextSnap, prevSnap);
    }
  });
}

export interface AutosaveControllerOptions {
  debounceMs: number;
  save: () => Promise<void>;
  onError?: (error: unknown) => void;
}

export function createAutosaveController({ debounceMs, save, onError }: AutosaveControllerOptions) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let pending = false;
  let errorNotified = false;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const runSave = async () => {
    if (inFlight) {
      pending = true;
      return;
    }

    clearTimer();
    pending = false;
    inFlight = true;

    try {
      await save();
      errorNotified = false;
    } catch (error) {
      if (!errorNotified && onError) {
        onError(error);
        errorNotified = true;
      }
    } finally {
      inFlight = false;
      if (pending) {
        pending = false;
        void runSave();
      }
    }
  };

  const schedule = () => {
    pending = true;
    clearTimer();
    timer = setTimeout(() => {
      void runSave();
    }, debounceMs);
  };

  const flush = async () => {
    if (timer) {
      clearTimer();
      await runSave();
      return;
    }
    if (pending && !inFlight) {
      await runSave();
    }
  };

  return { schedule, flush };
}
