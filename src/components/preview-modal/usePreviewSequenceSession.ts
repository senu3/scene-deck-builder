import type React from 'react';
import type { ExportAudioPlan } from '../../utils/exportAudioPlan';
import type { ExportSequenceItem } from '../../utils/exportSequence';
import type { MediaSource } from '../../utils/previewMedia';
import type { PreviewSequencePlaybackItem } from './types';
import { usePreviewSequenceAudio } from './usePreviewSequenceAudio';
import { usePreviewSequenceBuffering } from './usePreviewSequenceBuffering';
import { usePreviewSequenceMediaSource } from './usePreviewSequenceMediaSource';

interface UsePreviewSequenceSessionInput {
  isSingleMode: boolean;
  usesSequenceController: boolean;
  items: PreviewSequencePlaybackItem[];
  currentIndex: number;
  sequenceCurrentIndex: number;
  videoObjectUrl: { assetId: string; url: string } | null;
  setVideoObjectUrl: (next: { assetId: string; url: string } | null) => void;
  setSequenceBuffering: (isBuffering: boolean) => void;
  sequenceIsPlaying: boolean;
  sequenceIsBuffering: boolean;
  initialPreloadItems: number;
  playSafeAhead: number;
  preloadAhead: number;
  revokeIfBlob: (url: string) => void;
  setSequenceSource: (source: MediaSource | null) => void;
  sequenceTick: (localTime: number) => void;
  sequenceGoToNext: (fromIndex?: number) => void;
  previewSequenceItemByIndex: Map<number, ExportSequenceItem>;
  getSequenceLiveAbsoluteTime: () => number;
  showMiniToast: (message: string, variant?: 'success' | 'info' | 'warning' | 'error') => void;
  videoRef: React.RefObject<HTMLVideoElement>;
  sequenceAbsoluteTime: number;
  previewAudioPlan: ExportAudioPlan;
  globalMuted: boolean;
  globalVolume: number;
}

export function usePreviewSequenceSession({
  isSingleMode,
  usesSequenceController,
  items,
  currentIndex,
  sequenceCurrentIndex,
  videoObjectUrl,
  setVideoObjectUrl,
  setSequenceBuffering,
  sequenceIsPlaying,
  sequenceIsBuffering,
  initialPreloadItems,
  playSafeAhead,
  preloadAhead,
  revokeIfBlob,
  setSequenceSource,
  sequenceTick,
  sequenceGoToNext,
  previewSequenceItemByIndex,
  getSequenceLiveAbsoluteTime,
  showMiniToast,
  videoRef,
  sequenceAbsoluteTime,
  previewAudioPlan,
  globalMuted,
  globalVolume,
}: UsePreviewSequenceSessionInput) {
  const { checkBufferStatus } = usePreviewSequenceBuffering({
    isSingleMode,
    items,
    currentIndex,
    videoObjectUrl,
    setVideoObjectUrl,
    setSequenceBuffering,
    sequenceIsPlaying,
    sequenceIsBuffering,
    initialPreloadItems,
    playSafeAhead,
    preloadAhead,
    revokeIfBlob,
  });

  const { sequenceMediaElement } = usePreviewSequenceMediaSource({
    usesSequenceController,
    items,
    currentIndex: sequenceCurrentIndex,
    videoObjectUrl,
    setSequenceSource,
    sequenceTick,
    sequenceGoToNext,
    previewSequenceItemByIndex,
    getSequenceLiveAbsoluteTime,
    showMiniToast,
    videoRef,
  });

  usePreviewSequenceAudio({
    isSingleMode,
    itemsLength: items.length,
    absoluteTime: sequenceAbsoluteTime,
    isPlaying: sequenceIsPlaying,
    isBuffering: sequenceIsBuffering,
    previewAudioPlan,
    globalMuted,
    globalVolume,
  });

  return {
    checkBufferStatus,
    sequenceMediaElement,
  };
}
