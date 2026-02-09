import { useMemo } from 'react';
import { useStore } from '../store/useStore';

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
  const { scenes, selectedSceneId, selectedCutId } = useStore();

  return useMemo(() => {
    let totalDuration = 0;
    let cutCount = 0;
    let currentPosition = 0;
    let hasSelection = false;

    // Calculate total duration and find position of selected item
    for (const scene of scenes) {
      let sceneStartTime = totalDuration;

      for (let i = 0; i < scene.cuts.length; i++) {
        const cut = scene.cuts[i];
        const cutStartTime = totalDuration;

        // Check if this cut is selected
        if (selectedCutId && cut.id === selectedCutId) {
          currentPosition = cutStartTime;
          hasSelection = true;
        }

        totalDuration += cut.displayTime;
        cutCount++;
      }

      // Check if this scene is selected (but no specific cut)
      if (!selectedCutId && selectedSceneId && scene.id === selectedSceneId) {
        currentPosition = sceneStartTime;
        hasSelection = true;
      }
    }

    return {
      currentPosition,
      totalDuration,
      hasSelection,
      sceneCount: scenes.length,
      cutCount,
    };
  }, [scenes, selectedSceneId, selectedCutId]);
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
