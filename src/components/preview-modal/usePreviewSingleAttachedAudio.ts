import { useCallback, useMemo } from 'react';
import type React from 'react';
import type { ExportAudioPlan } from '../../utils/exportAudioPlan';
import { usePreviewAudioPlanPlayback } from './usePreviewAudioPlanPlayback';

interface UsePreviewSingleAttachedAudioInput {
  isSingleMode: boolean;
  isSingleModeVideo: boolean;
  hasCutContext: boolean;
  assetId: string | undefined;
  previewAudioPlan: ExportAudioPlan;
  inPoint: number | null;
  outPoint: number | null;
  singleModeIsPlaying: boolean;
  singleModeCurrentTime: number;
  videoRef: React.RefObject<HTMLVideoElement>;
  sequenceIsPlaying: boolean;
  sequenceIsBuffering: boolean;
  sequenceAbsoluteTime: number;
  globalMuted: boolean;
  globalVolume: number;
}

export function usePreviewSingleAttachedAudio({
  isSingleMode,
  isSingleModeVideo,
  hasCutContext,
  assetId,
  previewAudioPlan,
  inPoint,
  outPoint,
  singleModeIsPlaying,
  singleModeCurrentTime,
  videoRef,
  sequenceIsPlaying,
  sequenceIsBuffering,
  sequenceAbsoluteTime,
  globalMuted,
  globalVolume,
}: UsePreviewSingleAttachedAudioInput) {
  const clipStartSec = useMemo(() => {
    const clipStart = inPoint !== null
      ? Math.min(inPoint, outPoint ?? inPoint)
      : 0;
    return Math.max(0, clipStart);
  }, [inPoint, outPoint]);

  const singleModePreviewTime = useMemo(() => {
    if (!isSingleModeVideo) {
      return Math.max(0, sequenceAbsoluteTime);
    }
    return Math.max(0, singleModeCurrentTime - clipStartSec);
  }, [clipStartSec, isSingleModeVideo, sequenceAbsoluteTime, singleModeCurrentTime]);

  const getLiveAbsoluteTime = useCallback(() => {
    if (!isSingleModeVideo) {
      return Math.max(0, sequenceAbsoluteTime);
    }
    const liveCurrentTime = videoRef.current?.currentTime ?? singleModeCurrentTime;
    return Math.max(0, liveCurrentTime - clipStartSec);
  }, [clipStartSec, isSingleModeVideo, sequenceAbsoluteTime, singleModeCurrentTime, videoRef]);

  usePreviewAudioPlanPlayback({
    enabled: isSingleMode && !!assetId && hasCutContext,
    absoluteTime: singleModePreviewTime,
    getLiveAbsoluteTime: isSingleModeVideo ? getLiveAbsoluteTime : undefined,
    isPlaying: isSingleModeVideo ? singleModeIsPlaying : sequenceIsPlaying,
    isBuffering: isSingleModeVideo ? false : sequenceIsBuffering,
    previewAudioPlan,
    globalMuted,
    globalVolume,
  });
}
