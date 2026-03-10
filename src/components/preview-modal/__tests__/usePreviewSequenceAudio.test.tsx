import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExportAudioPlan } from '../../../utils/exportAudioPlan';
import { usePreviewSequenceAudio } from '../usePreviewSequenceAudio';

const { managerInstances, MockAudioManager } = vi.hoisted(() => {
  const managerInstances: unknown[] = [];

  class MockAudioManager {
    loaded = false;
    playing = false;
    disposed = false;
    currentTime = 0;
    playCalls: number[] = [];
    pauseCalls = 0;
    stopCalls = 0;
    unloadCalls = 0;
    disposeCalls = 0;
    seekCalls: number[] = [];
    volumeCalls: number[] = [];
    loadId = 0;

    constructor() {
      managerInstances.push(this);
    }

    pause() {
      this.pauseCalls += 1;
      this.playing = false;
    }

    unload() {
      this.unloadCalls += 1;
      this.loaded = false;
      this.playing = false;
      this.loadId += 1;
    }

    stop() {
      this.stopCalls += 1;
      this.playing = false;
    }

    dispose() {
      this.disposeCalls += 1;
      this.disposed = true;
      this.playing = false;
    }

    isDisposed() {
      return this.disposed;
    }

    getLoadId() {
      return this.loadId;
    }

    async load() {
      this.loadId += 1;
      this.loaded = true;
      return true;
    }

    isLoaded() {
      return this.loaded;
    }

    setVolume(volume: number) {
      this.volumeCalls.push(volume);
    }

    play(position: number) {
      this.playCalls.push(position);
      this.playing = true;
      this.currentTime = position;
    }

    getIsPlaying() {
      return this.playing;
    }

    getCurrentTime() {
      return this.currentTime;
    }

    seek(position: number) {
      this.seekCalls.push(position);
      this.currentTime = position;
    }
  }

  return { managerInstances, MockAudioManager };
});

vi.mock('../../../utils/audioUtils', () => ({
  AudioManager: MockAudioManager,
}));

interface HarnessProps {
  absoluteTime: number;
  previewAudioPlan: ExportAudioPlan;
  isPlaying?: boolean;
  isBuffering?: boolean;
}

function Harness({
  absoluteTime,
  previewAudioPlan,
  isPlaying = true,
  isBuffering = false,
}: HarnessProps) {
  usePreviewSequenceAudio({
    isSingleMode: false,
    itemsLength: 2,
    absoluteTime,
    isPlaying,
    isBuffering,
    previewAudioPlan,
    globalMuted: false,
    globalVolume: 1,
  });
  return null;
}

const previewAudioPlan: ExportAudioPlan = {
  totalDurationSec: 4,
  events: [
    {
      sourceType: 'video',
      sourcePath: '/tmp/test-audio.wav',
      assetId: 'asset-1',
      cutId: 'cut-1',
      sourceStartSec: 0,
      timelineStartSec: 0,
      durationSec: 2,
      sourceOffsetSec: 0,
      gain: 1,
    },
  ],
};

const attachAudioPlan: ExportAudioPlan = {
  totalDurationSec: 4,
  events: [
    {
      sourceType: 'cut-attach',
      sourcePath: '/tmp/attach-audio.wav',
      assetId: 'asset-a',
      cutId: 'cut-a',
      sceneId: 'scene-a',
      sourceStartSec: 0,
      timelineStartSec: 0,
      durationSec: 3,
      sourceOffsetSec: 0,
      gain: 1,
    },
  ],
};

