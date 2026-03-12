import { useEffect, useMemo } from 'react';
import type { Asset, Cut } from '../../types';
import type { ExportSequenceItem } from '../../utils/exportSequence';
import { EXPORT_FRAMING_DEFAULTS } from '../../constants/framing';
import { buildPreviewViewportFramingStyle, buildPreviewViewportFramingStyleFromResolved } from '../../utils/previewFraming';
import { useAssetMetadataHydration } from '../../features/metadata/useAssetMetadataHydration';
import type { PreviewItem, ResolutionPreset } from './types';

interface UsePreviewSharedViewStateInput {
  isSingleMode: boolean;
  isSingleModeVideo: boolean;
  usesSequenceController: boolean;
  isDragging: boolean;
  items: PreviewItem[];
  currentIndex: number;
  sequenceCurrentIndex: number;
  sequenceTotalDuration: number;
  getSequenceGlobalProgress: () => number;
  getSequenceAbsoluteTime: () => number;
  getSequenceLiveAbsoluteTime: () => number;
  sequenceIsPlaying: boolean;
  singleModeIsPlaying: boolean;
  singleModeDuration: number;
  singleModeCurrentTime: number;
  asset: Asset | undefined;
  cacheAsset?: (asset: Asset) => void;
  focusCut: Cut | null;
  previewSequenceItemByCutId: Map<string, ExportSequenceItem>;
  resolveAssetForCut: (cut: Cut | null | undefined) => Asset | null;
  selectedResolution: ResolutionPreset;
  globalVolume: number;
  shouldMuteEmbeddedAudio: (cut: Cut | null | undefined) => boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
  progressFillRef: React.RefObject<HTMLDivElement>;
  progressHandleRef: React.RefObject<HTMLDivElement>;
}

