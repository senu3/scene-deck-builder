import { describe, expect, it } from 'vitest';
import {
  buildProjectCloseConfirmContent,
  getCloseGuardResult,
} from '../closeGuard';
import { buildPersistedSnapshot } from '../persistedSnapshot';

function baseProject() {
  return {
    projectName: 'Test',
    vaultPath: 'C:/vault',
    scenes: [{ id: 's1', name: 'Scene 1', cuts: [], order: 0, notes: [] }],
    sceneOrder: ['s1'],
    sourcePanelState: { folders: [], expandedPaths: [], viewMode: 'list' as const },
  };
}

describe('project close guard', () => {
  it('allows close when no project is loaded', () => {
    const result = getCloseGuardResult({
      projectLoaded: false,
      currentProject: baseProject(),
      lastPersistedSnapshot: null,
      target: 'project',
    });

    expect(result).toEqual({ kind: 'allow' });
  });

  it('allows close when current state matches the last persisted snapshot', () => {
    const currentProject = baseProject();
    const result = getCloseGuardResult({
      projectLoaded: true,
      currentProject,
      lastPersistedSnapshot: buildPersistedSnapshot(currentProject),
      target: 'app',
    });

    expect(result).toEqual({ kind: 'allow' });
  });

  it('requires warning confirmation when unsaved changes exist', () => {
    const persisted = baseProject();
    const currentProject = {
      ...persisted,
      scenes: [{ ...persisted.scenes[0], name: 'Changed' }],
    };
    const result = getCloseGuardResult({
      projectLoaded: true,
      currentProject,
      lastPersistedSnapshot: buildPersistedSnapshot(persisted),
      target: 'project',
    });

    expect(result).toEqual({
      kind: 'confirm-warning',
      reason: 'unsaved-changes',
      target: 'project',
    });
  });

  it('requires warning confirmation when no persisted snapshot exists yet', () => {
    const result = getCloseGuardResult({
      projectLoaded: true,
      currentProject: baseProject(),
      lastPersistedSnapshot: null,
      target: 'app',
    });

    expect(result).toEqual({
      kind: 'confirm-warning',
      reason: 'missing-persisted-snapshot',
      target: 'app',
    });
  });

  it('can block re-entrant closes', () => {
    const project = baseProject();
    const result = getCloseGuardResult({
      projectLoaded: true,
      currentProject: project,
      lastPersistedSnapshot: buildPersistedSnapshot(project),
      closeInProgress: true,
      target: 'app',
    });

    expect(result).toEqual({
      kind: 'blocked',
      reason: 'close-in-progress',
    });
  });
});

describe('project close confirm content', () => {
  it('returns close-project copy', () => {
    expect(buildProjectCloseConfirmContent('project')).toEqual({
      title: 'Close Project',
      message: 'Return to the startup screen? Unsaved changes will be lost.',
      confirmLabel: 'Close Project',
      cancelLabel: 'Cancel',
    });
  });

  it('returns exit-app copy', () => {
    expect(buildProjectCloseConfirmContent('app')).toEqual({
      title: 'Exit App',
      message: 'Exit the app? Unsaved changes will be lost.',
      confirmLabel: 'Exit App',
      cancelLabel: 'Cancel',
    });
  });
});
