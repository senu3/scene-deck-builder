import { useEffect, useMemo, useState } from 'react';
import type { Scene } from '../types';
import { formatTimeCode } from '../hooks/useStoryTimelinePosition';
import {
  getDurationTargetSettings,
  saveDurationTargetSettings,
  DURATION_TARGET_SETTINGS_CHANGED_EVENT,
  type SceneDurationBarMode,
} from '../utils/durationTarget';
import styles from './SceneDurationBar.module.css';

const SCENE_COLORS = [
  'var(--timeline-scene-1)',
  'var(--timeline-scene-2)',
  'var(--timeline-scene-3)',
  'var(--timeline-scene-4)',
  'var(--timeline-scene-5)',
];

const getSceneColor = (index: number) => SCENE_COLORS[index % SCENE_COLORS.length];

interface SceneDurationBarProps {
  scenes: Scene[];
  selectedSceneId: string | null;
  onSelectScene: (sceneId: string) => void;
  targetSec?: number;
}

export default function SceneDurationBar({
  scenes,
  selectedSceneId,
  onSelectScene,
  targetSec,
}: SceneDurationBarProps) {
  const [mode, setMode] = useState<SceneDurationBarMode>(() => getDurationTargetSettings().sceneDurationBarMode);

  const sceneDurations = useMemo(
    () =>
      scenes.map((scene) =>
        scene.cuts.reduce((acc, cut) => acc + (isFinite(cut.displayTime) ? cut.displayTime : 0), 0)
      ),
    [scenes]
  );

  const totalSec = useMemo(
    () => sceneDurations.reduce((acc, duration) => acc + duration, 0),
    [sceneDurations]
  );

  const safeTargetSec = Number.isFinite(targetSec) && (targetSec as number) > 0 ? (targetSec as number) : undefined;
  const canToggleMode = !!safeTargetSec;
  const effectiveMode = canToggleMode ? mode : 'relative';

  const relativeWeights = useMemo(
    () => sceneDurations.map((duration) => (duration > 0 ? duration : 1)),
    [sceneDurations]
  );

  const targetSceneRatios = useMemo(() => {
    if (!safeTargetSec) return [];
    return sceneDurations.map((duration) => Math.max(duration, 0) / safeTargetSec);
  }, [safeTargetSec, sceneDurations]);

  const remainingSec = safeTargetSec ? Math.max(safeTargetSec - totalSec, 0) : 0;
  const overSec = safeTargetSec ? Math.max(totalSec - safeTargetSec, 0) : 0;
  const overRatioCapped = safeTargetSec ? Math.min(overSec / safeTargetSec, 0.25) : 0;
  const remainingRatio = safeTargetSec ? remainingSec / safeTargetSec : 0;

  const handleToggleMode = () => {
    if (!canToggleMode) return;
    const next: SceneDurationBarMode = effectiveMode === 'relative' ? 'target' : 'relative';
    setMode(next);
    saveDurationTargetSettings({ sceneDurationBarMode: next });
  };

  useEffect(() => {
    const syncMode = () => {
      setMode(getDurationTargetSettings().sceneDurationBarMode);
    };
    window.addEventListener(DURATION_TARGET_SETTINGS_CHANGED_EVENT, syncMode);
    return () => window.removeEventListener(DURATION_TARGET_SETTINGS_CHANGED_EVENT, syncMode);
  }, []);

  if (scenes.length === 0) {
    return (
      <div className={styles.timelineBar} aria-label="Scene duration bar">
        <div className={styles.empty}>No scenes</div>
      </div>
    );
  }

  return (
    <div className={styles.timelineWrap}>
      <div
        className={styles.timelineBar}
        role="list"
        aria-label="Scene duration bar"
        data-mode={effectiveMode}
        data-over={overSec > 0 ? 'true' : 'false'}
      >
        {scenes.map((scene, index) => {
          const duration = sceneDurations[index];
          const isSelected = selectedSceneId === scene.id;
          const sceneColor = getSceneColor(index);
          const targetRatio = safeTargetSec ? (duration / safeTargetSec) * 100 : 0;
          const title = effectiveMode === 'target' && safeTargetSec
            ? `${scene.name} • ${formatTimeCode(duration)} (${targetRatio.toFixed(1)}%)`
            : `${scene.name} • ${formatTimeCode(duration)} • ${scene.cuts.length} cuts`;

          return (
            <button
              key={scene.id}
              className={`${styles.segment} ${isSelected ? styles.segmentSelected : ''}`}
              style={{
                flexGrow: effectiveMode === 'target' ? Math.max(targetSceneRatios[index] || 0, 0.0001) : relativeWeights[index],
                '--scene-color': sceneColor,
              } as React.CSSProperties}
              onClick={() => onSelectScene(scene.id)}
              title={title}
              aria-pressed={isSelected}
              type="button"
              data-kind="scene"
              data-ratio={effectiveMode === 'target' ? (targetSceneRatios[index] || 0).toFixed(4) : undefined}
            >
              <span className={styles.segmentLabel}>{scene.name}</span>
            </button>
          );
        })}

        {effectiveMode === 'target' && safeTargetSec && overSec <= 0 && remainingSec > 0 && (
          <div
            className={`${styles.segment} ${styles.remainingSegment}`}
            style={{ flexGrow: Math.max(remainingRatio, 0.0001) }}
            title={`Remaining ${formatTimeCode(remainingSec)}`}
            aria-label={`Remaining ${formatTimeCode(remainingSec)}`}
            data-kind="remaining"
            data-ratio={remainingRatio.toFixed(4)}
          />
        )}

        {effectiveMode === 'target' && safeTargetSec && overSec > 0 && (
          <div
            className={`${styles.segment} ${styles.overSegment}`}
            style={{ flexGrow: Math.max(overRatioCapped, 0.0001) }}
            title={`Over +${formatTimeCode(overSec)} (display capped at 25%)`}
            aria-label={`Over +${formatTimeCode(overSec)}`}
            data-kind="over"
            data-ratio={overRatioCapped.toFixed(4)}
          />
        )}
      </div>

      {canToggleMode && (
        <button
          type="button"
          className={styles.modeToggle}
          onClick={handleToggleMode}
          title={effectiveMode === 'relative' ? 'Relative mode (current)' : 'Target mode (current)'}
          aria-label={effectiveMode === 'relative' ? 'Switch to target mode' : 'Switch to relative mode'}
          data-mode={effectiveMode}
        >
          {effectiveMode === 'relative' ? '⇄' : '⌖'}
        </button>
      )}
    </div>
  );
}
