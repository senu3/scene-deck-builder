import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { getAssetThumbnail } from '../../features/thumbnails/api';
import type { ExportSequenceItem } from '../../utils/exportSequence';
import {
  createImageMediaSource,
  createLipSyncImageMediaSource,
  createVideoHoldMediaSource,
  createVideoMediaSource,
  type MediaSource,
} from '../../utils/previewMedia';
import type { PreviewSequencePlaybackItem } from './types';

interface UsePreviewSequenceMediaSourceInput {
  usesSequenceController: boolean;
  items: PreviewSequencePlaybackItem[];
  currentIndex: number;
  videoObjectUrl: { assetId: string; url: string } | null;
  setSequenceSource: (source: MediaSource | null) => void;
  sequenceTick: (localTime: number) => void;
  sequenceGoToNext: (fromIndex?: number) => void;
  previewSequenceItemByIndex: Map<number, ExportSequenceItem>;
  getSequenceLiveAbsoluteTime: () => number;
  showMiniToast: (message: string, variant?: 'success' | 'info' | 'warning' | 'error') => void;
  videoRef: React.RefObject<HTMLVideoElement>;
}

export function usePreviewSequenceMediaSource({
  usesSequenceController,
  items,
  currentIndex,
  videoObjectUrl,
  setSequenceSource,
  sequenceTick,
  sequenceGoToNext,
  previewSequenceItemByIndex,
  getSequenceLiveAbsoluteTime,
  showMiniToast,
  videoRef,
}: UsePreviewSequenceMediaSourceInput) {
  const [sequenceMediaElement, setSequenceMediaElement] = useState<JSX.Element | null>(null);
  const lipSyncToastShownRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!usesSequenceController) {
      setSequenceSource(null);
      setSequenceMediaElement(null);
      return;
    }

    setSequenceSource(null);
    setSequenceMediaElement(null);

    const currentItem = items[currentIndex];
    if (!currentItem) return;

    const currentSpec = previewSequenceItemByIndex.get(currentIndex);
    if (currentSpec?.lipSync) {
      let isActive = true;
      const loadLipSyncSources = async () => {
        const sources: string[] = [];
        for (const framePath of currentSpec.lipSync!.framePaths) {
          let src = '';
          try {
            const thumb = await getAssetThumbnail('sequence-preview', {
              path: framePath,
              type: 'image',
            });
            if (thumb) src = thumb;
          } catch {
            // ignore
          }
          sources.push(src);
        }

        const baseFallback = sources[0] || currentItem.thumbnail || '';
        const resolvedSources = sources.map((src) => src || baseFallback);

        if (!currentSpec.lipSync!.rms?.length) {
          if (!lipSyncToastShownRef.current.has(currentItem.assetId)) {
            lipSyncToastShownRef.current.add(currentItem.assetId);
            showMiniToast('Lip sync RMS not available', 'warning');
          }
          const fallbackSource = createImageMediaSource({
            src: baseFallback,
            alt: `${currentItem.sceneName} - Cut ${currentItem.cutIndex + 1}`,
            className: 'preview-media',
            duration: currentSpec.duration,
            onTimeUpdate: sequenceTick,
            onEnded: () => sequenceGoToNext(currentIndex),
          });
          if (!isActive) return;
          setSequenceSource(fallbackSource);
          setSequenceMediaElement(fallbackSource.element);
          return;
        }

        const lipSyncSource = createLipSyncImageMediaSource({
          sources: resolvedSources,
          alt: `${currentItem.sceneName} - Cut ${currentItem.cutIndex + 1}`,
          className: 'preview-media',
          duration: currentSpec.duration,
          rms: currentSpec.lipSync!.rms,
          rmsFps: currentSpec.lipSync!.rmsFps,
          thresholds: currentSpec.lipSync!.thresholds,
          getAbsoluteTime: getSequenceLiveAbsoluteTime,
          audioOffsetSec: currentSpec.lipSync!.audioOffsetSec,
          onTimeUpdate: sequenceTick,
          onEnded: () => sequenceGoToNext(currentIndex),
        });

        if (!isActive) return;
        setSequenceSource(lipSyncSource);
        setSequenceMediaElement(lipSyncSource.element);
      };

      void loadLipSyncSources();
      return () => {
        isActive = false;
      };
    }

    if (currentItem.assetType === 'video') {
      if (!videoObjectUrl || videoObjectUrl.assetId !== currentItem.assetId) {
        return;
      }

      if (currentItem.isHold) {
        const holdSourceKey = `${currentItem.cutId}:${videoObjectUrl.url}:hold:${currentItem.srcInSec}:${currentItem.normalizedDisplayTime}`;
        const holdSource = createVideoHoldMediaSource({
          src: videoObjectUrl.url,
          key: holdSourceKey,
          className: 'preview-media',
          muted: true,
          refObject: videoRef,
          frameTimeSec: currentItem.srcOutSec,
          duration: currentItem.normalizedDisplayTime,
          onTimeUpdate: sequenceTick,
          onEnded: () => sequenceGoToNext(currentIndex),
        });
        setSequenceSource(holdSource);
        setSequenceMediaElement(holdSource.element);
        return;
      }

      const videoSourceKey = `${currentItem.cutId}:${videoObjectUrl.url}:${currentItem.srcInSec}:${currentItem.srcOutSec}`;
      const source = createVideoMediaSource({
        src: videoObjectUrl.url,
        key: videoSourceKey,
        className: 'preview-media',
        muted: true,
        refObject: videoRef,
        inPoint: currentItem.srcInSec,
        outPoint: currentItem.srcOutSec,
        onTimeUpdate: sequenceTick,
        onEnded: () => sequenceGoToNext(currentIndex),
      });
      setSequenceSource(source);
      setSequenceMediaElement(source.element);
      return;
    }

    if (currentItem.assetType === 'image' && currentItem.thumbnail) {
      const source = createImageMediaSource({
        src: currentItem.thumbnail,
        alt: `${currentItem.sceneName} - Cut ${currentItem.cutIndex + 1}`,
        className: 'preview-media',
        duration: currentItem.normalizedDisplayTime,
        onTimeUpdate: sequenceTick,
        onEnded: () => sequenceGoToNext(currentIndex),
      });
      setSequenceSource(source);
      setSequenceMediaElement(source.element);
    }
  }, [
    usesSequenceController,
    items,
    currentIndex,
    videoObjectUrl,
    setSequenceSource,
    sequenceTick,
    sequenceGoToNext,
    previewSequenceItemByIndex,
    getSequenceLiveAbsoluteTime,
    showMiniToast,
    videoRef,
  ]);

  return {
    sequenceMediaElement,
  };
}
