import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { computeStoryTimings } from '../utils/storyTiming';

export interface StoryTimelinePosition {
  /** Current position in seconds (start of selected scene/cut) */
  currentPosition: number;
  /** Total duration in seconds */
  totalDuration: number;
  /** Whether any scene or cut is selected */
  hasSelection: boolean;
  /** Scene count */
  sceneCount: number;
  /** Total cut count */
  cutCount: number;
}

/**
 * Hook to calculate the timeline position of the currently selected scene/cut.
 * Returns the position as the start time of the selected item in the overall timeline.
 */
export function useStoryTimelinePosition(): StoryTimelinePosition {
  const { scenes, sceneOrder, selectedSceneId, selectedCutId } = useStore();

  return useMemo(() => {
    const timings = computeStoryTimings(scenes, sceneOrder);
    const cutCount = timings.cutTimings.size;
    let currentPosition = 0;
    let hasSelection = false;

    if (selectedCutId) {
      const cutTiming = timings.cutTimings.get(selectedCutId);
      if (cutTiming) {
        currentPosition = cutTiming.startSec;
        hasSelection = true;
      }
    } else if (selectedSceneId) {
      const sceneTiming = timings.sceneTimings.get(selectedSceneId);
      if (sceneTiming) {
        currentPosition = sceneTiming.startSec;
        hasSelection = true;
      }
    }

    return {
      currentPosition,
      totalDuration: timings.totalDurationSec,
      hasSelection,
      sceneCount: scenes.length,
      cutCount,
    };
  }, [scenes, sceneOrder, selectedSceneId, selectedCutId]);
}

/**
 * Format time as M:SS.d (minutes:seconds.decisecond)
 */
export function formatTimeCode(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '--';

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const decisecond = Math.floor((secs % 1) * 10);
  const wholeSecs = Math.floor(secs);

  return `${minutes}:${wholeSecs.toString().padStart(2, '0')}.${decisecond}`;
}
