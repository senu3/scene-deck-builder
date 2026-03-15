import {
  buildPersistedSnapshot,
  hasPersistedSnapshotChanged,
  serializePersistedSnapshot,
  type PersistedProjectSnapshot,
  type PersistedProjectStateLike,
} from '../features/project/persistedSnapshot';

export type ProjectSaveSnapshot = PersistedProjectSnapshot;
export type ProjectStateLike = PersistedProjectStateLike;

export const pickProjectStateForSave = buildPersistedSnapshot;
export const serializeProjectSnapshot = serializePersistedSnapshot;
export const isProjectDirty = hasPersistedSnapshotChanged;

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