describe('usePreviewSequenceAudio', () => {
  afterEach(() => {
    managerInstances.length = 0;
  });

  it('switches active audio events when absolute time moves past the event boundary', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <Harness
          absoluteTime={1}
          previewAudioPlan={previewAudioPlan}
        />
      );
    });

    expect(managerInstances).toHaveLength(1);
    const manager = managerInstances[0] as {
      playCalls: number[];
      stopCalls: number;
      pauseCalls: number;
      unloadCalls: number;
      disposeCalls: number;
    };
    expect(manager.playCalls).toEqual([1]);

    await act(async () => {
      root.render(
        <Harness
          absoluteTime={2.5}
          previewAudioPlan={previewAudioPlan}
        />
      );
    });

    expect(manager.stopCalls).toBe(1);
    expect(manager.pauseCalls).toBe(0);
    expect(manager.unloadCalls).toBe(1);
    expect(manager.disposeCalls).toBe(1);

    act(() => {
      root.unmount();
    });
  });

  it('keeps the same manager when event timing metadata changes but identity is the same', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <Harness
          absoluteTime={1}
          previewAudioPlan={previewAudioPlan}
        />
      );
    });

    expect(managerInstances).toHaveLength(1);
    const manager = managerInstances[0] as {
      playCalls: number[];
      stopCalls: number;
      unloadCalls: number;
      disposeCalls: number;
    };

    const updatedPlan: ExportAudioPlan = {
      totalDurationSec: 5,
      events: [
        {
          ...previewAudioPlan.events[0],
          durationSec: 3,
        },
      ],
    };

    await act(async () => {
      root.render(
        <Harness
          absoluteTime={2}
          previewAudioPlan={updatedPlan}
        />
      );
    });

    expect(managerInstances).toHaveLength(1);
    expect(manager.playCalls.length).toBeGreaterThanOrEqual(1);
    expect(manager.stopCalls).toBe(0);
    expect(manager.unloadCalls).toBe(0);
    expect(manager.disposeCalls).toBe(0);

    act(() => {
      root.unmount();
    });
  });

  it('does not pause attach audio during buffering while sequence is playing', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <Harness
          absoluteTime={1}
          previewAudioPlan={attachAudioPlan}
          isPlaying
          isBuffering={false}
        />
      );
    });

    expect(managerInstances).toHaveLength(1);
    const manager = managerInstances[0] as {
      pauseCalls: number;
      playCalls: number[];
    };
    expect(manager.playCalls.length).toBeGreaterThanOrEqual(1);

    await act(async () => {
      root.render(
        <Harness
          absoluteTime={1.2}
          previewAudioPlan={attachAudioPlan}
          isPlaying
          isBuffering
        />
      );
    });

    expect(manager.pauseCalls).toBe(0);

    act(() => {
      root.unmount();
    });
  });

  it('keeps attach audio alive across extended hold duration without recreating the manager', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <Harness
          absoluteTime={2.8}
          previewAudioPlan={attachAudioPlan}
          isPlaying
          isBuffering={false}
        />
      );
    });

    expect(managerInstances).toHaveLength(1);
    const manager = managerInstances[0] as {
      playCalls: number[];
      stopCalls: number;
      unloadCalls: number;
      disposeCalls: number;
    };

    const extendedAttachAudioPlan: ExportAudioPlan = {
      totalDurationSec: 5,
      events: [
        {
          ...attachAudioPlan.events[0],
          durationSec: 4,
        },
      ],
    };

    await act(async () => {
      root.render(
        <Harness
          absoluteTime={3.2}
          previewAudioPlan={extendedAttachAudioPlan}
          isPlaying
          isBuffering={false}
        />
      );
    });

    expect(managerInstances).toHaveLength(1);
    expect(manager.playCalls.length).toBeGreaterThanOrEqual(1);
    expect(manager.stopCalls).toBe(0);
    expect(manager.unloadCalls).toBe(0);
    expect(manager.disposeCalls).toBe(0);

    act(() => {
      root.unmount();
    });
  });

  it('seeks from sourceStartSec and sourceOffsetSec together', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const clippedAudioPlan: ExportAudioPlan = {
      totalDurationSec: 4,
      events: [
        {
          sourceType: 'video',
          sourcePath: '/tmp/clipped.mp4',
          assetId: 'asset-clip',
          cutId: 'cut-clip',
          sourceStartSec: 1.25,
          sourceOffsetSec: 0.5,
          timelineStartSec: 0,
          durationSec: 2,
          gain: 1,
        },
      ],
    };

    await act(async () => {
      root.render(
        <Harness
          absoluteTime={0.75}
          previewAudioPlan={clippedAudioPlan}
        />
      );
    });

    expect(managerInstances).toHaveLength(1);
    const manager = managerInstances[0] as {
      playCalls: number[];
    };
    expect(manager.playCalls[0]).toBeCloseTo(2.5, 6);

    act(() => {
      root.unmount();
    });
  });
});
