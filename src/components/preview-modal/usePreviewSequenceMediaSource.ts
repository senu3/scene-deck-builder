import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import type { Asset, Cut } from '../../types';
import { getAssetThumbnail } from '../../features/thumbnails/api';
import type { ExportSequenceItem } from '../../utils/exportSequence';
import {
  createImageMediaSource,
  createLipSyncImageMediaSource,
  createVideoMediaSource,
  type MediaSource,
} from '../../utils/previewMedia';

interface UsePreviewSequenceMediaSourceInput {
  usesSequenceController: boolean;
  items: Array<{
    cut: Cut;
    sceneName: string;
    cutIndex: number;
    normalizedDisplayTime: number;
    thumbnail: string | null;
  }>;
  currentIndex: number;
  videoObjectUrl: { assetId: string; url: string } | null;
  setSequenceSource: (source: MediaSource | null) => void;
  sequenceTick: (localTime: number) => void;
  sequenceGoToNext: () => void;
  previewSequenceItemByCutId: Map<string, ExportSequenceItem>;
  getSequenceLiveAbsoluteTime: () => number;
  showMiniToast: (message: string, variant?: 'success' | 'info' | 'warning' | 'error') => void;
  resolveAssetForCut: (cut: Cut | null | undefined) => Asset | null;
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
  previewSequenceItemByCutId,
  getSequenceLiveAbsoluteTime,
  showMiniToast,
  resolveAssetForCut,
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
    const asset = resolveAssetForCut(currentItem?.cut);
    if (!currentItem || !asset) return;

    const currentSpec = previewSequenceItemByCutId.get(currentItem.cut.id);
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
          if (!lipSyncToastShownRef.current.has(asset.id)) {
            lipSyncToastShownRef.current.add(asset.id);
            showMiniToast('Lip sync RMS not available', 'warning');
          }
          const fallbackSource = createImageMediaSource({
            src: baseFallback,
            alt: `${currentItem.sceneName} - Cut ${currentItem.cutIndex + 1}`,
            className: 'preview-media',
            duration: currentSpec.duration,
            onTimeUpdate: sequenceTick,
            onEnded: sequenceGoToNext,
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
          onEnded: sequenceGoToNext,
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

    if (asset.type === 'video') {
      const assetId = asset.id ?? currentItem.cut.assetId ?? null;
      if (!videoObjectUrl || !assetId || videoObjectUrl.assetId !== assetId) {
        return;
      }

      const clipInPoint = currentItem.cut.isClip && currentItem.cut.inPoint !== undefined
        ? currentSpec?.inPoint ?? currentItem.cut.inPoint
        : 0;
      const clipOutPoint = currentItem.cut.isClip && currentItem.cut.outPoint !== undefined
        ? currentSpec?.outPoint ?? currentItem.cut.outPoint
        : undefined;

      const videoSourceKey = `${currentItem.cut.id}:${videoObjectUrl.url}:${clipInPoint}:${clipOutPoint ?? 'end'}`;
      const source = createVideoMediaSource({
        src: videoObjectUrl.url,
        key: videoSourceKey,
        className: 'preview-media',
        muted: true,
        refObject: videoRef,
        inPoint: clipInPoint,
        outPoint: clipOutPoint,
        onTimeUpdate: sequenceTick,
        onEnded: sequenceGoToNext,
      });
      setSequenceSource(source);
      setSequenceMediaElement(source.element);
      return;
    }

    if (asset.type === 'image' && currentItem.thumbnail) {
      const source = createImageMediaSource({
        src: currentItem.thumbnail,
        alt: `${currentItem.sceneName} - Cut ${currentItem.cutIndex + 1}`,
        className: 'preview-media',
        duration: currentItem.normalizedDisplayTime,
        onTimeUpdate: sequenceTick,
        onEnded: sequenceGoToNext,
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
    previewSequenceItemByCutId,
    getSequenceLiveAbsoluteTime,
    showMiniToast,
    resolveAssetForCut,
    videoRef,
  ]);

  return {
    sequenceMediaElement,
  };
}
