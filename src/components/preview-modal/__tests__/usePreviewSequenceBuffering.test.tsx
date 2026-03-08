import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { asCanonicalDurationSec } from '../../../utils/storyTiming';
import { usePreviewSequenceBuffering } from '../usePreviewSequenceBuffering';
import type { PreviewSequencePlaybackItem } from '../types';

const { createVideoObjectUrlMock } = vi.hoisted(() => ({
  createVideoObjectUrlMock: vi.fn(async (sourcePath: string) => `blob:${sourcePath}`),
}));

vi.mock('../../../utils/videoUtils', () => ({
  createVideoObjectUrl: createVideoObjectUrlMock,
}));

interface HarnessProps {
  items: PreviewSequencePlaybackItem[];
  setVideoObjectUrl: ReturnType<typeof vi.fn>;
}

function Harness({ items, setVideoObjectUrl }: HarnessProps) {
  usePreviewSequenceBuffering({
    isSingleMode: false,
    items,
    currentIndex: 0,
    videoObjectUrl: null,
    setVideoObjectUrl,
    setSequenceBuffering: vi.fn(),
    sequenceIsPlaying: false,
    sequenceIsBuffering: false,
    initialPreloadItems: 1,
    playSafeAhead: 1,
    preloadAhead: 1,
    revokeIfBlob: vi.fn(),
  });
  return null;
}

const baseItem: PreviewSequencePlaybackItem = {
  cutId: 'cut-1',
  assetId: 'asset-1',
  assetType: 'video',
  sourcePath: '/tmp/video.mp4',
  srcInSec: 0,
  srcOutSec: 2,
  normalizedDisplayTime: asCanonicalDurationSec(2),
  sceneId: 'scene-1',
  sceneName: 'Scene 1',
  cutIndex: 0,
  thumbnail: null,
  isHold: false,
};

describe('usePreviewSequenceBuffering', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('preloads video from playback item sourcePath without resolving raw cuts', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const setVideoObjectUrl = vi.fn();

    await act(async () => {
      root.render(<Harness items={[baseItem]} setVideoObjectUrl={setVideoObjectUrl} />);
    });

    expect(createVideoObjectUrlMock).toHaveBeenCalledWith('/tmp/video.mp4');
    expect(setVideoObjectUrl).toHaveBeenCalledWith({
      assetId: 'asset-1',
      url: 'blob:/tmp/video.mp4',
    });

    act(() => {
      root.unmount();
    });
  });
});
