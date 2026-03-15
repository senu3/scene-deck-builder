import { describe, expect, it, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import SceneDurationBar from '../SceneDurationBar';
import { saveDurationTargetSettings } from '../../utils/durationTarget';
import type { Scene } from '../../types';

function makeScene(id: string, duration: number): Scene {
  return {
    id,
    name: `Scene ${id}`,
    order: 0,
    notes: [],
    cuts: [
      {
        id: `cut-${id}`,
        assetId: `asset-${id}`,
        displayTime: duration,
        order: 0,
      },
    ],
  };
}

describe('duration target UI', () => {
  beforeEach(() => {
    saveDurationTargetSettings({ sceneDurationBarMode: 'relative' });
  });

  it('hides mode toggle when target is unset', () => {
    const barHost = document.createElement('div');
    const barRoot = createRoot(barHost);
    act(() => {
      barRoot.render(
        <SceneDurationBar
          scenes={[makeScene('1', 30)]}
          selectedSceneId={null}
          onSelectScene={() => {}}
        />
      );
    });
    expect(barHost.querySelector('[aria-label="Switch to target mode"]')).toBeNull();
    act(() => {
      barRoot.unmount();
    });
  });

  it('shows remaining segment without warning when total is below target', () => {
    saveDurationTargetSettings({ sceneDurationBarMode: 'target' });
    const host = document.createElement('div');
    const root = createRoot(host);
    act(() => {
      root.render(
        <SceneDurationBar
          scenes={[makeScene('1', 30), makeScene('2', 20)]}
          selectedSceneId={null}
          onSelectScene={() => {}}
          targetSec={120}
        />
      );
    });

    const bar = host.querySelector('[aria-label="Scene duration bar"]');
    expect(bar?.getAttribute('data-mode')).toBe('target');
    expect(bar?.getAttribute('data-over')).toBe('false');
    expect(host.querySelector('[data-kind="remaining"]')).not.toBeNull();
    expect(host.querySelector('[data-kind="over"]')).toBeNull();
    act(() => {
      root.unmount();
    });
  });

  it('shows warning and caps over segment ratio to 25%', () => {
    saveDurationTargetSettings({ sceneDurationBarMode: 'target' });

    const barHost = document.createElement('div');
    const barRoot = createRoot(barHost);
    act(() => {
      barRoot.render(
        <SceneDurationBar
          scenes={[makeScene('1', 100), makeScene('2', 80)]}
          selectedSceneId={null}
          onSelectScene={() => {}}
          targetSec={120}
        />
      );
    });

    const over = barHost.querySelector('[data-kind="over"]');
    expect(over).not.toBeNull();
    expect(over?.getAttribute('data-ratio')).toBe('0.2500');
    act(() => {
      barRoot.unmount();
    });
  });

  it('syncs scene duration bar mode when settings change outside the component', () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    act(() => {
      root.render(
        <SceneDurationBar
          scenes={[makeScene('1', 30), makeScene('2', 20)]}
          selectedSceneId={null}
          onSelectScene={() => {}}
          targetSec={120}
        />
      );
    });

    const barBefore = host.querySelector('[aria-label="Scene duration bar"]');
    expect(barBefore?.getAttribute('data-mode')).toBe('relative');

    act(() => {
      saveDurationTargetSettings({ sceneDurationBarMode: 'target' });
    });

    const barAfter = host.querySelector('[aria-label="Scene duration bar"]');
    expect(barAfter?.getAttribute('data-mode')).toBe('target');

    act(() => {
      root.unmount();
    });
  });
});
