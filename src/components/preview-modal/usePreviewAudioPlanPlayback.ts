import { useCallback, useEffect, useRef } from 'react';
import type { ExportAudioPlan, ExportAudioEvent } from '../../utils/exportAudioPlan';
import { AudioManager } from '../../utils/audioUtils';

interface UsePreviewAudioPlanPlaybackInput {
  enabled: boolean;
  absoluteTime: number;
  getLiveAbsoluteTime?: () => number;
  isPlaying: boolean;
  isBuffering: boolean;
  previewAudioPlan: ExportAudioPlan;
  globalMuted: boolean;
  globalVolume: number;
}

function normalizeSeconds(value: number | undefined, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return value as number;
}

function buildPreviewAudioEventKey(event: ExportAudioEvent) {
  return [
    event.sourceType,
    event.assetId || '',
    event.sceneId || '',
    event.groupId || '',
    event.cutId || '',
    event.sourcePath,
    normalizeSeconds(event.sourceStartSec, 0).toFixed(3),
    normalizeSeconds(event.sourceOffsetSec, 0).toFixed(3),
  ].join('|');
}

export function usePreviewAudioPlanPlayback({
  enabled,
  absoluteTime,
  getLiveAbsoluteTime,
  isPlaying,
  isBuffering,
  previewAudioPlan,
  globalMuted,
  globalVolume,
}: UsePreviewAudioPlanPlaybackInput) {
  const audioManagersRef = useRef<Map<string, AudioManager>>(new Map());
  const audioLoadIdsRef = useRef<Map<string, number>>(new Map());

  const disposeManagers = useCallback(() => {
    for (const manager of audioManagersRef.current.values()) {
      manager.pause();
      manager.unload();
      manager.dispose();
    }
    audioManagersRef.current.clear();
    audioLoadIdsRef.current.clear();
  }, []);

  const syncPlayback = useCallback((nextAbsoluteTime: number) => {
    if (!enabled || previewAudioPlan.events.length === 0) {
      disposeManagers();
      return;
    }

    const clampedAbsoluteTime = Math.max(0, nextAbsoluteTime);
    const activeEntries = previewAudioPlan.events
      .map((event) => ({ event, key: buildPreviewAudioEventKey(event) }))
      .filter(({ event }) => {
        const start = normalizeSeconds(event.timelineStartSec, 0);
        const end = start + Math.max(0, normalizeSeconds(event.durationSec, 0));
        return clampedAbsoluteTime >= start && clampedAbsoluteTime < end;
      });
    const activeKeys = new Set(activeEntries.map((entry) => entry.key));

    for (const [key, manager] of audioManagersRef.current.entries()) {
      if (activeKeys.has(key)) continue;
      manager.stop();
      manager.unload();
      manager.dispose();
      audioManagersRef.current.delete(key);
      audioLoadIdsRef.current.delete(key);
    }

    for (const { event, key } of activeEntries) {
      const sourcePath = event.sourcePath;
      if (!sourcePath) continue;

      let manager = audioManagersRef.current.get(key);
      if (!manager || manager.isDisposed()) {
        manager = new AudioManager();
        audioManagersRef.current.set(key, manager);
        audioLoadIdsRef.current.set(key, manager.getLoadId());
      }

      const gain = Number.isFinite(event.gain) ? Math.max(0, event.gain as number) : 1;
      const mixedVolume = Math.max(0, Math.min(1, (globalMuted ? 0 : globalVolume) * gain));
      manager.setVolume(mixedVolume);

      const shouldPlayEvent = isPlaying && (!isBuffering || event.sourceType !== 'video');
      const sourceBaseSec = normalizeSeconds(event.sourceStartSec, 0) + normalizeSeconds(event.sourceOffsetSec, 0);
      const playPosition = Math.max(0, clampedAbsoluteTime - normalizeSeconds(event.timelineStartSec, 0) + sourceBaseSec);

      if (!manager.isLoaded()) {
        const startLoadId = manager.getLoadId() + 1;
        audioLoadIdsRef.current.set(key, startLoadId);
        void manager.load(sourcePath).then((loaded) => {
          const expectedLoadId = audioLoadIdsRef.current.get(key);
          if (!loaded || expectedLoadId !== startLoadId) return;
          if (!audioManagersRef.current.has(key)) return;
          if (!shouldPlayEvent) return;
          manager!.play(playPosition);
        });
        continue;
      }

      if (!shouldPlayEvent) {
        if (manager.getIsPlaying()) {
          manager.pause();
        }
        continue;
      }

      if (!manager.getIsPlaying()) {
        manager.play(playPosition);
      } else {
        const currentTime = manager.getCurrentTime();
        const lag = playPosition - currentTime;
        if (lag > 0.5) {
          manager.seek(playPosition);
        }
      }
    }
  }, [
    enabled,
    isPlaying,
    isBuffering,
    previewAudioPlan,
    globalMuted,
    globalVolume,
    disposeManagers,
  ]);

  useEffect(() => {
    return () => {
      disposeManagers();
    };
  }, [disposeManagers]);

  useEffect(() => {
    syncPlayback(absoluteTime);
  }, [absoluteTime, syncPlayback]);

  useEffect(() => {
    if (!enabled || !isPlaying || !getLiveAbsoluteTime) return;

    let rafId = 0;
    const update = () => {
      syncPlayback(getLiveAbsoluteTime());
      rafId = window.requestAnimationFrame(update);
    };

    rafId = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(rafId);
  }, [enabled, getLiveAbsoluteTime, isPlaying, syncPlayback]);
}
