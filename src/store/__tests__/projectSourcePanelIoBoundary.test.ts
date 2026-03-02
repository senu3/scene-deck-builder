import { beforeEach, describe, expect, it } from 'vitest';
import type { SourcePanelState } from '../../types';
import { resetElectronMocks } from '../../test/setup.renderer';
import { useStore } from '../useStore';

describe('projectSlice source panel I/O boundary', () => {
  const initialState = useStore.getState();

  beforeEach(() => {
    resetElectronMocks();
    useStore.setState(initialState, true);
    useStore.getState().initializeProject({
      name: 'Test',
      vaultPath: 'C:/vault',
      scenes: [{ id: 'scene-1', name: 'Scene 1', cuts: [], notes: [] }],
    });
  });

  it('refreshes all source folders using provider-backed folder reads', async () => {
    useStore.getState().addSourceFolder({
      path: 'C:/source',
      name: 'source',
      structure: [],
    });

    (window.electronAPI!.getFolderContents as any).mockResolvedValue([
      { name: 'img.png', path: 'C:/source/img.png', isDirectory: false },
    ]);

    await useStore.getState().refreshAllSourceFolders();

    const folders = useStore.getState().sourceFolders;
    expect(folders).toHaveLength(1);
    expect(folders[0]?.structure).toEqual([
      { name: 'img.png', path: 'C:/source/img.png', isDirectory: false },
    ]);
    expect(window.electronAPI!.getFolderContents).toHaveBeenCalledWith('C:/source');
  });

  it('initializes source panel and skips vault assets folder from saved state', async () => {
    const savedState: SourcePanelState = {
      folders: [
        { path: 'C:/vault/assets', name: 'assets' },
        { path: 'C:/source', name: 'source' },
      ],
      expandedPaths: ['C:/source'],
      viewMode: 'grid',
    };

    (window.electronAPI!.getFolderContents as any).mockResolvedValue([
      { name: 'a.mov', path: 'C:/source/a.mov', isDirectory: false },
    ]);

    await useStore.getState().initializeSourcePanel(savedState, 'C:/vault');

    const state = useStore.getState();
    expect(state.sourceFolders.map((f) => f.path)).toEqual(['C:/source']);
    expect(state.sourceViewMode).toBe('grid');
    expect(state.expandedFolders.has('C:/source')).toBe(true);
    expect(window.electronAPI!.getFolderContents).toHaveBeenCalledTimes(1);
    expect(window.electronAPI!.getFolderContents).toHaveBeenCalledWith('C:/source');
  });

  it('checks vault assets path existence when no saved panel state', async () => {
    await useStore.getState().initializeSourcePanel(undefined, 'C:/vault');
    expect(window.electronAPI!.pathExists).toHaveBeenCalledWith('C:/vault/assets');
  });
});
