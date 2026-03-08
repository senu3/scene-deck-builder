import { act, useCallback, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExportSequenceItem } from '../../../utils/exportSequence';
import { asCanonicalDurationSec } from '../../../utils/storyTiming';
import { usePreviewSequenceMediaSource } from '../usePreviewSequenceMediaSource';
import type { PreviewSequencePlaybackItem } from '../types';

const previewMediaMocks = vi.hoisted(() => ({
  createImageMediaSource: vi.fn(() => ({ element: <div>image</div> })),
  createLipSyncImageMediaSource: vi.fn(() => ({ element: <div>lipsync</div> })),
  createVideoHoldMediaSource: vi.fn(() => ({ element: <div>hold</div> })),
  createVideoMediaSource: vi.fn(() => ({ element: <div>video</div> })),
}));

vi.mock('../../../utils/previewMedia', () => ({
  createImageMediaSource: previewMediaMocks.createImageMediaSource,
  createLipSyncImageMediaSource: previewMediaMocks.createLipSyncImageMediaSource,
  createVideoHoldMediaSource: previewMediaMocks.createVideoHoldMediaSource,
  createVideoMediaSource: previewMediaMocks.createVideoMediaSource,
}));

vi.mock('../../../features/thumbnails/api', () => ({
  getAssetThumbnail: vi.fn(async () => null),
}));

interface HarnessProps {
  items: PreviewSequencePlaybackItem[];
  previewSequenceItemByIndex?: Map<number, ExportSequenceItem>;
}

const emptySequenceItemByIndex = new Map<number, ExportSequenceItem>();

function Harness({ items, previewSequenceItemByIndex = emptySequenceItemByIndex }: HarnessProps) {
  const setSequenceSource = useMemo(() => vi.fn(), []);
  const sequenceTick = useMemo(() => vi.fn(), []);
  const sequenceGoToNext = useMemo(() => vi.fn(), []);
  const showMiniToast = useMemo(() => vi.fn(), []);
  const videoRef = useRef(document.createElement('video'));
  const videoObjectUrl = useMemo(() => ({
    assetId: items[0]?.assetId ?? 'asset-1',
    url: 'blob:video-1',
  }), [items]);
  const getSequenceLiveAbsoluteTime = useCallback(() => 0, []);

  usePreviewSequenceMediaSource({
    usesSequenceController: true,
    items,
    currentIndex: 0,
    videoObjectUrl,
    setSequenceSource,
    sequenceTick,
    sequenceGoToNext,
    previewSequenceItemByIndex,
    getSequenceLiveAbsoluteTime,
    showMiniToast,
    videoRef,
  });
  return null;
}

const baseItem: PreviewSequencePlaybackItem = {
  cutId: 'cut-1',
  assetId: 'asset-1',
  assetType: 'video',
  sourcePath: '/tmp/video.mp4',
  srcInSec: 1.25,
  srcOutSec: 3.5,
  normalizedDisplayTime: asCanonicalDurationSec(2.25),
  sceneId: 'scene-1',
  sceneName: 'Scene 1',
  cutIndex: 0,
  thumbnail: null,
  isHold: false,
};

describe('usePreviewSequenceMediaSource', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses plan-derived clip timing for video playback', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);

    await act(async () => {
      root.render(<Harness items={[baseItem]} />);
    });

    expect(previewMediaMocks.createVideoMediaSource).toHaveBeenCalledWith(expect.objectContaining({
      inPoint: 1.25,
      outPoint: 3.5,
    }));
    expect(previewMediaMocks.createVideoHoldMediaSource).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it('uses hold playback source when the plan marks the item as hold', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);

    await act(async () => {
      root.render(<Harness items={[{
        ...baseItem,
        isHold: true,
        normalizedDisplayTime: asCanonicalDurationSec(1.2),
        srcOutSec: 3.0,
      }]} />);
    });

    expect(previewMediaMocks.createVideoHoldMediaSource).toHaveBeenCalledWith(expect.objectContaining({
      frameTimeSec: 3.0,
      duration: 1.2,
    }));
    expect(previewMediaMocks.createVideoMediaSource).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });
});
