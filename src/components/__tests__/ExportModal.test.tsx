import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExportModal from '../ExportModal';
import { useStore } from '../../store/useStore';
import type { ExportSettings } from '../../features/export/types';

const initialState = useStore.getState();

describe('ExportModal', () => {
  beforeEach(() => {
    useStore.setState(initialState, true);
    useStore.setState({
      vaultPath: 'C:/vault',
      scenes: [
        {
          id: 'scene-1',
          name: 'Scene 1',
          order: 0,
          notes: [],
          cuts: [
            {
              id: 'cut-1',
              assetId: 'asset-1',
              displayTime: 2,
              order: 0,
            },
          ],
        },
      ],
    });
  });

  afterEach(() => {
    useStore.setState(initialState, true);
  });

  it('passes exportMasterWithAudio when enabled', () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const onExport = vi.fn();

    act(() => {
      root.render(
        <ExportModal
          open
          onClose={() => {}}
          onExport={onExport}
        />
      );
    });

    const masterCheckbox = host.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    const masterLabel = Array.from(host.querySelectorAll('label'))
      .find((label) => label.textContent?.includes('Also export Master MP4'));
    expect(masterCheckbox).not.toBeNull();
    expect(masterLabel).not.toBeUndefined();
    act(() => {
      masterLabel?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(masterCheckbox?.checked).toBe(true);

    const exportButton = Array.from(host.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Export');
    expect(exportButton).not.toBeUndefined();
    act(() => {
      exportButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onExport).toHaveBeenCalledTimes(1);
    const settings = onExport.mock.calls[0][0] as ExportSettings;
    expect(settings.format).toBe('mp4');
    expect(settings.outputRootPath).toBe('C:/vault/export');
    expect(settings.mp4.exportMasterWithAudio).toBe(true);

    act(() => {
      root.unmount();
    });
  });
});