export function usePreviewSharedViewState({
  isSingleMode,
  isSingleModeVideo,
  usesSequenceController,
  isDragging,
  items,
  currentIndex,
  sequenceCurrentIndex,
  sequenceTotalDuration,
  getSequenceGlobalProgress,
  getSequenceAbsoluteTime,
  getSequenceLiveAbsoluteTime,
  sequenceIsPlaying,
  singleModeIsPlaying,
  singleModeDuration,
  singleModeCurrentTime,
  asset,
  cacheAsset,
  focusCut,
  previewSequenceItemByCutId,
  resolveAssetForCut,
  selectedResolution,
  globalVolume,
  shouldMuteEmbeddedAudio,
  videoRef,
  progressFillRef,
  progressHandleRef,
}: UsePreviewSharedViewStateInput) {
  const currentItem = items[currentIndex];
  const globalProgress = isSingleMode ? 0 : getSequenceGlobalProgress();
  const resolvedSequenceTotalDuration = isSingleMode ? 0 : sequenceTotalDuration;
  const sequenceCurrentTime = isSingleMode ? 0 : getSequenceAbsoluteTime();
  const singleModePlaybackDuration = isSingleModeVideo ? singleModeDuration : sequenceTotalDuration;
  const singleModePlaybackTime = isSingleModeVideo ? singleModeCurrentTime : getSequenceAbsoluteTime();
  const resolutionTargetAsset = isSingleMode ? (asset ?? null) : resolveAssetForCut(currentItem?.cut);
  const { asset: hydratedResolutionAsset } = useAssetMetadataHydration({
    asset: resolutionTargetAsset,
    requirements: resolutionTargetAsset?.type === 'video' || resolutionTargetAsset?.type === 'image'
      ? { dimensions: true }
      : {},
    cacheAsset,
  });

  const previewResolutionLabel = useMemo(() => {
    const width = hydratedResolutionAsset?.metadata?.width;
    const height = hydratedResolutionAsset?.metadata?.height;
    if (typeof width === 'number' && typeof height === 'number') {
      return `${width}×${height}`;
    }
    return null;
  }, [hydratedResolutionAsset?.metadata?.width, hydratedResolutionAsset?.metadata?.height]);

  const currentFraming = useMemo(() => {
    const targetCut = isSingleMode ? focusCut : currentItem?.cut;
    if (targetCut) {
      const fromSequenceSpec = previewSequenceItemByCutId.get(targetCut.id);
      if (fromSequenceSpec) {
        return buildPreviewViewportFramingStyleFromResolved(
          fromSequenceSpec.framingMode,
          fromSequenceSpec.framingAnchor
        );
      }
    }
    return buildPreviewViewportFramingStyle(targetCut?.framing, EXPORT_FRAMING_DEFAULTS);
  }, [isSingleMode, focusCut, currentItem?.cut, previewSequenceItemByCutId]);

  const singleModeProgressPercent = singleModePlaybackDuration > 0
    ? (singleModePlaybackTime / singleModePlaybackDuration) * 100
    : 0;
  const progressPercent = isSingleMode ? singleModeProgressPercent : globalProgress;
  const isFreeResolution = selectedResolution.width === 0;
  const previewDisplayClassName = isFreeResolution
    ? 'preview-display'
    : 'preview-display preview-display--expanded';

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.volume = globalVolume;
    const activeCut = isSingleMode
      ? (focusCut ?? null)
      : (items[sequenceCurrentIndex]?.cut ?? null);
    videoRef.current.muted = isSingleMode ? shouldMuteEmbeddedAudio(activeCut) : true;
  }, [
    videoRef,
    globalVolume,
    isSingleMode,
    focusCut,
    items,
    sequenceCurrentIndex,
    shouldMuteEmbeddedAudio,
  ]);

  useEffect(() => {
    if (progressFillRef.current) {
      progressFillRef.current.style.width = `${progressPercent}%`;
    }
    if (progressHandleRef.current) {
      progressHandleRef.current.style.left = `${progressPercent}%`;
    }
  }, [progressFillRef, progressHandleRef, progressPercent]);

  useEffect(() => {
    if (!usesSequenceController || !sequenceIsPlaying || isDragging) return;

    let rafId = 0;
    const update = () => {
      const totalDuration = sequenceTotalDuration;
      if (totalDuration > 0) {
        const liveTime = getSequenceLiveAbsoluteTime();
        const percent = Math.max(0, Math.min(100, (liveTime / totalDuration) * 100));
        if (progressFillRef.current) {
          progressFillRef.current.style.width = `${percent}%`;
        }
        if (progressHandleRef.current) {
          progressHandleRef.current.style.left = `${percent}%`;
        }
      }
      rafId = window.requestAnimationFrame(update);
    };

    rafId = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(rafId);
  }, [
    usesSequenceController,
    sequenceIsPlaying,
    sequenceTotalDuration,
    isDragging,
    getSequenceLiveAbsoluteTime,
    progressFillRef,
    progressHandleRef,
  ]);

  useEffect(() => {
    if (!isSingleModeVideo || !singleModeIsPlaying || isDragging) return;

    let rafId = 0;
    const update = () => {
      const duration = singleModeDuration;
      const liveTime = videoRef.current?.currentTime ?? singleModeCurrentTime;
      const percent = duration > 0
        ? Math.max(0, Math.min(100, (liveTime / duration) * 100))
        : 0;
      if (progressFillRef.current) {
        progressFillRef.current.style.width = `${percent}%`;
      }
      if (progressHandleRef.current) {
        progressHandleRef.current.style.left = `${percent}%`;
      }
      rafId = window.requestAnimationFrame(update);
    };

    rafId = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(rafId);
  }, [
    isSingleModeVideo,
    singleModeIsPlaying,
    isDragging,
    singleModeDuration,
    singleModeCurrentTime,
    videoRef,
    progressFillRef,
    progressHandleRef,
  ]);

  return {
    currentItem,
    globalProgress,
    sequenceTotalDuration: resolvedSequenceTotalDuration,
    sequenceCurrentTime,
    singleModePlaybackDuration,
    singleModePlaybackTime,
    previewResolutionLabel,
    currentFraming,
    singleModeProgressPercent,
    previewDisplayClassName,
  };
}
