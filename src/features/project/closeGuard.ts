import type { PersistedProjectSnapshot, PersistedProjectStateLike } from './persistedSnapshot';
import { hasUnsavedChanges } from './persistedSnapshot';

export type ProjectCloseTarget = 'project' | 'app';

export type ProjectCloseGuardResult =
  | { kind: 'allow' }
  | { kind: 'confirm-warning'; reason: 'unsaved-changes' | 'missing-persisted-snapshot'; target: ProjectCloseTarget }
  | { kind: 'blocked'; reason: 'close-in-progress' };

export interface ProjectCloseConfirmContent {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
}

export interface ProjectCloseGuardInput {
  projectLoaded: boolean;
  currentProject: PersistedProjectStateLike;
  lastPersistedSnapshot: PersistedProjectSnapshot | null;
  closeInProgress?: boolean;
  target: ProjectCloseTarget;
}

export function getCloseGuardResult(input: ProjectCloseGuardInput): ProjectCloseGuardResult {
  if (input.closeInProgress) {
    return { kind: 'blocked', reason: 'close-in-progress' };
  }
  if (!input.projectLoaded) {
    return { kind: 'allow' };
  }
  if (!input.lastPersistedSnapshot) {
    return { kind: 'confirm-warning', reason: 'missing-persisted-snapshot', target: input.target };
  }
  if (hasUnsavedChanges(input.currentProject, input.lastPersistedSnapshot)) {
    return { kind: 'confirm-warning', reason: 'unsaved-changes', target: input.target };
  }
  return { kind: 'allow' };
}

export function buildProjectCloseConfirmContent(target: ProjectCloseTarget): ProjectCloseConfirmContent {
  if (target === 'app') {
    return {
      title: 'Exit App',
      message: 'Exit the app? Unsaved changes will be lost.',
      confirmLabel: 'Exit App',
      cancelLabel: 'Cancel',
    };
  }
  return {
    title: 'Close Project',
    message: 'Return to the startup screen? Unsaved changes will be lost.',
    confirmLabel: 'Close Project',
    cancelLabel: 'Cancel',
  };
}
