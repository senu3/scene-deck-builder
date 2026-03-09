import { useEffect, useRef } from 'react';
import type { ExportAudioPlan, ExportAudioEvent } from '../../utils/exportAudioPlan';
import { AudioManager } from '../../utils/audioUtils';

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

function buildSequenceAudioEventKey(event: ExportAudioEvent) {
  return [
    event.sourceType,
    event.assetId || '',
    event.sceneId || '',
    event.groupId || '',
    event.cutId || '',
    event.sourcePath,
    Number.isFinite(event.sourceStartSec) ? event.sourceStartSec.toFixed(3) : '0.000',
    Number.isFinite(event.sourceOffsetSec as number) ? (event.sourceOffsetSec as number).toFixed(3) : '0.000',
  ].join('|');
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
  const sequenceAudioManagersRef = useRef<Map<string, AudioManager>>(new Map());
  const sequenceAudioLoadIdsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    return () => {
      for (const manager of sequenceAudioManagersRef.current.values()) {
        manager.pause();
        manager.unload();
        manager.dispose();
      }
      sequenceAudioManagersRef.current.clear();
      sequenceAudioLoadIdsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (isSingleMode || itemsLength === 0) {
      for (const manager of sequenceAudioManagersRef.current.values()) {
        manager.pause();
        manager.unload();
        manager.dispose();
      }
      sequenceAudioManagersRef.current.clear();
      sequenceAudioLoadIdsRef.current.clear();
      return;
    }

    const clampedAbsoluteTime = Math.max(0, absoluteTime);
    const activeEntries = previewAudioPlan.events
      .map((event) => ({ event, key: buildSequenceAudioEventKey(event) }))
      .filter(({ event }) => {
        const start = event.timelineStartSec;
        const end = event.timelineStartSec + event.durationSec;
        return clampedAbsoluteTime >= start && clampedAbsoluteTime < end;
      });
    const activeKeys = new Set(activeEntries.map((entry) => entry.key));

    for (const [key, manager] of sequenceAudioManagersRef.current.entries()) {
      if (activeKeys.has(key)) continue;
      manager.stop();
      manager.unload();
      manager.dispose();
      sequenceAudioManagersRef.current.delete(key);
      sequenceAudioLoadIdsRef.current.delete(key);
    }

    for (const { event, key } of activeEntries) {
      const sourcePath = event.sourcePath;
      if (!sourcePath) continue;

      let manager = sequenceAudioManagersRef.current.get(key);
      if (!manager || manager.isDisposed()) {
        manager = new AudioManager();
        sequenceAudioManagersRef.current.set(key, manager);
        sequenceAudioLoadIdsRef.current.set(key, manager.getLoadId());
      }

      const gain = Number.isFinite(event.gain) ? Math.max(0, event.gain as number) : 1;
      const mixedVolume = Math.max(0, Math.min(1, (globalMuted ? 0 : globalVolume) * gain));
      manager.setVolume(mixedVolume);
      const shouldPlayEvent = isPlaying && (!isBuffering || event.sourceType !== 'video');
      const sourceOffsetSec = Number.isFinite(event.sourceOffsetSec) ? (event.sourceOffsetSec as number) : 0;
      const playPosition = Math.max(0, clampedAbsoluteTime - event.timelineStartSec + sourceOffsetSec);

      if (!manager.isLoaded()) {
        const startLoadId = manager.getLoadId() + 1;
        sequenceAudioLoadIdsRef.current.set(key, startLoadId);
        void manager.load(sourcePath).then((loaded) => {
          const expectedLoadId = sequenceAudioLoadIdsRef.current.get(key);
          if (!loaded || expectedLoadId !== startLoadId) return;
          if (!sequenceAudioManagersRef.current.has(key)) return;
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
    isSingleMode,
    itemsLength,
    absoluteTime,
    isPlaying,
    isBuffering,
    previewAudioPlan,
    globalMuted,
    globalVolume,
  ]);
}
