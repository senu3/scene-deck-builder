import { useMemo } from 'react';
import type { Scene } from '../types';
import { formatTimeCode } from '../hooks/useStoryTimelinePosition';
import styles from './SceneDurationBar.module.css';

// Scene color palette - cycles through for each scene
const SCENE_COLORS = [
  'var(--timeline-scene-1)',  // blue
  'var(--timeline-scene-2)',  // purple
  'var(--timeline-scene-3)',  // pink
  'var(--timeline-scene-4)',  // green
  'var(--timeline-scene-5)',  // audio purple
];

const getSceneColor = (index: number) => SCENE_COLORS[index % SCENE_COLORS.length];

interface SceneDurationBarProps {
  scenes: Scene[];
  selectedSceneId: string | null;
  onSelectScene: (sceneId: string) => void;
}

export default function SceneDurationBar({ scenes, selectedSceneId, onSelectScene }: SceneDurationBarProps) {
  const sceneDurations = useMemo(
    () =>
      scenes.map((scene) =>
        scene.cuts.reduce((acc, cut) => acc + (isFinite(cut.displayTime) ? cut.displayTime : 0), 0)
      ),
    [scenes]
  );

  const segmentWeights = useMemo(
    () =>
      sceneDurations.map((duration) => (duration > 0 ? duration : 1)),
    [sceneDurations]
  );

  if (scenes.length === 0) {
    return (
      <div className={styles.timelineBar} aria-label="Scene duration bar">
        <div className={styles.empty}>No scenes</div>
      </div>
    );
  }

  return (
    <div className={styles.timelineBar} role="list" aria-label="Scene duration bar">
      {scenes.map((scene, index) => {
        const duration = sceneDurations[index];
        const isSelected = selectedSceneId === scene.id;
        const sceneColor = getSceneColor(index);
        const title = `${scene.name} • ${formatTimeCode(duration)} • ${scene.cuts.length} cuts`;

        return (
          <button
            key={scene.id}
            className={`${styles.segment} ${isSelected ? styles.segmentSelected : ''}`}
            style={{
              flexGrow: segmentWeights[index],
              '--scene-color': sceneColor,
            } as React.CSSProperties}
            onClick={() => onSelectScene(scene.id)}
            title={title}
            aria-pressed={isSelected}
            type="button"
          >
            <span className={styles.segmentLabel}>{scene.name}</span>
          </button>
        );
      })}
    </div>
  );
}
