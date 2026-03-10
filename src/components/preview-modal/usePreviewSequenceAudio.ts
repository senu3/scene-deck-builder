import type { ExportAudioPlan } from '../../utils/exportAudioPlan';
import { usePreviewAudioPlanPlayback } from './usePreviewAudioPlanPlayback';

interface UsePreviewSequenceAudioInput {
  isSingleMode: boolean;
  itemsLength: number;
  absoluteTime: number;
  isPlaying: boolean;
  isBuffering: boolean;
  previewAudioPlan: ExportAudioPlan;
  globalMuted: boolean;
  globalVolume: number;
}

export function usePreviewSequenceAudio({
  isSingleMode,
  itemsLength,
  absoluteTime,
  isPlaying,
  isBuffering,
  previewAudioPlan,
  globalMuted,
  globalVolume,
}: UsePreviewSequenceAudioInput) {
  usePreviewAudioPlanPlayback({
    enabled: !isSingleMode && itemsLength > 0,
    absoluteTime,
    isPlaying,
    isBuffering,
    previewAudioPlan,
    globalMuted,
    globalVolume,
  });
}
